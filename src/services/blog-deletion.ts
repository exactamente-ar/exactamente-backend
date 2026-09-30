import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { blogComments, blogImages, blogPosts, blogVotes } from '@/db/schema';
import { storage } from '@/services/storage';

type DeleteablePost = {
  id: string;
  comments: { id: string; status: string }[];
};

/** Subconjunto mínimo de un comentario para resolver el árbol y decidir el borrado. */
type CommentNode = {
  id: string;
  parentId: string | null;
  status: string;
};

/**
 * Borra los objetos de storage de un set de keys. Best-effort: si alguno ya no
 * existe no falla, y un error de storage no debe tirar abajo un borrado de DB ya
 * commiteado.
 */
export async function deleteBlogStorageObjects(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => storage.deleteFile(key).catch(() => {})));
}

/**
 * Borra un post aplicando la política de árbol del blog.
 *
 * - Si todos sus comentarios ya están `deleted`, hace hard delete de todo el
 *   subárbol: borra físicamente las imágenes de storage, y elimina votes,
 *   images y el propio post.
 * - Si queda algún comentario activo, hace soft delete: borra las imágenes del
 *   post, marca `status: deleted` y conserva el árbol de comentarios.
 *
 * Los objetos de storage se borran **después** de un commit exitoso: si un
 * statement posterior falla (o se corta la conexión), la DB hace rollback y las
 * filas sobreviven; borrarlos dentro de la transacción dejaría URLs rotas.
 */
export async function deleteBlogPost(post: DeleteablePost): Promise<void> {
  const allCommentsDeleted = post.comments.every((c) => c.status === 'deleted');
  const targetIds = [post.id, ...post.comments.map((c) => c.id)];
  const hasTargets = targetIds.length > 0;

  const allImages = hasTargets
    ? await db.query.blogImages.findMany({
        where: inArray(blogImages.targetId, targetIds),
      })
    : [];

  const postImages = allImages.filter(
    (img) => img.targetType === 'post' && img.targetId === post.id,
  );

  const keysToDelete = (allCommentsDeleted ? allImages : postImages).map((img) => img.r2Key);

  await db.transaction(async (tx) => {
    if (allCommentsDeleted) {
      if (hasTargets) {
        await tx.delete(blogVotes).where(inArray(blogVotes.targetId, targetIds));
        await tx.delete(blogImages).where(inArray(blogImages.targetId, targetIds));
      }
      await tx.delete(blogPosts).where(eq(blogPosts.id, post.id));
    } else {
      await tx
        .update(blogPosts)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(blogPosts.id, post.id));
      if (postImages.length > 0) {
        await tx
          .delete(blogImages)
          .where(and(eq(blogImages.targetType, 'post'), eq(blogImages.targetId, post.id)));
      }
    }
  });

  await deleteBlogStorageObjects(keysToDelete);
}

/**
 * Descendientes de un comentario dentro de una lista que incluye todos los del
 * post. Orden postorder: los nietos antes de los padres, raíz excluida.
 */
export function getCommentDescendants(comments: CommentNode[], parentId: string): CommentNode[] {
  const children = comments.filter((c) => c.parentId === parentId);
  return children.flatMap((c) => [c, ...getCommentDescendants(comments, c.id)]);
}

/**
 * Borra un comentario aplicando la política de árbol del blog.
 *
 * - Si todos sus descendientes ya están `deleted`, hace hard delete del
 *   subárbol (comentario + descendientes): borra las imágenes de storage y
 *   elimina votes, images y los comentarios.
 * - Si queda algún descendiente activo, hace soft delete: borra las imágenes
 *   del comentario raíz, marca `status: deleted` y conserva las respuestas.
 *
 * Igual que `deleteBlogPost`, el borrado de storage va después del commit.
 */
export async function deleteBlogComment(
  comment: { id: string },
  postComments: CommentNode[],
): Promise<void> {
  const descendants = getCommentDescendants(postComments, comment.id);
  const allDescendantsDeleted = descendants.every((c) => c.status === 'deleted');
  const targetIds = [comment.id, ...descendants.map((c) => c.id)];
  const hasTargets = targetIds.length > 0;

  const commentImages = hasTargets
    ? await db.query.blogImages.findMany({
        where: and(eq(blogImages.targetType, 'comment'), inArray(blogImages.targetId, targetIds)),
      })
    : [];

  const keysToDelete = (
    allDescendantsDeleted
      ? commentImages
      : commentImages.filter((img) => img.targetId === comment.id)
  ).map((img) => img.r2Key);

  await db.transaction(async (tx) => {
    if (allDescendantsDeleted) {
      if (hasTargets) {
        await tx.delete(blogVotes).where(inArray(blogVotes.targetId, targetIds));
        await tx
          .delete(blogImages)
          .where(
            and(eq(blogImages.targetType, 'comment'), inArray(blogImages.targetId, targetIds)),
          );
        await tx.delete(blogComments).where(inArray(blogComments.id, targetIds));
      }
    } else {
      await tx
        .update(blogComments)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(blogComments.id, comment.id));
      if (commentImages.some((img) => img.targetId === comment.id)) {
        await tx
          .delete(blogImages)
          .where(and(eq(blogImages.targetType, 'comment'), eq(blogImages.targetId, comment.id)));
      }
    }
  });

  await deleteBlogStorageObjects(keysToDelete);
}

/**
 * Recopila los targets e imágenes del blog de una materia para preparar su borrado.
 * `blog_images` y `blog_votes` referencian sus targets por texto plano (sin FK),
 * así que no caen con el cascade de BD y hay que borrarlos explícitamente junto
 * con sus objetos en R2.
 */
export async function prepareSubjectBlogDeletion(
  subjectId: string,
): Promise<{ targetIds: string[]; r2Keys: string[] }> {
  const posts = await db.query.blogPosts.findMany({
    where: eq(blogPosts.subjectId, subjectId),
    columns: { id: true },
  });
  const postIds = posts.map((p) => p.id);
  const comments = postIds.length
    ? await db.query.blogComments.findMany({
        where: inArray(blogComments.postId, postIds),
        columns: { id: true },
      })
    : [];
  const targetIds = [...postIds, ...comments.map((c) => c.id)];
  const images = targetIds.length
    ? await db.query.blogImages.findMany({
        where: inArray(blogImages.targetId, targetIds),
        columns: { r2Key: true },
      })
    : [];
  const r2Keys = images.map((img) => img.r2Key);
  return { targetIds, r2Keys };
}

/**
 * Borra las filas polimórficas (votos e imágenes) dentro de una transacción.
 */
export async function deletePolymorphicBlogData(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  targetIds: string[],
): Promise<void> {
  if (targetIds.length > 0) {
    await tx.delete(blogVotes).where(inArray(blogVotes.targetId, targetIds));
    await tx.delete(blogImages).where(inArray(blogImages.targetId, targetIds));
  }
}

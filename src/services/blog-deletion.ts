import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { blogComments, blogImages, blogPosts, blogVotes } from '@/db/schema';
import { storage } from '@/services/storage';
import type { CommentRow } from '@/services/blogs';

type DeleteablePost = {
  id: string;
  comments: { id: string; status: string }[];
};

/**
 * Borra un post aplicando la política de árbol del blog.
 *
 * - Si todos sus comentarios ya están `deleted`, hace hard delete de todo el
 *   subárbol: borra físicamente las imágenes de storage, y elimina votes,
 *   images y el propio post.
 * - Si queda algún comentario activo, hace soft delete: borra las imágenes del
 *   post, marca `status: deleted` y conserva el árbol de comentarios.
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

  await db.transaction(async (tx) => {
    if (allCommentsDeleted) {
      for (const img of allImages) {
        await storage.deleteFile(img.r2Key);
      }
      if (hasTargets) {
        await tx.delete(blogVotes).where(inArray(blogVotes.targetId, targetIds));
        await tx.delete(blogImages).where(inArray(blogImages.targetId, targetIds));
      }
      await tx.delete(blogPosts).where(eq(blogPosts.id, post.id));
    } else {
      for (const img of postImages) {
        await storage.deleteFile(img.r2Key);
      }
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
}

/**
 * Descendientes de un comentario dentro de una lista que incluye todos los del
 * post. Orden postorder: los nietos antes de los padres, raíz excluida.
 */
export function getCommentDescendants(comments: CommentRow[], parentId: string): CommentRow[] {
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
 */
export async function deleteBlogComment(
  comment: CommentRow,
  postComments: CommentRow[],
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

  await db.transaction(async (tx) => {
    if (allDescendantsDeleted) {
      for (const img of commentImages) {
        await storage.deleteFile(img.r2Key);
      }
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
      const rootImages = commentImages.filter((img) => img.targetId === comment.id);
      for (const img of rootImages) {
        await storage.deleteFile(img.r2Key);
      }
      await tx
        .update(blogComments)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(blogComments.id, comment.id));
      if (rootImages.length > 0) {
        await tx
          .delete(blogImages)
          .where(and(eq(blogImages.targetType, 'comment'), eq(blogImages.targetId, comment.id)));
      }
    }
  });
}

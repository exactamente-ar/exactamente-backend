import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { and, eq, gte, asc, desc, sql, inArray } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { db } from '@/db';
import {
  blogSubtopics,
  blogPosts,
  blogImages,
  blogComments,
  blogVotes,
  subjects,
  users,
} from '@/db/schema';
import { rateLimit } from '@/middleware/rateLimit';
import { verifyToken, optionalAuth } from '@/middleware/auth';
import { containsForbiddenWord } from '@/middleware/blacklist';
import { createPostSchema, createCommentSchema, voteSchema } from '@/validators/blogs.validators';
import { storage } from '@/services/storage';
import { applyVote } from '@/services/votes';
import {
  isAllowedImageMime,
  extensionForMime,
  stripImageMetadata,
  BLOG_IMAGE_MAX_BYTES,
  BLOG_IMAGE_MAX_COUNT,
} from '@/services/images';
import {
  BlogPostSchema,
  BlogResponseSchema,
  BlogVoteResponseSchema,
  BlogCommentSchema,
} from '@/schemas';
import { json, errors, bearerAuth } from '@/openapi/helpers';
import type { AppContext, JwtPayload } from '@/types';

// Mismo presupuesto que el listado de materias: lectura pública del blog.
const publicReadLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 }); // 100 req/min
// Crear posts es una escritura: cuota propia y más estricta.
const postWriteLimit = rateLimit({ limit: 30, windowMs: 60 * 1000 }); // 30 req/min

// Ventana de tiempo para el orden "top" (AD-5). Decisión de producto (OQ-2):
// 30 días. Mantiene la paginación estable y evita que posts viejos congelen el
// feed. Es una constante, se cambia en un renglón si el equipo decide otro rango.
const TOP_WINDOW_DAYS = 30;

type PostRow = typeof blogPosts.$inferSelect;
type CommentRow = typeof blogComments.$inferSelect;

const DELETED_BODY = '[Eliminado]';

function commentToResponse(
  comment: CommentRow,
  authorName: string | null,
  images: BlogImageRow[],
  userId: string | null,
  myVote = 0,
) {
  const deleted = comment.status === 'deleted';
  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    body: deleted ? DELETED_BODY : comment.body,
    authority: comment.authority,
    status: comment.status,
    netScore: comment.netScore,
    depth: comment.depth,
    createdAt: comment.createdAt.toISOString(),
    author:
      deleted || comment.authority === 'anonymous'
        ? null
        : authorName
          ? { name: authorName }
          : null,
    images: deleted
      ? []
      : images.map((img) => ({ id: img.id, url: storage.getPublicUrl(img.r2Key) })),
    mine: userId !== null && userId === comment.authorId,
    myVote,
  };
}

type BlogImageRow = typeof blogImages.$inferSelect;

function postToResponse(
  post: PostRow,
  authorName: string | null,
  images: BlogImageRow[],
  comments: {
    row: CommentRow;
    authorName: string | null;
    images: BlogImageRow[];
    myVote: number;
  }[],
  userId: string | null,
  myVote = 0,
) {
  const deleted = post.status === 'deleted';
  return {
    id: post.id,
    subtopicId: post.subtopicId,
    body: deleted ? DELETED_BODY : post.body,
    authority: post.authority,
    status: post.status,
    netScore: post.netScore,
    createdAt: post.createdAt.toISOString(),
    // El autor real no se expone en contenido anónimo o eliminado (FR-10 / AD-2).
    author:
      deleted || post.authority === 'anonymous' ? null : authorName ? { name: authorName } : null,
    images: deleted
      ? []
      : images.map((img) => ({ id: img.id, url: storage.getPublicUrl(img.r2Key) })),
    comments: comments.map((c) =>
      commentToResponse(c.row, c.authorName, c.images, userId, c.myVote),
    ),
    mine: userId !== null && userId === post.authorId,
    myVote,
  };
}

const app = new Hono<AppContext>();

// ─── GET /:subjectId — blog de una materia ────────────────────────────────────

app.get(
  '/:subjectId',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Blog de una materia',
    description:
      'Devuelve los subtemas (con el "general" por defecto) y los posts del blog. ' +
      'Lectura pública. Posts ordenados por votos (`net_score`), con una ventana ' +
      `${TOP_WINDOW_DAYS} días para que la paginación sea estable. Los comentarios ` +
      'se ordenan por votos dentro de sus hermanos.',
    responses: {
      200: json(BlogResponseSchema, 'Blog con sus subtemas y posts'),
      ...errors(404),
    },
  }),
  publicReadLimit,
  optionalAuth,
  async (c) => {
    const subjectId = c.req.param('subjectId');
    const userId = (c.get('user') as JwtPayload | undefined)?.sub ?? null;

    const subject = await db.query.subjects.findFirst({
      where: eq(subjects.id, subjectId),
    });
    if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

    const subtopics = await db.query.blogSubtopics.findMany({
      where: eq(blogSubtopics.subjectId, subjectId),
      orderBy: [asc(blogSubtopics.name)],
    });

    const windowStart = new Date(Date.now() - TOP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const posts = await db.query.blogPosts.findMany({
      where: and(eq(blogPosts.subjectId, subjectId), gte(blogPosts.createdAt, windowStart)),
      orderBy: [desc(blogPosts.netScore), desc(blogPosts.createdAt), desc(blogPosts.id)],
      with: {
        author: true,
        comments: {
          with: { author: true },
          orderBy: [desc(blogComments.netScore), desc(blogComments.createdAt)],
        },
      },
    });

    const targetIds = [
      ...posts.map((p) => p.id),
      ...posts.flatMap((p) => p.comments.map((c) => c.id)),
    ];

    const images =
      targetIds.length > 0
        ? await db.query.blogImages.findMany({
            where: inArray(blogImages.targetId, targetIds),
          })
        : [];

    const imageMap = new Map<string, (typeof blogImages.$inferSelect)[]>();
    for (const img of images) {
      const key = `${img.targetType}:${img.targetId}`;
      if (!imageMap.has(key)) imageMap.set(key, []);
      imageMap.get(key)!.push(img);
    }

    // Votos del token actual sobre los posts y comentarios del blog, para
    // hidratar `myVote` en la respuesta (sin token, todo queda en 0).
    const voteMap = new Map<string, number>();
    if (userId && targetIds.length > 0) {
      const votes = await db.query.blogVotes.findMany({
        where: and(eq(blogVotes.userId, userId), inArray(blogVotes.targetId, targetIds)),
      });
      for (const vote of votes) {
        voteMap.set(`${vote.targetType}:${vote.targetId}`, vote.value);
      }
    }

    return c.json({
      subjectId,
      subtopics: subtopics.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        isDefault: s.isDefault,
      })),
      posts: posts.map((p) =>
        postToResponse(
          p,
          p.author?.displayName ?? null,
          imageMap.get(`post:${p.id}`) ?? [],
          p.comments.map((cmt) => ({
            row: cmt as CommentRow,
            authorName: cmt.author?.displayName ?? null,
            images: imageMap.get(`comment:${cmt.id}`) ?? [],
            myVote: voteMap.get(`comment:${cmt.id}`) ?? 0,
          })),
          userId,
          voteMap.get(`post:${p.id}`) ?? 0,
        ),
      ),
    });
  },
);

// ─── POST /:subjectId/posts — crear un post ───────────────────────────────────

app.post(
  '/:subjectId/posts',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Crear un post en el blog',
    description:
      'Requiere autenticación. Crea un post en el subtema elegido con autoría ' +
      'visible o anónima. Multipart: `subtopicId`, `authority`, `body` (texto) y ' +
      `hasta ${BLOG_IMAGE_MAX_COUNT} imágenes (jpeg/png/webp). El texto pasa por ` +
      'la blacklist y las imágenes se re-encodifican sin metadata EXIF.',
    security: bearerAuth,
    responses: {
      201: json(BlogPostSchema, 'Post creado'),
      ...errors(400, 401, 404),
    },
  }),
  postWriteLimit,
  verifyToken,
  async (c) => {
    const subjectId = c.req.param('subjectId');
    const formData = await c.req.formData();

    const subtopicId = formData.get('subtopicId') as string | null;
    const authority = formData.get('authority') as string | null;
    const body = formData.get('body') as string | null;
    const imageFiles = formData.getAll('images').filter((f): f is File => f instanceof File);

    const parsed = createPostSchema.safeParse({ subtopicId, body, authority });
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    if (containsForbiddenWord(parsed.data.body)) {
      return c.json({ error: 'El contenido no cumple con las normas de la comunidad' }, 400);
    }

    if (imageFiles.length > BLOG_IMAGE_MAX_COUNT) {
      return c.json({ error: `Máximo ${BLOG_IMAGE_MAX_COUNT} imágenes por post` }, 400);
    }

    for (const file of imageFiles) {
      if (!isAllowedImageMime(file.type)) {
        return c.json({ error: 'Solo se aceptan imágenes JPEG, PNG o WebP' }, 400);
      }
      if (file.size > BLOG_IMAGE_MAX_BYTES) {
        return c.json({ error: 'Cada imagen no puede superar los 5MB' }, 400);
      }
    }

    const subject = await db.query.subjects.findFirst({
      where: eq(subjects.id, subjectId),
    });
    if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

    const subtopic = await db.query.blogSubtopics.findFirst({
      where: and(
        eq(blogSubtopics.id, parsed.data.subtopicId),
        eq(blogSubtopics.subjectId, subjectId),
      ),
    });
    if (!subtopic) return c.json({ error: 'Subtema no encontrado' }, 404);

    const user = c.get('user');
    const postId = crypto.randomUUID();

    const imageRows: {
      id: string;
      targetType: 'post';
      targetId: string;
      r2Key: string;
      mimeType: string;
      position: number;
      createdAt: Date;
    }[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const original = Buffer.from(await file.arrayBuffer());
      const stripped = await stripImageMetadata(original);
      const imageId = crypto.randomUUID();
      const key = `blog-posts/${postId}/${imageId}.${extensionForMime(file.type)}`;
      await storage.uploadFile(key, stripped, file.type);
      imageRows.push({
        id: imageId,
        targetType: 'post',
        targetId: postId,
        r2Key: key,
        mimeType: file.type,
        position: i,
        createdAt: new Date(),
      });
    }

    const [post] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(blogPosts)
        .values({
          id: postId,
          subjectId,
          subtopicId: parsed.data.subtopicId,
          authorId: user.sub,
          body: parsed.data.body,
          authority: parsed.data.authority,
          netScore: 0,
        })
        .returning();

      if (imageRows.length > 0) {
        await tx.insert(blogImages).values(imageRows);
      }

      return [created];
    });

    const authorRecord = await db.query.users.findFirst({
      where: eq(users.id, user.sub),
    });

    return c.json(
      postToResponse(post, authorRecord?.displayName ?? null, imageRows, [], user.sub),
      201,
    );
  },
);

// ─── POST /:subjectId/posts/:postId/vote — votar un post ──────────────────────

app.post(
  '/:subjectId/posts/:postId/vote',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Votar un post',
    description:
      'Requiere autenticación. Upvote (`value: 1`) o downvote (`value: -1`). ' +
      'Votar de nuevo con el mismo valor quita el voto; con el opuesto lo cambia. ' +
      'El autor no puede votar su propio post.',
    security: bearerAuth,
    responses: {
      200: json(BlogVoteResponseSchema, 'netScore y voto resultante'),
      ...errors(400, 401, 403, 404),
    },
  }),
  postWriteLimit,
  verifyToken,
  zValidator('json', voteSchema),
  async (c) => {
    const { postId } = c.req.param() as { postId: string };
    const { value } = c.req.valid('json');
    const user = c.get('user');

    const post = await db.query.blogPosts.findFirst({
      where: eq(blogPosts.id, postId),
    });
    if (!post) return c.json({ error: 'Post no encontrado' }, 404);
    if (post.status === 'deleted') {
      return c.json({ error: 'No se puede votar una publicación eliminada' }, 400);
    }
    if (post.authorId === user.sub) {
      return c.json({ error: 'No podés votar tu propio post' }, 403);
    }

    const result = await db.transaction((tx) =>
      applyVote(tx, user.sub, 'post', postId, value, async (delta) => {
        const [updated] = await tx
          .update(blogPosts)
          .set({ netScore: sql`${blogPosts.netScore} + ${delta}` })
          .where(eq(blogPosts.id, postId))
          .returning();
        return updated.netScore;
      }),
    );

    return c.json(result);
  },
);

// ─── POST /:subjectId/posts/:postId/comments — comentar ───────────────────────

app.post(
  '/:subjectId/posts/:postId/comments',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Comentar un post o responder a un comentario',
    description:
      'Requiere autenticación. Crea un comentario anidado (hasta 20 niveles). ' +
      '`parentId` opcional para responder a otro comentario.',
    security: bearerAuth,
    responses: {
      201: json(BlogCommentSchema, 'Comentario creado'),
      ...errors(400, 401, 404),
    },
  }),
  postWriteLimit,
  verifyToken,
  async (c) => {
    const { postId } = c.req.param() as { postId: string };
    const formData = await c.req.formData();

    const parentId = formData.get('parentId') as string | null;
    const authority = formData.get('authority') as string | null;
    const body = formData.get('body') as string | null;
    const imageFiles = formData.getAll('images').filter((f): f is File => f instanceof File);

    const parsed = createCommentSchema.safeParse({ parentId, body, authority });
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    if (containsForbiddenWord(parsed.data.body)) {
      return c.json({ error: 'El contenido no cumple con las normas de la comunidad' }, 400);
    }

    if (imageFiles.length > BLOG_IMAGE_MAX_COUNT) {
      return c.json({ error: `Máximo ${BLOG_IMAGE_MAX_COUNT} imágenes por comentario` }, 400);
    }

    for (const file of imageFiles) {
      if (!isAllowedImageMime(file.type)) {
        return c.json({ error: 'Solo se aceptan imágenes JPEG, PNG o WebP' }, 400);
      }
      if (file.size > BLOG_IMAGE_MAX_BYTES) {
        return c.json({ error: 'Cada imagen no puede superar los 5MB' }, 400);
      }
    }

    const user = c.get('user');

    const post = await db.query.blogPosts.findFirst({
      where: eq(blogPosts.id, postId),
    });
    if (!post) return c.json({ error: 'Post no encontrado' }, 404);

    let depth = 1;

    if (parsed.data.parentId) {
      const parent = await db.query.blogComments.findFirst({
        where: and(eq(blogComments.id, parsed.data.parentId), eq(blogComments.postId, postId)),
      });
      if (!parent) return c.json({ error: 'Comentario no encontrado' }, 404);
      if (parent.depth >= 20) {
        return c.json({ error: 'Máximo 20 niveles de profundidad' }, 400);
      }
      depth = parent.depth + 1;
    }

    const commentId = crypto.randomUUID();

    const imageRows: {
      id: string;
      targetType: 'comment';
      targetId: string;
      r2Key: string;
      mimeType: string;
      position: number;
      createdAt: Date;
    }[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const original = Buffer.from(await file.arrayBuffer());
      const stripped = await stripImageMetadata(original);
      const imageId = crypto.randomUUID();
      const key = `blog-comments/${commentId}/${imageId}.${extensionForMime(file.type)}`;
      await storage.uploadFile(key, stripped, file.type);
      imageRows.push({
        id: imageId,
        targetType: 'comment',
        targetId: commentId,
        r2Key: key,
        mimeType: file.type,
        position: i,
        createdAt: new Date(),
      });
    }

    const [comment] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(blogComments)
        .values({
          id: commentId,
          postId,
          parentId: parsed.data.parentId ?? null,
          authorId: user.sub,
          body: parsed.data.body,
          authority: parsed.data.authority,
          netScore: 0,
          depth,
        })
        .returning();

      if (imageRows.length > 0) {
        await tx.insert(blogImages).values(imageRows);
      }
      return [created];
    });

    const authorRecord = await db.query.users.findFirst({
      where: eq(users.id, user.sub),
    });

    return c.json(
      commentToResponse(comment, authorRecord?.displayName ?? null, imageRows, user.sub),
      201,
    );
  },
);

// ─── POST /:subjectId/posts/:postId/comments/:commentId/vote — votar comentario

app.post(
  '/:subjectId/posts/:postId/comments/:commentId/vote',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Votar un comentario',
    description: 'Requiere autenticación. Misma semántica de toggle que votar un post.',
    security: bearerAuth,
    responses: {
      200: json(BlogVoteResponseSchema, 'netScore y voto resultante'),
      ...errors(400, 401, 403, 404),
    },
  }),
  postWriteLimit,
  verifyToken,
  zValidator('json', voteSchema),
  async (c) => {
    const { commentId } = c.req.param() as { commentId: string };
    const { value } = c.req.valid('json');
    const user = c.get('user');

    const comment = await db.query.blogComments.findFirst({
      where: eq(blogComments.id, commentId),
    });
    if (!comment) return c.json({ error: 'Comentario no encontrado' }, 404);
    if (comment.status === 'deleted') {
      return c.json({ error: 'No se puede votar un comentario eliminado' }, 400);
    }
    if (comment.authorId === user.sub) {
      return c.json({ error: 'No podés votar tu propio comentario' }, 403);
    }

    const result = await db.transaction((tx) =>
      applyVote(tx, user.sub, 'comment', commentId, value, async (delta) => {
        const [updated] = await tx
          .update(blogComments)
          .set({ netScore: sql`${blogComments.netScore} + ${delta}` })
          .where(eq(blogComments.id, commentId))
          .returning();
        return updated.netScore;
      }),
    );

    return c.json(result);
  },
);

// ─── DELETE /:subjectId/posts/:postId — borrar un post (soft delete) ──────────

app.delete(
  '/:subjectId/posts/:postId',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Borrar un post',
    description:
      'Requiere autenticación. El autor o un admin pueden borrarlo. Soft delete: ' +
      'borra físicamente las imágenes de R2, marca `status: deleted` y conserva el ' +
      'árbol de comentarios.',
    security: bearerAuth,
    responses: {
      204: { description: 'Post eliminado' },
      ...errors(401, 403, 404),
    },
  }),
  verifyToken,
  async (c) => {
    const { postId } = c.req.param() as { postId: string };
    const user = c.get('user');

    const post = await db.query.blogPosts.findFirst({
      where: eq(blogPosts.id, postId),
      with: { comments: { columns: { id: true, status: true } } },
    });
    if (!post) return c.json({ error: 'Post no encontrado' }, 404);

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (post.authorId !== user.sub && !isAdmin) {
      return c.json({ error: 'No podés borrar un post ajeno' }, 403);
    }

    const allCommentsDeleted = post.comments.every((c) => c.status === 'deleted');
    const targetIds = [postId, ...post.comments.map((c) => c.id)];

    const allImages =
      targetIds.length > 0
        ? await db.query.blogImages.findMany({
            where: inArray(blogImages.targetId, targetIds),
          })
        : [];

    const postImages = allImages.filter(
      (img) => img.targetType === 'post' && img.targetId === postId,
    );

    await db.transaction(async (tx) => {
      if (allCommentsDeleted) {
        for (const img of allImages) {
          await storage.deleteFile(img.r2Key);
        }
        if (targetIds.length > 0) {
          await tx.delete(blogVotes).where(inArray(blogVotes.targetId, targetIds));
          await tx.delete(blogImages).where(inArray(blogImages.targetId, targetIds));
        }
        await tx.delete(blogPosts).where(eq(blogPosts.id, postId));
      } else {
        for (const img of postImages) {
          await storage.deleteFile(img.r2Key);
        }
        await tx
          .update(blogPosts)
          .set({ status: 'deleted', updatedAt: new Date() })
          .where(eq(blogPosts.id, postId));
        if (postImages.length > 0) {
          await tx
            .delete(blogImages)
            .where(and(eq(blogImages.targetType, 'post'), eq(blogImages.targetId, postId)));
        }
      }
    });

    return c.body(null, 204);
  },
);

// ─── DELETE /:subjectId/posts/:postId/comments/:commentId — borrar comentario ──

app.delete(
  '/:subjectId/posts/:postId/comments/:commentId',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Borrar un comentario',
    description:
      'Requiere autenticación. El autor o un admin pueden borrarlo. Soft delete: ' +
      'marca `status: deleted` y conserva las respuestas (hijos) en el árbol.',
    security: bearerAuth,
    responses: {
      204: { description: 'Comentario eliminado' },
      ...errors(401, 403, 404),
    },
  }),
  verifyToken,
  async (c) => {
    const { commentId } = c.req.param() as { commentId: string };
    const user = c.get('user');

    const comment = await db.query.blogComments.findFirst({
      where: eq(blogComments.id, commentId),
    });
    if (!comment) return c.json({ error: 'Comentario no encontrado' }, 404);

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (comment.authorId !== user.sub && !isAdmin) {
      return c.json({ error: 'No podés borrar un comentario ajeno' }, 403);
    }

    const commentImages = await db.query.blogImages.findMany({
      where: and(eq(blogImages.targetType, 'comment'), eq(blogImages.targetId, commentId)),
    });

    await db.transaction(async (tx) => {
      for (const img of commentImages) {
        await storage.deleteFile(img.r2Key);
      }

      await tx
        .update(blogComments)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(blogComments.id, commentId));

      if (commentImages.length > 0) {
        await tx
          .delete(blogImages)
          .where(and(eq(blogImages.targetType, 'comment'), eq(blogImages.targetId, commentId)));
      }
    });

    return c.body(null, 204);
  },
);

export default app;

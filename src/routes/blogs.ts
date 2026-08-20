import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { and, eq, asc, desc, sql, inArray } from 'drizzle-orm';
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
import { applyVote } from '@/services/votes';
import {
  validateBlogImages,
  uploadBlogImages,
  deleteBlogImageObjects,
  BlogImageError,
  BLOG_ATTACHMENT_MAX_COUNT,
  type BlogImageRow,
} from '@/services/images';
import { commentToResponse, postToResponse } from '@/services/blogs';
import type { CommentRow } from '@/services/blogs';
import { deleteBlogPost, deleteBlogComment } from '@/services/blog-deletion';
import {
  BlogPostSchema,
  BlogResponseSchema,
  BlogVoteResponseSchema,
  BlogCommentSchema,
} from '@/schemas';
import { json, errors, bearerAuth } from '@/openapi/helpers';
import type { AppContext, JwtPayload } from '@/types';

const publicReadLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 });
// Presupuestos de escritura separados: posts+comentarios por un lado y votos por
// el otro. Un voto es un request cada uno (y un toggle cuesta dos), así que si
// compartieran el Map con las escrituras, upvotear un hilo te dejaría sin poder
// escribir un post por el resto del minuto.
const postWriteIpLimit = rateLimit({ limit: 30, windowMs: 60 * 1000 });
// Las escrituras se limitan también por usuario: una IP rotativa no tendría
// techo si solo contara la IP. Corre después de verifyToken para tener el sub.
const postWriteUserLimit = rateLimit({ limit: 30, windowMs: 60 * 1000, keyByUser: true });
const voteWriteIpLimit = rateLimit({ limit: 60, windowMs: 60 * 1000 });
const voteWriteUserLimit = rateLimit({ limit: 60, windowMs: 60 * 1000, keyByUser: true });

const app = new Hono<AppContext>();

app.get(
  '/:subjectId',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Blog de una materia',
    description:
      'Devuelve los subtemas (con el "general" por defecto) y los posts del blog. ' +
      'Lectura pública. Posts ordenados por votos (`net_score`), desempatando por ' +
      'fecha e id; los comentarios se ordenan por votos dentro de sus hermanos.',
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

    const posts = await db.query.blogPosts.findMany({
      where: eq(blogPosts.subjectId, subjectId),
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

app.post(
  '/:subjectId/posts',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Crear un post en el blog',
    description:
      'Requiere autenticación. Crea un post en el subtema elegido con autoría ' +
      'visible o anónima. Multipart: `subtopicId`, `authority`, `body` (texto) y ' +
      `hasta ${BLOG_ATTACHMENT_MAX_COUNT} adjuntos (imágenes jpeg/png/webp o PDFs). ` +
      'El texto pasa por la blacklist; las imágenes se re-encodifican sin metadata ' +
      'EXIF y los PDFs se suben tal cual.',
    security: bearerAuth,
    responses: {
      201: json(BlogPostSchema, 'Post creado'),
      ...errors(400, 401, 404),
    },
  }),
  postWriteIpLimit,
  verifyToken,
  postWriteUserLimit,
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

    const imageError = validateBlogImages(imageFiles, 'post');
    if (imageError) return c.json({ error: imageError }, 400);

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

    let imageRows: BlogImageRow[] = [];
    try {
      imageRows = await uploadBlogImages('post', postId, imageFiles);
    } catch (e) {
      if (e instanceof BlogImageError) return c.json({ error: e.message }, 400);
      throw e;
    }

    const [post] = await db
      .transaction(async (tx) => {
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
      })
      .catch(async (e) => {
        await deleteBlogImageObjects(imageRows);
        throw e;
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
  voteWriteIpLimit,
  verifyToken,
  voteWriteUserLimit,
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
  postWriteIpLimit,
  verifyToken,
  postWriteUserLimit,
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

    const imageError = validateBlogImages(imageFiles, 'comentario');
    if (imageError) return c.json({ error: imageError }, 400);

    const user = c.get('user');

    const post = await db.query.blogPosts.findFirst({
      where: eq(blogPosts.id, postId),
    });
    if (!post) return c.json({ error: 'Post no encontrado' }, 404);
    if (post.status === 'deleted') {
      return c.json({ error: 'No se puede comentar una publicación eliminada' }, 400);
    }

    let depth = 1;

    if (parsed.data.parentId) {
      const parent = await db.query.blogComments.findFirst({
        where: and(eq(blogComments.id, parsed.data.parentId), eq(blogComments.postId, postId)),
      });
      if (!parent) return c.json({ error: 'Comentario no encontrado' }, 404);
      if (parent.status === 'deleted') {
        return c.json({ error: 'No se puede responder a un comentario eliminado' }, 400);
      }
      if (parent.depth >= 20) {
        return c.json({ error: 'Máximo 20 niveles de profundidad' }, 400);
      }
      depth = parent.depth + 1;
    }

    const commentId = crypto.randomUUID();

    let imageRows: BlogImageRow[] = [];
    try {
      imageRows = await uploadBlogImages('comment', commentId, imageFiles);
    } catch (e) {
      if (e instanceof BlogImageError) return c.json({ error: e.message }, 400);
      throw e;
    }

    const [comment] = await db
      .transaction(async (tx) => {
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
      })
      .catch(async (e) => {
        await deleteBlogImageObjects(imageRows);
        throw e;
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
  voteWriteIpLimit,
  verifyToken,
  voteWriteUserLimit,
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

app.delete(
  '/:subjectId/posts/:postId',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Borrar un post',
    description:
      'Requiere autenticación. El autor o un admin pueden borrarlo. ' +
      'Soft delete (marca `status: deleted`) si todavía hay comentarios activos; ' +
      'borra el árbol completo (posts, comentarios, votos e imágenes) si todos ' +
      'los comentarios ya están eliminados.',
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

    await deleteBlogPost(post);

    return c.body(null, 204);
  },
);

app.delete(
  '/:subjectId/posts/:postId/comments/:commentId',
  describeRoute({
    tags: ['Blogs'],
    summary: 'Borrar un comentario',
    description:
      'Requiere autenticación. El autor o un admin pueden borrarlo. ' +
      'Soft delete (marca `status: deleted`) si todavía hay respuestas activas ' +
      'en el árbol; borra el subárbol completo (comentario, descendientes, ' +
      'votos e imágenes) si todos sus descendientes ya están eliminados.',
    security: bearerAuth,
    responses: {
      204: { description: 'Comentario eliminado' },
      ...errors(401, 403, 404),
    },
  }),
  verifyToken,
  async (c) => {
    const { subjectId, postId, commentId } = c.req.param() as {
      subjectId: string;
      postId: string;
      commentId: string;
    };
    const user = c.get('user');

    const post = await db.query.blogPosts.findFirst({
      where: and(eq(blogPosts.id, postId), eq(blogPosts.subjectId, subjectId)),
      columns: { id: true },
    });
    if (!post) return c.json({ error: 'Post no encontrado' }, 404);

    const comment = await db.query.blogComments.findFirst({
      where: and(eq(blogComments.id, commentId), eq(blogComments.postId, postId)),
    });
    if (!comment) return c.json({ error: 'Comentario no encontrado' }, 404);

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (comment.authorId !== user.sub && !isAdmin) {
      return c.json({ error: 'No podés borrar un comentario ajeno' }, 403);
    }

    // Para decidir soft vs hard delete se necesita el subárbol del comentario,
    // pero solo id, parentId y status — no los cuerpos.
    const postComments = await db.query.blogComments.findMany({
      where: eq(blogComments.postId, postId),
      columns: { id: true, parentId: true, status: true },
    });

    await deleteBlogComment(comment, postComments);

    return c.body(null, 204);
  },
);

export default app;

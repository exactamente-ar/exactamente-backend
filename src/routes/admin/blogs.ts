import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { blogSubtopics, blogPosts, blogComments, subjects } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { slugify } from '@/utils/slugify';
import { createSubtopicSchema, updateSubtopicSchema } from '@/validators/blogs.validators';
import type { AppContext } from '@/types';
import { BlogActivityResponseSchema, BlogSubtopicListSchema, BlogSubtopicSchema } from '@/schemas';
import { json, errors, bearerAuth } from '@/openapi/helpers';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

const DELETED_BODY = '[Eliminado]';

// ─── GET /activity — actividad reciente para moderar ─────────────────────────

const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

app.get(
  '/activity',
  describeRoute({
    tags: ['Admin'],
    summary: 'Actividad reciente de blogs',
    security: bearerAuth,
    description:
      'Posts y comentarios recientes de toda la plataforma, mezclados y ordenados por fecha. ' +
      'Es el barrido de moderación del MVP (sin búsqueda ni reportes).',
    responses: { 200: json(BlogActivityResponseSchema, 'Actividad'), ...errors(401, 403) },
  }),
  ...adminGuard,
  zValidator('query', activityQuery),
  async (c) => {
    const { limit } = c.req.valid('query');

    const [posts, comments] = await Promise.all([
      db.query.blogPosts.findMany({
        orderBy: [desc(blogPosts.createdAt)],
        limit,
        with: { author: true, subject: true },
      }),
      db.query.blogComments.findMany({
        orderBy: [desc(blogComments.createdAt)],
        limit,
        with: { author: true, post: { with: { subject: true } } },
      }),
    ]);

    const items = [
      ...posts.map((p) => ({
        id: p.id,
        type: 'post' as const,
        subjectId: p.subjectId,
        subjectTitle: p.subject?.title ?? '',
        postId: null,
        body: p.status === 'deleted' ? DELETED_BODY : p.body,
        authority: p.authority,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        author:
          p.authority === 'anonymous' || p.status === 'deleted'
            ? null
            : p.author?.displayName
              ? { name: p.author.displayName }
              : null,
      })),
      ...comments.map((cm) => ({
        id: cm.id,
        type: 'comment' as const,
        subjectId: cm.post?.subjectId ?? '',
        subjectTitle: cm.post?.subject?.title ?? '',
        postId: cm.postId,
        body: cm.status === 'deleted' ? DELETED_BODY : cm.body,
        authority: cm.authority,
        status: cm.status,
        createdAt: cm.createdAt.toISOString(),
        author:
          cm.authority === 'anonymous' || cm.status === 'deleted'
            ? null
            : cm.author?.displayName
              ? { name: cm.author.displayName }
              : null,
      })),
    ];

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return c.json({ data: items.slice(0, limit) });
  },
);

// ─── GET /:subjectId/subtopics — listar subtemas ─────────────────────────────

app.get(
  '/:subjectId/subtopics',
  describeRoute({
    tags: ['Admin'],
    summary: 'Listar subtemas de un blog',
    security: bearerAuth,
    responses: { 200: json(BlogSubtopicListSchema, 'Subtemas'), ...errors(401, 403, 404) },
  }),
  ...adminGuard,
  async (c) => {
    const subjectId = c.req.param('subjectId');
    const subtopics = await db.query.blogSubtopics.findMany({
      where: eq(blogSubtopics.subjectId, subjectId),
      orderBy: [asc(blogSubtopics.name)],
    });
    return c.json({
      subtopics: subtopics.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        isDefault: s.isDefault,
      })),
    });
  },
);

// ─── POST /:subjectId/subtopics — crear subtema ──────────────────────────────

app.post(
  '/:subjectId/subtopics',
  describeRoute({
    tags: ['Admin'],
    summary: 'Crear un subtema',
    security: bearerAuth,
    responses: { 201: json(BlogSubtopicSchema, 'Subtema creado'), ...errors(400, 401, 403, 404) },
  }),
  ...adminGuard,
  zValidator('json', createSubtopicSchema),
  async (c) => {
    const subjectId = c.req.param('subjectId');
    const { name } = c.req.valid('json');

    const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) });
    if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

    const [subtopic] = await db
      .insert(blogSubtopics)
      .values({
        id: crypto.randomUUID(),
        subjectId,
        name,
        slug: slugify(name),
        isDefault: false,
      })
      .returning();

    return c.json(
      { id: subtopic.id, name: subtopic.name, slug: subtopic.slug, isDefault: subtopic.isDefault },
      201,
    );
  },
);

// ─── PATCH /subtopics/:id — renombrar subtema ────────────────────────────────

app.patch(
  '/subtopics/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Renombrar un subtema',
    security: bearerAuth,
    responses: {
      200: json(BlogSubtopicSchema, 'Subtema actualizado'),
      ...errors(400, 401, 403, 404),
    },
  }),
  ...adminGuard,
  zValidator('json', updateSubtopicSchema),
  async (c) => {
    const id = c.req.param('id');
    const { name } = c.req.valid('json');

    const [subtopic] = await db
      .update(blogSubtopics)
      .set({ name, slug: slugify(name), updatedAt: new Date() })
      .where(eq(blogSubtopics.id, id))
      .returning();
    if (!subtopic) return c.json({ error: 'Subtema no encontrado' }, 404);

    return c.json({
      id: subtopic.id,
      name: subtopic.name,
      slug: subtopic.slug,
      isDefault: subtopic.isDefault,
    });
  },
);

// ─── DELETE /subtopics/:id — borrar subtema (posts → general) ────────────────

app.delete(
  '/subtopics/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Borrar un subtema',
    security: bearerAuth,
    description:
      'Reasigna sus posts al "Subtema general". El subtema general no se puede borrar (400).',
    responses: { 204: { description: 'Subtema eliminado' }, ...errors(400, 401, 403, 404) },
  }),
  ...adminGuard,
  async (c) => {
    const id = c.req.param('id');

    const subtopic = await db.query.blogSubtopics.findFirst({
      where: eq(blogSubtopics.id, id),
    });
    if (!subtopic) return c.json({ error: 'Subtema no encontrado' }, 404);
    if (subtopic.isDefault) {
      return c.json({ error: 'El subtema general no se puede borrar' }, 400);
    }

    const general = await db.query.blogSubtopics.findFirst({
      where: and(
        eq(blogSubtopics.subjectId, subtopic.subjectId),
        eq(blogSubtopics.isDefault, true),
      ),
    });
    if (!general) return c.json({ error: 'Subtema general no encontrado' }, 500);

    await db.transaction(async (tx) => {
      await tx
        .update(blogPosts)
        .set({ subtopicId: general.id, updatedAt: new Date() })
        .where(eq(blogPosts.subtopicId, id));
      await tx.delete(blogSubtopics).where(eq(blogSubtopics.id, id));
    });

    return c.body(null, 204);
  },
);

export default app;

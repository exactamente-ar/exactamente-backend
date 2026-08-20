import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { subjects, resources, blogSubtopics } from '@/db/schema';
import {
  prepareSubjectBlogDeletion,
  deletePolymorphicBlogData,
  deleteBlogStorageObjects,
} from '@/services/blog-deletion';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';
import { PaginatedAdminSubjectSchema, SubjectSchema } from '@/schemas';
import { json, errors, bearerAuth } from '@/openapi/helpers';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por facultad, con resourceCount
const listSchema = z.object({
  facultyId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

app.get(
  '/',
  describeRoute({
    tags: ['Admin'],
    summary: 'Listar materias',
    security: bearerAuth,
    responses: { 200: json(PaginatedAdminSubjectSchema, 'Listado paginado'), ...errors(401, 403) },
  }),
  ...adminGuard,
  zValidator('query', listSchema),
  async (c) => {
    const { facultyId, page, limit } = c.req.valid('query');
    const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
    const whereClause = facultyId ? eq(subjects.facultyId, facultyId) : undefined;

    const [data, countResult] = await Promise.all([
      db
        .select({
          id: subjects.id,
          facultyId: subjects.facultyId,
          title: subjects.title,
          slug: subjects.slug,
          description: subjects.description,
          urlMoodle: subjects.urlMoodle,
          urlPrograma: subjects.urlPrograma,
          year: subjects.year,
          quadmester: subjects.quadmester,
          createdAt: subjects.createdAt,
          updatedAt: subjects.updatedAt,
          resourceCount: sql<number>`count(case when ${resources.status} = 'published' then 1 end)::int`,
        })
        .from(subjects)
        .leftJoin(resources, eq(resources.subjectId, subjects.id))
        .where(whereClause)
        .groupBy(subjects.id)
        .orderBy(asc(subjects.year), asc(subjects.quadmester), asc(subjects.title))
        .limit(safeLimit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(subjects)
        .where(whereClause),
    ]);

    return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
  },
);

// POST / — crear
const createSchema = z.object({
  facultyId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().default(''),
  urlMoodle: z.string().url().optional().or(z.literal('')),
  urlPrograma: z.string().url().optional().or(z.literal('')),
  year: z.number().int().positive(),
  quadmester: z.number().int().min(1).max(2),
});

app.post(
  '/',
  describeRoute({
    tags: ['Admin'],
    summary: 'Crear materia',
    security: bearerAuth,
    responses: { 201: json(SubjectSchema, 'Materia creada'), ...errors(400, 401, 403) },
  }),
  ...adminGuard,
  zValidator('json', createSchema),
  async (c) => {
    const data = c.req.valid('json');
    const id = crypto.randomUUID();
    const slug = slugify(data.title);
    const now = new Date();
    const subject = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(subjects)
        .values({
          id,
          facultyId: data.facultyId,
          title: data.title,
          slug,
          description: data.description,
          urlMoodle: data.urlMoodle ?? '',
          urlPrograma: data.urlPrograma ?? '',
          year: data.year,
          quadmester: data.quadmester,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // FR-2: todo blog nace con su "Subtema general" (mismo nombre/slug que el
      // backfill de la migración 0010). Sin esto el blog queda sin subtemas y no
      // se puede postear.
      await tx.insert(blogSubtopics).values({
        id: crypto.randomUUID(),
        subjectId: id,
        name: 'General',
        slug: 'general',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });

      return created;
    });
    return c.json(subject, 201);
  },
);

// GET /:id — detalle
app.get(
  '/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Obtener materia por id',
    security: bearerAuth,
    responses: { 200: json(SubjectSchema, 'Materia encontrada'), ...errors(401, 403, 404) },
  }),
  ...adminGuard,
  async (c) => {
    const id = c.req.param('id');
    const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, id) });
    if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
    return c.json(subject);
  },
);

// PATCH /:id — actualizar campos parcialmente
const updateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  urlMoodle: z.string().url().optional().or(z.literal('')),
  urlPrograma: z.string().url().optional().or(z.literal('')),
  year: z.number().int().positive().optional(),
  quadmester: z.number().int().min(1).max(2).optional(),
});

app.patch(
  '/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Actualizar materia',
    security: bearerAuth,
    responses: { 200: json(SubjectSchema, 'Materia actualizada'), ...errors(400, 401, 403, 404) },
  }),
  ...adminGuard,
  zValidator('json', updateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) {
      updates.title = data.title;
      updates.slug = slugify(data.title);
    }
    if (data.description !== undefined) updates.description = data.description;
    if (data.urlMoodle !== undefined) updates.urlMoodle = data.urlMoodle;
    if (data.urlPrograma !== undefined) updates.urlPrograma = data.urlPrograma;
    if (data.year !== undefined) updates.year = data.year;
    if (data.quadmester !== undefined) updates.quadmester = data.quadmester;

    const [subject] = await db.update(subjects).set(updates).where(eq(subjects.id, id)).returning();
    if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
    return c.json(subject);
  },
);

// DELETE /:id — eliminar (bloquea si tiene recursos publicados)
app.delete(
  '/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Eliminar materia',
    security: bearerAuth,
    responses: { 204: { description: 'Eliminada' }, ...errors(401, 403, 404, 409) },
    description: 'Falla con 409 si tiene recursos publicados.',
  }),
  ...adminGuard,
  async (c) => {
    const id = c.req.param('id');
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(and(eq(resources.subjectId, id), eq(resources.status, 'published')));
    if (count > 0) {
      return c.json({ error: 'No se puede eliminar una materia con recursos publicados' }, 409);
    }

    const { targetIds, r2Keys } = await prepareSubjectBlogDeletion(id);

    const [subject] = await db.transaction(async (tx) => {
      await deletePolymorphicBlogData(tx, targetIds);
      // blog_subtopics, blog_posts y blog_comments caen en cascada (0010).
      return tx.delete(subjects).where(eq(subjects.id, id)).returning();
    });
    if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

    // Borrar los objetos de R2 después del commit: si la transacción falló, las
    // filas sobreviven y borrar antes dejaría URLs rotas.
    await deleteBlogStorageObjects(r2Keys);

    return new Response(null, { status: 204 });
  },
);

export default app;

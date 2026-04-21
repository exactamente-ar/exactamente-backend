import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { subjects, resources } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por facultad
const listSchema = z.object({
  facultyId: z.string().optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { facultyId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const whereClause = facultyId ? eq(subjects.facultyId, facultyId) : undefined;
  const [data, countResult] = await Promise.all([
    db.query.subjects.findMany({
      where: whereClause,
      orderBy: (s, { asc }) => [asc(s.year), asc(s.quadmester), asc(s.title)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(subjects).where(whereClause),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  facultyId:   z.string().min(1),
  title:       z.string().min(1).max(255),
  description: z.string().default(''),
  urlMoodle:   z.string().url().optional().or(z.literal('')),
  urlPrograma: z.string().url().optional().or(z.literal('')),
  year:        z.number().int().positive(),
  quadmester:  z.number().int().min(1).max(2),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const data = c.req.valid('json');
  const id = crypto.randomUUID();
  const slug = slugify(data.title);
  const now = new Date();
  const [subject] = await db.insert(subjects).values({
    id,
    facultyId:   data.facultyId,
    title:       data.title,
    slug,
    description: data.description,
    urlMoodle:   data.urlMoodle ?? '',
    urlPrograma: data.urlPrograma ?? '',
    year:        data.year,
    quadmester:  data.quadmester,
    createdAt:   now,
    updatedAt:   now,
  }).returning();
  return c.json(subject, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, id) });
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
  return c.json(subject);
});

// PATCH /:id — actualizar campos parcialmente
const updateSchema = z.object({
  title:       z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  urlMoodle:   z.string().url().optional().or(z.literal('')),
  urlPrograma: z.string().url().optional().or(z.literal('')),
  year:        z.number().int().positive().optional(),
  quadmester:  z.number().int().min(1).max(2).optional(),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined)       { updates.title = data.title; updates.slug = slugify(data.title); }
  if (data.description !== undefined) updates.description = data.description;
  if (data.urlMoodle !== undefined)   updates.urlMoodle   = data.urlMoodle;
  if (data.urlPrograma !== undefined) updates.urlPrograma = data.urlPrograma;
  if (data.year !== undefined)        updates.year        = data.year;
  if (data.quadmester !== undefined)  updates.quadmester  = data.quadmester;

  const [subject] = await db.update(subjects).set(updates).where(eq(subjects.id, id)).returning();
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
  return c.json(subject);
});

// DELETE /:id — eliminar (bloquea si tiene recursos publicados)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resources)
    .where(and(eq(resources.subjectId, id), eq(resources.status, 'published')));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar una materia con recursos publicados' }, 409);
  }
  const [subject] = await db.delete(subjects).where(eq(subjects.id, id)).returning();
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
  return new Response(null, { status: 204 });
});

export default app;

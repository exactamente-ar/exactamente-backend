import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { careerPlans, careerSubjects, subjects, resources } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por carrera
const listSchema = z.object({
  careerId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { careerId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const whereClause = careerId ? eq(careerPlans.careerId, careerId) : undefined;
  const [data, countResult] = await Promise.all([
    db.query.careerPlans.findMany({
      where: whereClause,
      orderBy: (p, { asc }) => [asc(p.year), asc(p.name)],
      limit: safeLimit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(careerPlans)
      .where(whereClause),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  careerId: z.string().min(1),
  name: z.string().min(1).max(100),
  year: z.number().int().positive(),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const { careerId, name, year } = c.req.valid('json');
  const id = crypto.randomUUID();
  const [plan] = await db.insert(careerPlans).values({ id, careerId, name, year }).returning();
  return c.json(plan, 201);
});

// GET /:id/subjects — materias del plan
const subjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(100),
});

app.get('/:id/subjects', ...adminGuard, zValidator('query', subjectsQuerySchema), async (c) => {
  const id = c.req.param('id');
  const { page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  const [data, countResult] = await Promise.all([
    db
      .select({
        id: subjects.id,
        facultyId: subjects.facultyId,
        title: subjects.title,
        description: subjects.description,
        urlMoodle: subjects.urlMoodle,
        urlPrograma: subjects.urlPrograma,
        year: subjects.year,
        quadmester: subjects.quadmester,
        createdAt: subjects.createdAt,
        resourceCount: sql<number>`count(case when ${resources.status} = 'published' then 1 end)::int`,
      })
      .from(subjects)
      .innerJoin(careerSubjects, eq(careerSubjects.subjectId, subjects.id))
      .leftJoin(resources, eq(resources.subjectId, subjects.id))
      .where(eq(careerSubjects.planId, id))
      .groupBy(subjects.id)
      .orderBy(asc(subjects.year), asc(subjects.quadmester), asc(subjects.title))
      .limit(safeLimit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${subjects.id})::int` })
      .from(subjects)
      .innerJoin(careerSubjects, eq(careerSubjects.subjectId, subjects.id))
      .where(eq(careerSubjects.planId, id)),
  ]);

  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const plan = await db.query.careerPlans.findFirst({ where: eq(careerPlans.id, id) });
  if (!plan) return c.json({ error: 'Plan no encontrado' }, 404);
  return c.json(plan);
});

// PATCH /:id — actualizar nombre o año
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  year: z.number().int().positive().optional(),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { name, year } = c.req.valid('json');
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (year !== undefined) updates.year = year;
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'Se debe proporcionar al menos un campo para actualizar' }, 400);
  }
  const [plan] = await db
    .update(careerPlans)
    .set(updates)
    .where(eq(careerPlans.id, id))
    .returning();
  if (!plan) return c.json({ error: 'Plan no encontrado' }, 404);
  return c.json(plan);
});

// DELETE /:id — eliminar (bloquea si tiene materias asignadas)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(careerSubjects)
    .where(eq(careerSubjects.planId, id));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar un plan con materias asignadas' }, 409);
  }
  const [plan] = await db.delete(careerPlans).where(eq(careerPlans.id, id)).returning();
  if (!plan) return c.json({ error: 'Plan no encontrado' }, 404);
  return new Response(null, { status: 204 });
});

export default app;

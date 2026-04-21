import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { careers, careerPlans } from '@/db/schema';
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
  const whereClause = facultyId ? eq(careers.facultyId, facultyId) : undefined;
  const [data, countResult] = await Promise.all([
    db.query.careers.findMany({
      where: whereClause,
      orderBy: (ca, { asc }) => [asc(ca.name)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(careers).where(whereClause),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  facultyId: z.string().min(1),
  name:      z.string().min(1).max(255),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const { facultyId, name } = c.req.valid('json');
  const id = crypto.randomUUID();
  const slug = slugify(name);
  const [career] = await db.insert(careers).values({ id, facultyId, name, slug }).returning();
  return c.json(career, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const career = await db.query.careers.findFirst({ where: eq(careers.id, id) });
  if (!career) return c.json({ error: 'Carrera no encontrada' }, 404);
  return c.json(career);
});

// PATCH /:id — actualizar nombre
const updateSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { name } = c.req.valid('json');
  const slug = slugify(name);
  const [career] = await db
    .update(careers)
    .set({ name, slug })
    .where(eq(careers.id, id))
    .returning();
  if (!career) return c.json({ error: 'Carrera no encontrada' }, 404);
  return c.json(career);
});

// DELETE /:id — eliminar (bloquea si tiene planes)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(careerPlans)
    .where(eq(careerPlans.careerId, id));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar una carrera con planes asociados' }, 409);
  }
  const [career] = await db.delete(careers).where(eq(careers.id, id)).returning();
  if (!career) return c.json({ error: 'Carrera no encontrada' }, 404);
  return new Response(null, { status: 204 });
});

export default app;

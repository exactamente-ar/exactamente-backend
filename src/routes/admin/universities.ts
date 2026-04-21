import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { universities, faculties } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada
const listSchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const [data, countResult] = await Promise.all([
    db.query.universities.findMany({
      orderBy: (u, { asc }) => [asc(u.name)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(universities),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  name: z.string().min(1).max(255),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const { name } = c.req.valid('json');
  const id = crypto.randomUUID();
  const slug = slugify(name);
  const [university] = await db.insert(universities).values({ id, name, slug }).returning();
  return c.json(university, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const university = await db.query.universities.findFirst({ where: eq(universities.id, id) });
  if (!university) return c.json({ error: 'Universidad no encontrada' }, 404);
  return c.json(university);
});

// PATCH /:id — actualizar
const updateSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { name } = c.req.valid('json');
  const slug = slugify(name);
  const [university] = await db
    .update(universities)
    .set({ name, slug })
    .where(eq(universities.id, id))
    .returning();
  if (!university) return c.json({ error: 'Universidad no encontrada' }, 404);
  return c.json(university);
});

// DELETE /:id — eliminar (bloquea si tiene facultades)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(faculties)
    .where(eq(faculties.universityId, id));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar una universidad con facultades asociadas' }, 409);
  }
  const [university] = await db.delete(universities).where(eq(universities.id, id)).returning();
  if (!university) return c.json({ error: 'Universidad no encontrada' }, 404);
  return new Response(null, { status: 204 });
});

export default app;

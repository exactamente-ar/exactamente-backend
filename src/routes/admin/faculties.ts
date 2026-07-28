import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { faculties, careers } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';
import { FacultySchema, PaginatedFacultySchema } from '@/schemas';
import { json, errors, bearerAuth } from '@/openapi/helpers';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por universidad
const listSchema = z.object({
  universityId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

app.get(
  '/',
  describeRoute({
    tags: ['Admin'],
    summary: 'Listar facultades',
    security: bearerAuth,
    responses: { 200: json(PaginatedFacultySchema, 'Listado paginado'), ...errors(401, 403) },
  }),
  ...adminGuard,
  zValidator('query', listSchema),
  async (c) => {
    const { universityId, page, limit } = c.req.valid('query');
    const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
    const whereClause = universityId ? eq(faculties.universityId, universityId) : undefined;
    const [data, countResult] = await Promise.all([
      db.query.faculties.findMany({
        where: whereClause,
        orderBy: (f, { asc }) => [asc(f.name)],
        limit: safeLimit,
        offset,
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(faculties)
        .where(whereClause),
    ]);
    return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
  },
);

// POST / — crear
const createSchema = z.object({
  universityId: z.string().min(1),
  name: z.string().min(1).max(255),
});

app.post(
  '/',
  describeRoute({
    tags: ['Admin'],
    summary: 'Crear facultad',
    security: bearerAuth,
    responses: { 201: json(FacultySchema, 'Facultad creada'), ...errors(400, 401, 403) },
  }),
  ...adminGuard,
  zValidator('json', createSchema),
  async (c) => {
    const { universityId, name } = c.req.valid('json');
    const id = crypto.randomUUID();
    const slug = slugify(name);
    const [faculty] = await db
      .insert(faculties)
      .values({ id, universityId, name, slug })
      .returning();
    return c.json(faculty, 201);
  },
);

// GET /:id — detalle
app.get(
  '/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Obtener facultad por id',
    security: bearerAuth,
    responses: { 200: json(FacultySchema, 'Facultad encontrada'), ...errors(401, 403, 404) },
  }),
  ...adminGuard,
  async (c) => {
    const id = c.req.param('id');
    const faculty = await db.query.faculties.findFirst({ where: eq(faculties.id, id) });
    if (!faculty) return c.json({ error: 'Facultad no encontrada' }, 404);
    return c.json(faculty);
  },
);

// PATCH /:id — actualizar nombre
const updateSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch(
  '/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Actualizar facultad',
    security: bearerAuth,
    responses: { 200: json(FacultySchema, 'Facultad actualizada'), ...errors(400, 401, 403, 404) },
  }),
  ...adminGuard,
  zValidator('json', updateSchema),
  async (c) => {
    const id = c.req.param('id');
    const { name } = c.req.valid('json');
    const slug = slugify(name);
    const [faculty] = await db
      .update(faculties)
      .set({ name, slug })
      .where(eq(faculties.id, id))
      .returning();
    if (!faculty) return c.json({ error: 'Facultad no encontrada' }, 404);
    return c.json(faculty);
  },
);

// DELETE /:id — eliminar (bloquea si tiene carreras)
app.delete(
  '/:id',
  describeRoute({
    tags: ['Admin'],
    summary: 'Eliminar facultad',
    security: bearerAuth,
    responses: { 204: { description: 'Eliminada' }, ...errors(401, 403, 404, 409) },
    description: 'Falla con 409 si tiene carreras.',
  }),
  ...adminGuard,
  async (c) => {
    const id = c.req.param('id');
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(careers)
      .where(eq(careers.facultyId, id));
    if (count > 0) {
      return c.json({ error: 'No se puede eliminar una facultad con carreras asociadas' }, 409);
    }
    const [faculty] = await db.delete(faculties).where(eq(faculties.id, id)).returning();
    if (!faculty) return c.json({ error: 'Facultad no encontrada' }, 404);
    return new Response(null, { status: 204 });
  },
);

export default app;

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { careers } from '@/db/schema';
import { rateLimit } from '@/middleware/rateLimit';
import { CareerListSchema } from '@/schemas';
import { json } from '@/openapi/helpers';

const app = new Hono();

const publicReadLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 }); // 100 req/min

const careersQuerySchema = z.object({
  facultyId: z.string().optional(),
});

app.get(
  '/',
  describeRoute({
    tags: ['Catálogo'],
    summary: 'Listar carreras',
    description: 'Sin paginación: devuelve todas las carreras en `data`.',
    responses: { 200: json(CareerListSchema, 'Todas las carreras, filtrables por facultyId') },
  }),
  publicReadLimit,
  zValidator('query', careersQuerySchema),
  async (c) => {
    const { facultyId } = c.req.valid('query');

    const data = await db.query.careers.findMany({
      where: facultyId ? eq(careers.facultyId, facultyId) : undefined,
      orderBy: (t, { asc }) => [asc(t.name)],
    });

    return c.json({ data });
  },
);

export default app;

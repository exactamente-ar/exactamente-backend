import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { rateLimit } from '@/middleware/rateLimit';
import { PaginatedUniversitySchema } from '@/schemas';
import { json } from '@/openapi/helpers';

const app = new Hono();

const publicReadLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 }); // 100 req/min

const universitiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

app.get(
  '/',
  describeRoute({
    tags: ['Catálogo'],
    summary: 'Listar universidades',
    responses: { 200: json(PaginatedUniversitySchema, 'Universidades ordenadas por nombre') },
  }),
  publicReadLimit,
  zValidator('query', universitiesQuerySchema),
  async (c) => {
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
  },
);

export default app;

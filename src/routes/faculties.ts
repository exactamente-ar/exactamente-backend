import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { faculties } from '@/db/schema';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';

const app = new Hono();

const facultiesQuerySchema = z.object({
  universityId: z.string().optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', zValidator('query', facultiesQuerySchema), async (c) => {
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
    db.select({ count: sql<number>`count(*)::int` })
      .from(faculties)
      .where(whereClause),
  ]);

  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

export default app;

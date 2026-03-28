import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@/db';
import { resources } from '@/db/schema';
import { buildPreviewUrl, buildDownloadUrl } from '@/utils/drive-urls';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';

const resourceQuerySchema = z.object({
  subjectId: z.string().optional(),
  type:      z.enum(['resumen', 'parcial', 'final']).optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

const app = new Hono();

app.get('/', zValidator('query', resourceQuerySchema), async (c) => {
  const { subjectId, type, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  const conditions = [eq(resources.status, 'published')];
  if (subjectId) conditions.push(eq(resources.subjectId, subjectId));
  if (type) conditions.push(eq(resources.type, type));

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.query.resources.findMany({
      where: whereClause,
      limit: safeLimit,
      offset,
      orderBy: (r, { desc }) => [desc(r.publishedAt)],
    }),
    db.select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const data = rows.map(r => ({
    id: r.id,
    subjectId: r.subjectId,
    title: r.title,
    type: r.type,
    status: r.status,
    driveFileId: r.driveFileId,
    driveSize: r.driveSize,
    downloadCount: r.downloadCount,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    previewUrl:  r.driveFileId ? buildPreviewUrl(r.driveFileId) : null,
    downloadUrl: r.driveFileId ? buildDownloadUrl(r.driveFileId) : null,
  }));

  return c.json(buildPaginatedResponse(data, total, safePage, safeLimit));
});

export default app;

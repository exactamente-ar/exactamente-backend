import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { resources, subjects, careers, faculties, universities } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// ─── GET / — métricas para el dashboard ──────────────────────────────────────

app.get('/', ...adminGuard, async (c) => {
  const [
    statusRows,
    typeRows,
    [subjectCount],
    [subjectsWithResourcesCount],
    [careerCount],
    [facultyCount],
    [universityCount],
  ] = await Promise.all([
    db.select({ status: resources.status, count: sql<number>`count(*)::int` })
      .from(resources)
      .groupBy(resources.status),
    db.select({ type: resources.type, count: sql<number>`count(*)::int` })
      .from(resources)
      .groupBy(resources.type),
    db.select({ count: sql<number>`count(*)::int` }).from(subjects),
    db.select({ count: sql<number>`count(distinct ${resources.subjectId})::int` })
      .from(resources)
      .where(eq(resources.status, 'published')),
    db.select({ count: sql<number>`count(*)::int` }).from(careers),
    db.select({ count: sql<number>`count(*)::int` }).from(faculties),
    db.select({ count: sql<number>`count(*)::int` }).from(universities),
  ]);

  const byStatus = { pending: 0, published: 0, rejected: 0 } as Record<string, number>;
  for (const row of statusRows) byStatus[row.status] = row.count;

  const byType = { resumen: 0, parcial: 0, final: 0 } as Record<string, number>;
  for (const row of typeRows) byType[row.type] = row.count;

  const totalSubjects = subjectCount?.count ?? 0;
  const withResources = subjectsWithResourcesCount?.count ?? 0;

  return c.json({
    resources: {
      total:    Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus: byStatus as { pending: number; published: number; rejected: number },
      byType:   byType   as { resumen: number; parcial: number; final: number },
    },
    coverage: {
      subjectsWithResources:    withResources,
      subjectsWithoutResources: totalSubjects - withResources,
    },
    counts: {
      subjects:     totalSubjects,
      careers:      careerCount?.count      ?? 0,
      faculties:    facultyCount?.count     ?? 0,
      universities: universityCount?.count  ?? 0,
    },
  });
});

export default app;

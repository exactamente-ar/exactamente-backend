import { Hono } from 'hono';
import { eq, and, ilike, inArray, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { db } from '@/db';
import { subjects, careerSubjects } from '@/db/schema';
import { subjectFiltersSchema } from '@/validators/subject.validators';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import type { Subject } from '@/types';

const app = new Hono();

function rowToSubject(row: typeof subjects.$inferSelect): Subject {
  return {
    id: row.id,
    facultyId: row.facultyId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    urlMoodle: row.urlMoodle ?? '',
    urlPrograma: row.urlPrograma ?? '',
    year: row.year,
    quadmester: row.quadmester,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

app.get('/', zValidator('query', subjectFiltersSchema), async (c) => {
  const { careerId, facultyId, year, quadmester, search, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  // Si hay careerId, obtener los IDs de materias de esa carrera primero
  let careerSubjectIds: string[] | undefined;
  if (careerId) {
    const rows = await db
      .select({ subjectId: careerSubjects.subjectId })
      .from(careerSubjects)
      .where(eq(careerSubjects.careerId, careerId));
    careerSubjectIds = rows.map(r => r.subjectId);
    if (careerSubjectIds.length === 0) {
      return c.json(buildPaginatedResponse([], 0, safePage, safeLimit));
    }
  }

  const conditions = [];
  if (facultyId) conditions.push(eq(subjects.facultyId, facultyId));
  if (year) conditions.push(eq(subjects.year, year));
  if (quadmester) conditions.push(eq(subjects.quadmester, quadmester));
  if (search) conditions.push(ilike(subjects.title, `%${search}%`));
  if (careerSubjectIds) conditions.push(inArray(subjects.id, careerSubjectIds));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.query.subjects.findMany({
      where: whereClause,
      limit: safeLimit,
      offset,
      with: {
        careerSubjects: true,
        prerequisites: true,
        dependents: true,
      },
      orderBy: (s, { asc }) => [asc(s.year), asc(s.quadmester), asc(s.title)],
    }),
    db.select({ count: sql<number>`count(*)::int` })
      .from(subjects)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const data = rows.map(s => ({
    ...rowToSubject(s),
    careers: s.careerSubjects.map(cs => ({
      careerId: cs.careerId,
      year: cs.year,
      quadmester: cs.quadmester,
    })),
    prerequisites: s.prerequisites.map(p => p.requiredId),
    correlatives: s.dependents.map(d => d.subjectId),
  }));

  return c.json(buildPaginatedResponse(data, total, safePage, safeLimit));
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, id),
    with: {
      careerSubjects: true,
      prerequisites: { with: { required: true } },
      dependents:    { with: { subject: true } },
    },
  });

  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

  return c.json({
    subject: {
      ...rowToSubject(subject),
      careers: subject.careerSubjects.map(cs => ({
        careerId: cs.careerId,
        year: cs.year,
        quadmester: cs.quadmester,
      })),
      prerequisites: subject.prerequisites.map(p => p.requiredId),
      correlatives:  subject.dependents.map(d => d.subjectId),
      prerequisiteSubjects: subject.prerequisites.map(p => rowToSubject(p.required)),
      correlativeSubjects:  subject.dependents.map(d => rowToSubject(d.subject)),
    },
  });
});

export default app;

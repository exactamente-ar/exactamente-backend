import { Hono } from 'hono';
import { eq, and, inArray, sql, ilike } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { db } from '@/db';
import { subjects, careerSubjects, resources, subjectGroupMembers, subjectGroups } from '@/db/schema';
import { subjectFiltersSchema } from '@/validators/subject.validators';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { rateLimit } from '@/middleware/rateLimit';
import type { Subject } from '@/types';

const app = new Hono();

const publicReadLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 }); // 100 req/min

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

async function getSubjectGroup(subjectId: string) {
  const member = await db.query.subjectGroupMembers.findFirst({
    where: eq(subjectGroupMembers.subjectId, subjectId),
  });
  if (!member) return null;

  const group = await db.query.subjectGroups.findFirst({
    where: eq(subjectGroups.id, member.groupId),
    with: {
      members: {
        with: {
          subject: {
            columns: { id: true, title: true, slug: true },
            with: {
              careerSubjects: {
                with: {
                  career: { columns: { name: true, shortName: true } },
                  plan:   { columns: { name: true, year: true } },
                },
              },
            },
          },
        },
        orderBy: (m, { asc }) => [asc(m.sortOrder), asc(m.createdAt)],
      },
    },
  });
  if (!group) return null;

  return {
    id: group.id,
    name: group.name,
    members: group.members.map(m => {
      const cs = m.subject.careerSubjects[0];
      return {
        id:         m.subject.id,
        title:      m.subject.title,
        slug:       m.subject.slug,
        sortOrder:  m.sortOrder,
        careerName: cs ? (cs.career.shortName ?? cs.career.name) : null,
        planYear:   cs?.plan.year ?? null,
      };
    }),
  };
}

app.get('/', publicReadLimit, zValidator('query', subjectFiltersSchema), async (c) => {
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
  if (search) {
    const normalized = search.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
    conditions.push(
      sql`translate(lower(${subjects.title}), 'áéíóúüñ', 'aeiouun') ILIKE ${`%${normalized}%`}`
    );
  }
  if (careerSubjectIds) conditions.push(inArray(subjects.id, careerSubjectIds));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.query.subjects.findMany({
      where: whereClause,
      limit: safeLimit,
      offset,
      with: {
        careerSubjects: {
          with: {
            career: {
              with: {
                faculty: {
                  with: { university: true },
                },
              },
            },
          },
        },
      },
      orderBy: (s, { asc }) => [asc(s.year), asc(s.quadmester), asc(s.title)],
    }),
    db.select({ count: sql<number>`count(*)::int` })
      .from(subjects)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const subjectIds = rows.map(r => r.id);
  const resourceCountsRows = subjectIds.length > 0
    ? await db
        .select({
          subjectId: resources.subjectId,
          type: resources.type,
          count: sql<number>`count(*)::int`,
        })
        .from(resources)
        .where(and(inArray(resources.subjectId, subjectIds), eq(resources.status, 'published')))
        .groupBy(resources.subjectId, resources.type)
    : [];

  const countsMap = new Map<string, { resumen: number; parcial: number; final: number }>();
  for (const row of resourceCountsRows) {
    if (!countsMap.has(row.subjectId)) {
      countsMap.set(row.subjectId, { resumen: 0, parcial: 0, final: 0 });
    }
    countsMap.get(row.subjectId)![row.type] = row.count;
  }

  const data = rows.map(s => ({
    ...rowToSubject(s),
    careers: s.careerSubjects.map(cs => ({
      careerId: cs.careerId,
      careerName: cs.career.shortName ?? cs.career.name,
      facultyId: cs.career.facultyId,
      facultyName: cs.career.faculty.shortName ?? cs.career.faculty.name,
      universityId: cs.career.faculty.universityId,
      universityName: cs.career.faculty.university.shortName ?? cs.career.faculty.university.name,
      planId: cs.planId,
      year: cs.year,
      quadmester: cs.quadmester,
    })),
    resourceCounts: countsMap.get(s.id) ?? { resumen: 0, parcial: 0, final: 0 },
  }));

  return c.json(buildPaginatedResponse(data, total, safePage, safeLimit));
});

app.get('/:id', publicReadLimit, async (c) => {
  const id = c.req.param('id');

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, id),
    with: {
      careerSubjects: {
        with: {
          career: {
            with: {
              faculty: {
                with: { university: true },
              },
            },
          },
        },
      },
    },
  });

  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

  const group = await getSubjectGroup(subject.id);

  return c.json({
    subject: {
      ...rowToSubject(subject),
      careers: subject.careerSubjects.map(cs => ({
        careerId: cs.careerId,
        careerName: cs.career.shortName ?? cs.career.name,
        facultyId: cs.career.facultyId,
        facultyName: cs.career.faculty.shortName ?? cs.career.faculty.name,
        universityId: cs.career.faculty.universityId,
        universityName: cs.career.faculty.university.shortName ?? cs.career.faculty.university.name,
        planId: cs.planId,
        year: cs.year,
        quadmester: cs.quadmester,
      })),
      ...(group ? { group } : {}),
    },
  });
});

export default app;

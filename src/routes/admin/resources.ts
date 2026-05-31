import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, ne, and, sql, inArray, desc } from 'drizzle-orm';
import { db } from '@/db';
import { resources, subjects, careerSubjects, careers, careerPlans } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { storage } from '@/services/storage';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { buildResourceTitle } from '@/routes/resources';
import { uploadResourceSchema } from '@/validators/resource.validators';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// ─── GET / — listar recursos (todos los estados) ──────────────────────────────

const listSchema = z.object({
  status:       z.enum(['pending', 'published', 'rejected']).optional(),
  subjectId:    z.string().optional(),
  careerId:     z.string().optional(),
  careerPlanId: z.string().optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { status, subjectId, careerId, careerPlanId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  const conditions = [];
  if (status)    conditions.push(eq(resources.status, status));
  if (subjectId) conditions.push(eq(resources.subjectId, subjectId));
  if (careerId) {
    const sub = db.select({ id: careerSubjects.subjectId })
      .from(careerSubjects)
      .where(eq(careerSubjects.careerId, careerId));
    conditions.push(inArray(resources.subjectId, sub));
  }
  if (careerPlanId) {
    const sub = db.select({ id: careerSubjects.subjectId })
      .from(careerSubjects)
      .where(eq(careerSubjects.planId, careerPlanId));
    conditions.push(inArray(resources.subjectId, sub));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select({ resource: resources, subjectTitle: subjects.title })
      .from(resources)
      .leftJoin(subjects, eq(resources.subjectId, subjects.id))
      .where(whereClause)
      .orderBy(desc(resources.createdAt))
      .limit(safeLimit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(whereClause),
  ]);

  const subjectIds = [...new Set(rows.map(r => r.resource.subjectId))];
  const csRows = subjectIds.length > 0
    ? await db.select({
        subjectId:  careerSubjects.subjectId,
        careerName: careers.name,
        planName:   careerPlans.name,
        planYear:   careerPlans.year,
      })
      .from(careerSubjects)
      .innerJoin(careers,     eq(careerSubjects.careerId, careers.id))
      .innerJoin(careerPlans, eq(careerSubjects.planId,   careerPlans.id))
      .where(inArray(careerSubjects.subjectId, subjectIds))
    : [];

  const subjectToCareer = new Map<string, { careerName: string; planName: string; planYear: number }>();
  for (const cs of csRows) {
    if (!subjectToCareer.has(cs.subjectId)) {
      subjectToCareer.set(cs.subjectId, { careerName: cs.careerName, planName: cs.planName, planYear: cs.planYear });
    }
  }

  const total = countResult[0]?.count ?? 0;
  return c.json(buildPaginatedResponse(
    rows.map(r => rowToAdminResource(r.resource, r.subjectTitle ?? undefined, subjectToCareer.get(r.resource.subjectId))),
    total, safePage, safeLimit,
  ));
});

// ─── POST / — subir recurso (admin, auto-publicado) ───────────────────────────

app.post('/', ...adminGuard, async (c) => {
  const formData = await c.req.formData();
  const file      = formData.get('file');
  const subjectId = formData.get('subjectId') as string | null;
  const title     = formData.get('title') as string | null;
  const type      = formData.get('type') as string | null;
  const subtype   = formData.get('subtype') as string | null;
  const topic     = formData.get('topic') as string | null;
  const examYear  = formData.get('examYear') as string | null;
  const examMonth = formData.get('examMonth') as string | null;
  const examDay   = formData.get('examDay') as string | null;
  const notes     = formData.get('notes') as string | null;

  if (!(file instanceof File))
    return c.json({ error: 'El campo file es requerido y debe ser un archivo' }, 400);
  if (file.type !== 'application/pdf')
    return c.json({ error: 'Solo se aceptan archivos PDF' }, 400);
  if (file.size > 20 * 1024 * 1024)
    return c.json({ error: 'El archivo no puede superar los 20MB' }, 400);

  const parsed = uploadResourceSchema.safeParse({
    subjectId,
    title:     title     ?? undefined,
    type,
    subtype:   subtype   ?? undefined,
    topic:     topic     ?? undefined,
    examYear:  examYear  ?? undefined,
    examMonth: examMonth ?? undefined,
    examDay:   examDay   ?? undefined,
    notes:     notes     ?? undefined,
  });
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0].message }, 400);

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, parsed.data.subjectId),
  });
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

  const resourceId = crypto.randomUUID();
  const now = new Date();
  const key = `public/${parsed.data.subjectId}/${resourceId}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.uploadFile(key, buffer, 'application/pdf');

  const user = c.get('user');
  const resourceTitle = parsed.data.type === 'resumen'
    ? parsed.data.title!
    : buildResourceTitle(parsed.data.type, subject.title, {
        subtype:   parsed.data.subtype  ?? null,
        examYear:  parsed.data.examYear,
        examMonth: parsed.data.examMonth,
        examDay:   parsed.data.examDay  ?? null,
        topic:     parsed.data.topic    ?? null,
      });

  const [resource] = await db.insert(resources).values({
    id:          resourceId,
    subjectId:   parsed.data.subjectId,
    uploadedBy:  user.sub,
    reviewedBy:  user.sub,
    title:       resourceTitle,
    type:        parsed.data.type,
    subtype:     parsed.data.subtype  ?? null,
    status:      'published',
    r2Key:       key,
    topic:       parsed.data.topic    ?? null,
    examYear:    parsed.data.examYear,
    examMonth:   parsed.data.examMonth,
    examDay:     parsed.data.examDay  ?? null,
    notes:       parsed.data.notes    ?? null,
    publishedAt: now,
  }).returning();

  return c.json(rowToAdminResource(resource, subject.title), 201);
});

// ─── PATCH /bulk-approve — aprobar múltiples recursos pendientes ──────────────

const bulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

app.patch('/bulk-approve', ...adminGuard, zValidator('json', bulkApproveSchema), async (c) => {
  const { ids } = c.req.valid('json');
  const user = c.get('user');

  const rows = await db.query.resources.findMany({
    where: inArray(resources.id, ids),
  });

  const approved: string[] = [];
  const errors: Array<{ id: string; reason: string }> = [];

  for (const resource of rows) {
    if (resource.status !== 'pending') {
      errors.push({ id: resource.id, reason: 'No está en estado pendiente' });
      continue;
    }
    if (!resource.r2Key) {
      errors.push({ id: resource.id, reason: 'No tiene archivo' });
      continue;
    }
    try {
      const destKey = `public/${resource.subjectId}/${resource.id}.pdf`;
      await storage.moveFile(resource.r2Key, destKey);
      await db.update(resources)
        .set({
          status:      'published',
          r2Key:       destKey,
          reviewedBy:  user.sub,
          publishedAt: new Date(),
          updatedAt:   new Date(),
        })
        .where(eq(resources.id, resource.id));
      approved.push(resource.id);
    } catch {
      errors.push({ id: resource.id, reason: 'Error al mover el archivo en storage' });
    }
  }

  const foundIds = new Set(rows.map(r => r.id));
  for (const id of ids) {
    if (!foundIds.has(id)) errors.push({ id, reason: 'Recurso no encontrado' });
  }

  return c.json({ approved, errors });
});

// ─── GET /:id — detalle con similar resources ─────────────────────────────────

app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });
  if (!resource) return c.json({ error: 'Recurso no encontrado' }, 404);

  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, resource.subjectId) });

  const hasMeta = resource.examYear && resource.examMonth;
  let similarResources: Array<{
    id: string; title: string; status: string;
    uploadedBy: string; createdAt: string; fileUrl: string | null;
  }> = [];

  if (hasMeta && resource.type !== 'resumen') {
    const similarRows = await db.select({
      id:         resources.id,
      title:      resources.title,
      status:     resources.status,
      uploadedBy: resources.uploadedBy,
      createdAt:  resources.createdAt,
      r2Key:      resources.r2Key,
    })
    .from(resources)
    .where(and(
      eq(resources.subjectId, resource.subjectId),
      eq(resources.type, resource.type),
      sql`${resources.subtype} IS NOT DISTINCT FROM ${resource.subtype}`,
      sql`${resources.topic} IS NOT DISTINCT FROM ${resource.topic}`,
      ne(resources.status, 'rejected'),
      ne(resources.id, id),
      and(eq(resources.examYear, resource.examYear!), eq(resources.examMonth, resource.examMonth!))!,
      ...(resource.type === 'final'
        ? [sql`${resources.examDay} IS NOT DISTINCT FROM ${resource.examDay}`]
        : []),
    ));

    similarResources = similarRows.map(r => ({
      id:         r.id,
      title:      r.title,
      status:     r.status,
      uploadedBy: r.uploadedBy,
      createdAt:  r.createdAt.toISOString(),
      fileUrl:    r.r2Key && r.status === 'published' ? storage.getPublicUrl(r.r2Key) : null,
    }));
  }

  return c.json({ ...rowToAdminResource(resource, subject?.title ?? undefined), similarResources });
});

// ─── GET /:id/preview — signed URL para previsualizar ────────────────────────

app.get('/:id/preview', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });

  if (!resource)       return c.json({ error: 'Recurso no encontrado' }, 404);
  if (!resource.r2Key) return c.json({ error: 'El recurso no tiene archivo' }, 409);

  const signedUrl = await storage.getSignedUrl(resource.r2Key);
  return c.json({ signedUrl });
});

// ─── PATCH /:id/approve — aprobar recurso pendiente ──────────────────────────

app.patch('/:id/approve', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });

  if (!resource)
    return c.json({ error: 'Recurso no encontrado' }, 404);
  if (resource.status !== 'pending')
    return c.json({ error: 'Solo se pueden aprobar recursos en estado pendiente' }, 409);
  if (!resource.r2Key)
    return c.json({ error: 'El recurso no tiene archivo' }, 409);

  const destKey = `public/${resource.subjectId}/${id}.pdf`;
  await storage.moveFile(resource.r2Key, destKey);

  const user = c.get('user');
  const [updated] = await db.update(resources)
    .set({
      status:      'published',
      r2Key:       destKey,
      reviewedBy:  user.sub,
      publishedAt: new Date(),
      updatedAt:   new Date(),
    })
    .where(eq(resources.id, id))
    .returning();

  return c.json(rowToAdminResource(updated));
});

// ─── PATCH /:id/reject — rechazar recurso pendiente ──────────────────────────

const rejectSchema = z.object({ reason: z.string().min(1) });

app.patch('/:id/reject', ...adminGuard, zValidator('json', rejectSchema), async (c) => {
  const id = c.req.param('id');
  const { reason } = c.req.valid('json');

  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });

  if (!resource)
    return c.json({ error: 'Recurso no encontrado' }, 404);
  if (resource.status !== 'pending')
    return c.json({ error: 'Solo se pueden rechazar recursos en estado pendiente' }, 409);

  if (resource.r2Key) await storage.deleteFile(resource.r2Key);

  const user = c.get('user');
  const [updated] = await db.update(resources)
    .set({
      status:          'rejected',
      rejectionReason: reason,
      reviewedBy:      user.sub,
      r2Key:           null,
      updatedAt:       new Date(),
    })
    .where(eq(resources.id, id))
    .returning();

  return c.json(rowToAdminResource(updated));
});

app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');

  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });

  if (!resource)
    return c.json({ error: 'Recurso no encontrado' }, 404);

  if (resource.r2Key) await storage.deleteFile(resource.r2Key);

  await db.delete(resources).where(eq(resources.id, id));

  return c.body(null, 204);
});

// ─── PATCH /:id — editar campos de un recurso ────────────────────────────────

const updateBodySchema = z.object({
  type:      z.enum(['resumen', 'parcial', 'final']).optional(),
  title:     z.string().min(1).max(255).nullable().optional(),
  subtype:   z.enum(['parcial', 'recuperatorio', 'prefinal', 'parcialito']).nullable().optional(),
  topic:     z.number().int().min(1).max(5).nullable().optional(),
  examYear:  z.number().int().min(1900).max(2100).nullable().optional(),
  examMonth: z.number().int().min(1).max(12).nullable().optional(),
  examDay:   z.number().int().min(1).max(31).nullable().optional(),
  notes:     z.string().nullable().optional(),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateBodySchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });
  if (!resource) return c.json({ error: 'Recurso no encontrado' }, 404);

  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, resource.subjectId) });

  const newType      = body.type      ?? resource.type;
  const newSubtype   = 'subtype'  in body ? (body.subtype   ?? null) : resource.subtype;
  const newExamYear  = 'examYear'  in body ? (body.examYear  ?? null) : resource.examYear;
  const newExamMonth = 'examMonth' in body ? (body.examMonth ?? null) : resource.examMonth;
  const newExamDay   = 'examDay'   in body ? (body.examDay   ?? null) : resource.examDay;
  const newTopic     = 'topic'     in body ? (body.topic     ?? null) : resource.topic;

  let newTitle: string;
  if (newType === 'resumen') {
    newTitle = 'title' in body && body.title ? body.title : resource.title;
  } else {
    newTitle = buildResourceTitle(newType, subject?.title ?? '', {
      subtype:   newSubtype,
      examYear:  newExamYear,
      examMonth: newExamMonth,
      examDay:   newExamDay,
      topic:     newTopic,
    });
  }

  const setFields: Partial<typeof resources.$inferInsert> = {
    title: newTitle, type: newType, updatedAt: new Date(),
  };
  if ('subtype'   in body) setFields.subtype   = body.subtype   ?? null;
  if ('examYear'  in body) setFields.examYear  = body.examYear  ?? null;
  if ('examMonth' in body) setFields.examMonth = body.examMonth ?? null;
  if ('examDay'   in body) setFields.examDay   = body.examDay   ?? null;
  if ('topic'     in body) setFields.topic     = body.topic     ?? null;
  if ('notes'     in body) setFields.notes     = body.notes     ?? null;

  const [updated] = await db.update(resources).set(setFields).where(eq(resources.id, id)).returning();
  return c.json(rowToAdminResource(updated, subject?.title ?? undefined));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToAdminResource(
  row: typeof resources.$inferSelect,
  subjectTitle?: string,
  careerInfo?: { careerName: string; planName: string; planYear: number },
) {
  return {
    id:              row.id,
    subjectId:       row.subjectId,
    subjectTitle:    subjectTitle ?? null,
    careerName:      careerInfo?.careerName ?? null,
    planName:        careerInfo?.planName   ?? null,
    planYear:        careerInfo?.planYear   ?? null,
    uploadedBy:      row.uploadedBy,
    reviewedBy:      row.reviewedBy,
    title:           row.title,
    type:            row.type,
    subtype:         row.subtype         ?? null,
    status:          row.status,
    examYear:        row.examYear        ?? null,
    examMonth:       row.examMonth       ?? null,
    examDay:         row.examDay         ?? null,
    topic:           row.topic           ?? null,
    notes:           row.notes           ?? null,
    rejectionReason: row.rejectionReason ?? null,
    downloadCount:   row.downloadCount,
    publishedAt:     row.publishedAt?.toISOString()  ?? null,
    createdAt:       row.createdAt.toISOString(),
    updatedAt:       row.updatedAt.toISOString(),
    fileUrl:         row.r2Key && row.status === 'published'
      ? storage.getPublicUrl(row.r2Key)
      : null,
  };
}

export default app;

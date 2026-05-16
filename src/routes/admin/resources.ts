import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { db } from '@/db';
import { resources, subjects, careerSubjects } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { storage } from '@/services/storage';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// ─── GET / — listar recursos (todos los estados) ──────────────────────────────

const listSchema = z.object({
  status:    z.enum(['pending', 'published', 'rejected']).optional(),
  subjectId: z.string().optional(),
  careerId:  z.string().optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { status, subjectId, careerId, page, limit } = c.req.valid('query');
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

  const total = countResult[0]?.count ?? 0;
  return c.json(buildPaginatedResponse(
    rows.map(r => rowToAdminResource(r.resource, r.subjectTitle ?? undefined)),
    total, safePage, safeLimit,
  ));
});

// ─── POST / — subir recurso (admin, auto-publicado) ───────────────────────────

const uploadBodySchema = z.object({
  subjectId: z.string().min(1),
  type:      z.enum(['resumen', 'parcial', 'final']),
  examDate:  z.string().date().optional(),
  period:    z.string().max(20).optional(),
  notes:     z.string().optional(),
});

app.post('/', ...adminGuard, async (c) => {
  const formData = await c.req.formData();
  const file      = formData.get('file');
  const subjectId = formData.get('subjectId') as string | null;
  const type      = formData.get('type') as string | null;
  const examDate  = formData.get('examDate') as string | null;
  const period    = formData.get('period') as string | null;
  const notes     = formData.get('notes') as string | null;

  if (!(file instanceof File))
    return c.json({ error: 'El campo file es requerido y debe ser un archivo' }, 400);
  if (file.type !== 'application/pdf')
    return c.json({ error: 'Solo se aceptan archivos PDF' }, 400);
  if (file.size > 20 * 1024 * 1024)
    return c.json({ error: 'El archivo no puede superar los 20MB' }, 400);

  const parsed = uploadBodySchema.safeParse({
    subjectId,
    type,
    examDate: examDate ?? undefined,
    period:   period   ?? undefined,
    notes:    notes    ?? undefined,
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
  const title = buildTitle(parsed.data.type, subject.title, parsed.data.period);

  const [resource] = await db.insert(resources).values({
    id:          resourceId,
    subjectId:   parsed.data.subjectId,
    uploadedBy:  user.sub,
    reviewedBy:  user.sub,
    title,
    type:        parsed.data.type,
    status:      'published',
    r2Key:       key,
    examDate:    parsed.data.examDate ?? null,
    period:      parsed.data.period   ?? null,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTitle(type: string, subjectTitle: string, period?: string): string {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  return period
    ? `${typeLabel} - ${subjectTitle} - ${period}`
    : `${typeLabel} - ${subjectTitle}`;
}

function rowToAdminResource(row: typeof resources.$inferSelect, subjectTitle?: string) {
  return {
    id:              row.id,
    subjectId:       row.subjectId,
    subjectTitle:    subjectTitle ?? null,
    uploadedBy:      row.uploadedBy,
    reviewedBy:      row.reviewedBy,
    title:           row.title,
    type:            row.type,
    status:          row.status,
    r2Key:           row.r2Key,
    examDate:        row.examDate        ?? null,
    period:          row.period          ?? null,
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

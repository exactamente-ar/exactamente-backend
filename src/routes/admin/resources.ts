import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { resources, subjects } from '@/db/schema';
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
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { status, subjectId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  const conditions = [];
  if (status)    conditions.push(eq(resources.status, status));
  if (subjectId) conditions.push(eq(resources.subjectId, subjectId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.query.resources.findMany({
      where: whereClause,
      limit: safeLimit,
      offset,
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    }),
    db.select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  return c.json(buildPaginatedResponse(rows.map(rowToAdminResource), total, safePage, safeLimit));
});

// ─── POST / — subir recurso a staging ────────────────────────────────────────

const uploadBodySchema = z.object({
  subjectId: z.string().min(1),
  title:     z.string().min(1).max(255),
  type:      z.enum(['resumen', 'parcial', 'final']),
});

app.post('/', ...adminGuard, async (c) => {
  const formData = await c.req.formData();
  const file      = formData.get('file');
  const subjectId = formData.get('subjectId');
  const title     = formData.get('title');
  const type      = formData.get('type');

  if (!(file instanceof File))
    return c.json({ error: 'El campo file es requerido y debe ser un archivo' }, 400);

  const parsed = uploadBodySchema.safeParse({ subjectId, title, type });
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0].message }, 400);

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, parsed.data.subjectId),
  });
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

  const resourceId = crypto.randomUUID();
  const { path, mimeType, size } = await storage.saveToStaging(file, resourceId);

  const user = c.get('user');
  const [resource] = await db.insert(resources).values({
    id:              resourceId,
    subjectId:       parsed.data.subjectId,
    uploadedBy:      user.sub,
    title:           parsed.data.title,
    type:            parsed.data.type,
    status:          'pending',
    stagingPath:     path,
    stagingMimeType: mimeType,
    stagingSize:     size,
  }).returning();

  return c.json(rowToAdminResource(resource), 201);
});

// ─── POST /:id/publish — publicar recurso pendiente ───────────────────────────

app.post('/:id/publish', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });

  if (!resource)
    return c.json({ error: 'Recurso no encontrado' }, 404);
  if (resource.status !== 'pending')
    return c.json({ error: 'Solo se pueden publicar recursos en estado pendiente' }, 409);
  if (!resource.stagingPath)
    return c.json({ error: 'El recurso no tiene archivo en staging' }, 409);

  const targetPath = `subjects/${resource.subjectId}`;
  const fileName = resource.stagingPath.split('/').at(-1) ?? `${id}.bin`;

  const result = await storage.publishFile(resource.stagingPath, targetPath, fileName);

  const user = c.get('user');
  const [updated] = await db.update(resources)
    .set({
      status:          'published',
      driveFileId:     result.fileId,
      driveMimeType:   result.mimeType,
      driveSize:       result.size,
      reviewedBy:      user.sub,
      publishedAt:     new Date(),
      updatedAt:       new Date(),
      stagingPath:     null,
      stagingMimeType: null,
      stagingSize:     null,
    })
    .where(eq(resources.id, id))
    .returning();

  return c.json(rowToAdminResource(updated));
});

// ─── POST /:id/reject — rechazar recurso pendiente ────────────────────────────

const rejectSchema = z.object({ reason: z.string().min(1) });

app.post('/:id/reject', ...adminGuard, zValidator('json', rejectSchema), async (c) => {
  const id = c.req.param('id');
  const { reason } = c.req.valid('json');

  const resource = await db.query.resources.findFirst({ where: eq(resources.id, id) });

  if (!resource)
    return c.json({ error: 'Recurso no encontrado' }, 404);
  if (resource.status !== 'pending')
    return c.json({ error: 'Solo se pueden rechazar recursos en estado pendiente' }, 409);

  if (resource.stagingPath) {
    await storage.deleteFile(resource.stagingPath);
  }

  const user = c.get('user');
  const [updated] = await db.update(resources)
    .set({
      status:          'rejected',
      rejectionReason: reason,
      reviewedBy:      user.sub,
      updatedAt:       new Date(),
      stagingPath:     null,
      stagingMimeType: null,
      stagingSize:     null,
    })
    .where(eq(resources.id, id))
    .returning();

  return c.json(rowToAdminResource(updated));
});

// ─── Row mapper ───────────────────────────────────────────────────────────────

function rowToAdminResource(row: typeof resources.$inferSelect) {
  return {
    id:              row.id,
    subjectId:       row.subjectId,
    uploadedBy:      row.uploadedBy,
    reviewedBy:      row.reviewedBy,
    title:           row.title,
    type:            row.type,
    status:          row.status,
    stagingPath:     row.stagingPath,
    stagingSize:     row.stagingSize,
    driveFileId:     row.driveFileId,
    driveSize:       row.driveSize,
    rejectionReason: row.rejectionReason,
    downloadCount:   row.downloadCount,
    publishedAt:     row.publishedAt?.toISOString() ?? null,
    createdAt:       row.createdAt.toISOString(),
    updatedAt:       row.updatedAt.toISOString(),
    previewUrl:      row.driveFileId ? storage.getPreviewUrl(row.driveFileId) : null,
    downloadUrl:     row.driveFileId ? storage.getDownloadUrl(row.driveFileId) : null,
  };
}

export default app;

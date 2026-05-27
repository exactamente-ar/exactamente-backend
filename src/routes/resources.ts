import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@/db';
import { resources, subjects } from '@/db/schema';
import { storage } from '@/services/storage';
import { verifyToken } from '@/middleware/auth';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { uploadResourceSchema } from '@/validators/resource.validators';
import type { AppContext } from '@/types';

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function buildResourceTitle(type: string, subjectTitle: string, data: {
  examDate?: string | null;
  examYear?: number | null;
  examMonth?: number | null;
  topic?: number | null;
}): string {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  let base = `${typeLabel} - ${subjectTitle}`;
  if (data.examDate) {
    const [y, m, d] = data.examDate.split('-');
    base += ` - ${d}/${m}/${y}`;
  } else if (data.examYear && data.examMonth) {
    base += ` - ${MONTHS_ES[data.examMonth - 1]} ${data.examYear}`;
  }
  if (data.topic) base += ` (Tema ${data.topic})`;
  return base;
}

const resourceQuerySchema = z.object({
  subjectId: z.string().optional(),
  type:      z.enum(['resumen', 'parcial', 'final']).optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

const app = new Hono<AppContext>();

// ─── GET / — listar recursos publicados ──────────────────────────────────────

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
    id:            r.id,
    subjectId:     r.subjectId,
    title:         r.title,
    type:          r.type,
    status:        r.status,
    examDate:      r.examDate    ?? null,
    examYear:      r.examYear    ?? null,
    examMonth:     r.examMonth   ?? null,
    topic:         r.topic       ?? null,
    notes:         r.notes       ?? null,
    downloadCount: r.downloadCount,
    publishedAt:   r.publishedAt?.toISOString() ?? null,
    createdAt:     r.createdAt.toISOString(),
    fileUrl:       r.r2Key ? storage.getPublicUrl(r.r2Key) : null,
  }));

  return c.json(buildPaginatedResponse(data, total, safePage, safeLimit));
});

// ─── POST / — subir recurso (usuario autenticado) ────────────────────────────

app.post('/', verifyToken, async (c) => {
  const formData = await c.req.formData();
  const file      = formData.get('file');
  const subjectId = formData.get('subjectId') as string | null;
  const type      = formData.get('type') as string | null;
  const examDate  = formData.get('examDate') as string | null;
  const topic     = formData.get('topic') as string | null;
  const examYear  = formData.get('examYear') as string | null;
  const examMonth = formData.get('examMonth') as string | null;
  const notes     = formData.get('notes') as string | null;

  if (!(file instanceof File))
    return c.json({ error: 'El campo file es requerido y debe ser un archivo' }, 400);
  if (file.type !== 'application/pdf')
    return c.json({ error: 'Solo se aceptan archivos PDF' }, 400);
  if (file.size > 20 * 1024 * 1024)
    return c.json({ error: 'El archivo no puede superar los 20MB' }, 400);

  const parsed = uploadResourceSchema.safeParse({
    subjectId,
    type,
    examDate:  examDate  ?? undefined,
    topic:     topic     ?? undefined,
    examYear:  examYear  ?? undefined,
    examMonth: examMonth ?? undefined,
    notes:     notes     ?? undefined,
  });
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0].message }, 400);

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, parsed.data.subjectId),
  });
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

  const resourceId = crypto.randomUUID();
  const key = `pending/${resourceId}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.uploadFile(key, buffer, 'application/pdf');

  const user = c.get('user');
  const title = buildResourceTitle(parsed.data.type, subject.title, {
    examDate:  parsed.data.examDate  ?? null,
    examYear:  parsed.data.examYear  ?? null,
    examMonth: parsed.data.examMonth ?? null,
    topic:     parsed.data.topic     ?? null,
  });

  const [resource] = await db.insert(resources).values({
    id:         resourceId,
    subjectId:  parsed.data.subjectId,
    uploadedBy: user.sub,
    title,
    type:       parsed.data.type,
    status:     'pending',
    r2Key:      key,
    examDate:   parsed.data.examDate  ?? null,
    topic:      parsed.data.topic     ?? null,
    examYear:   parsed.data.examYear  ?? null,
    examMonth:  parsed.data.examMonth ?? null,
    notes:      parsed.data.notes     ?? null,
  }).returning();

  return c.json({
    id:        resource.id,
    subjectId: resource.subjectId,
    title:     resource.title,
    type:      resource.type,
    status:    resource.status,
    examDate:  resource.examDate  ?? null,
    examYear:  resource.examYear  ?? null,
    examMonth: resource.examMonth ?? null,
    topic:     resource.topic     ?? null,
    notes:     resource.notes     ?? null,
    createdAt: resource.createdAt.toISOString(),
  }, 201);
});

export { buildResourceTitle };
export default app;

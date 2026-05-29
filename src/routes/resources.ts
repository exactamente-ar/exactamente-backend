import { Hono } from 'hono';
import { eq, and, ne, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@/db';
import { resources, subjects } from '@/db/schema';
import { storage } from '@/services/storage';
import { verifyToken } from '@/middleware/auth';
import { rateLimit } from '@/middleware/rateLimit';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { uploadResourceSchema } from '@/validators/resource.validators';
import type { AppContext } from '@/types';

const uploadRateLimit = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000 }); // 10 uploads/hora por IP
const publicReadLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 }); // 100 req/min

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function buildResourceTitle(type: string, subjectTitle: string, data: {
  subtype?: string | null;
  examYear?: number | null;
  examMonth?: number | null;
  topic?: number | null;
}): string {
  const label = type === 'parcial' && data.subtype
    ? data.subtype.charAt(0).toUpperCase() + data.subtype.slice(1)
    : type.charAt(0).toUpperCase() + type.slice(1);
  let base = `${label} - ${subjectTitle}`;
  if (data.examYear && data.examMonth) {
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

app.get('/', publicReadLimit, zValidator('query', resourceQuerySchema), async (c) => {
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
    subtype:       r.subtype       ?? null,
    status:        r.status,
    examYear:      r.examYear      ?? null,
    examMonth:     r.examMonth     ?? null,
    topic:         r.topic         ?? null,
    notes:         r.notes         ?? null,
    downloadCount: r.downloadCount,
    publishedAt:   r.publishedAt?.toISOString() ?? null,
    createdAt:     r.createdAt.toISOString(),
    fileUrl:       r.r2Key ? storage.getPublicUrl(r.r2Key) : null,
  }));

  return c.json(buildPaginatedResponse(data, total, safePage, safeLimit));
});

// ─── POST /check-duplicate — verificar posibles duplicados antes de subir ────

const checkDuplicateSchema = z.object({
  subjectId:  z.string().min(1),
  type:       z.enum(['resumen', 'parcial', 'final']),
  subtype:    z.enum(['parcial', 'recuperatorio', 'prefinal', 'parcialito']).optional(),
  examYear:   z.number().int().min(1900).max(2100).optional(),
  examMonth:  z.number().int().min(1).max(12).optional(),
  topic:      z.number().int().min(1).max(5).optional(),
});

app.post('/check-duplicate', verifyToken, zValidator('json', checkDuplicateSchema), async (c) => {
  const { subjectId, type, subtype, examYear, examMonth, topic } = c.req.valid('json');

  if (type === 'resumen' || !examYear || !examMonth) {
    return c.json({ hasSimilar: false, similar: [] });
  }

  const rows = await db.select({
    id:     resources.id,
    title:  resources.title,
    status: resources.status,
  })
  .from(resources)
  .where(and(
    eq(resources.subjectId, subjectId),
    eq(resources.type, type),
    sql`${resources.subtype} IS NOT DISTINCT FROM ${subtype ?? null}`,
    sql`${resources.topic} IS NOT DISTINCT FROM ${topic ?? null}`,
    ne(resources.status, 'rejected'),
    and(eq(resources.examYear, examYear), eq(resources.examMonth, examMonth))!,
  ));

  return c.json({ hasSimilar: rows.length > 0, similar: rows });
});

// ─── POST / — subir recurso (usuario autenticado) ────────────────────────────

app.post('/', verifyToken, uploadRateLimit, async (c) => {
  const formData = await c.req.formData();
  const file      = formData.get('file');
  const subjectId = formData.get('subjectId') as string | null;
  const title     = formData.get('title') as string | null;
  const type      = formData.get('type') as string | null;
  const subtype   = formData.get('subtype') as string | null;
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

  const buffer = await file.arrayBuffer();
  const magic = new Uint8Array(buffer).slice(0, 4);
  const isPdf = magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46;
  if (!isPdf) {
    return c.json({ error: 'El archivo no es un PDF válido' }, 400);
  }

  const parsed = uploadResourceSchema.safeParse({
    subjectId,
    title:     title     ?? undefined,
    type,
    subtype:   subtype   ?? undefined,
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
  await storage.uploadFile(key, Buffer.from(buffer), 'application/pdf');

  const user = c.get('user');
  const resourceTitle = parsed.data.type === 'resumen'
    ? parsed.data.title!
    : buildResourceTitle(parsed.data.type, subject.title, {
        subtype:   parsed.data.subtype  ?? null,
        examYear:  parsed.data.examYear,
        examMonth: parsed.data.examMonth,
        topic:     parsed.data.topic    ?? null,
      });

  const [resource] = await db.insert(resources).values({
    id:         resourceId,
    subjectId:  parsed.data.subjectId,
    uploadedBy: user.sub,
    title:      resourceTitle,
    type:       parsed.data.type,
    subtype:    parsed.data.subtype   ?? null,
    status:     'pending',
    r2Key:      key,
    topic:      parsed.data.topic     ?? null,
    examYear:   parsed.data.examYear,
    examMonth:  parsed.data.examMonth,
    notes:      parsed.data.notes     ?? null,
  }).returning();

  return c.json({
    id:        resource.id,
    subjectId: resource.subjectId,
    title:     resource.title,
    type:      resource.type,
    subtype:   resource.subtype   ?? null,
    status:    resource.status,
    examYear:  resource.examYear  ?? null,
    examMonth: resource.examMonth ?? null,
    topic:     resource.topic     ?? null,
    notes:     resource.notes     ?? null,
    createdAt: resource.createdAt.toISOString(),
  }, 201);
});

export { buildResourceTitle };
export default app;

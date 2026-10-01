import { z } from 'zod/v4';
import { IsoDateTime } from './common';
import { ResourceTypeSchema } from './resources';

/**
 * `GET /admin/stats` — una sola llamada devuelve todos los contadores escalares.
 * No hay endpoints por métrica suelta.
 *
 * Las agregaciones parametrizables (series, rankings, percentiles) viven en
 * `/admin/stats/<vista>` y están más abajo en este archivo. Van aparte porque
 * tienen query params propios y porque este endpoint alimenta el badge del
 * sidebar en cada navegación: tiene que seguir siendo barato.
 */
export const AdminStatsSchema = z
  .object({
    resources: z.object({
      total: z.number().int(),
      byStatus: z.object({
        pending: z.number().int().describe('Recursos esperando moderación'),
        published: z.number().int(),
        rejected: z.number().int(),
      }),
      byType: z.object({
        resumen: z.number().int(),
        parcial: z.number().int(),
        final: z.number().int(),
      }),
    }),
    coverage: z.object({
      subjectsWithResources: z
        .number()
        .int()
        .describe('Materias con ≥1 recurso publicado — solo cuenta published'),
      subjectsWithoutResources: z.number().int(),
    }),
    counts: z.object({
      users: z.number().int(),
      subjects: z.number().int(),
      careers: z.number().int(),
      faculties: z.number().int(),
      universities: z.number().int(),
    }),
  })
  .meta({ id: 'AdminStats' });

export type AdminStats = z.infer<typeof AdminStatsSchema>;

// ─── GET /admin/stats/activity ───────────────────────────────────────────────

export const StatsGranularitySchema = z.enum(['day', 'week']).meta({ id: 'StatsGranularity' });

export const ActivityPointSchema = z
  .object({
    date: z.string().describe('Inicio del bucket, YYYY-MM-DD, en America/Argentina/Buenos_Aires'),
    uploads: z.number().int().describe('Recursos creados en el bucket (created_at)'),
    publications: z.number().int().describe('Recursos publicados en el bucket (published_at)'),
  })
  .meta({ id: 'ActivityPoint' });

export const AdminActivitySchema = z
  .object({
    granularity: StatsGranularitySchema,
    from: z.string().describe('Primer bucket, YYYY-MM-DD'),
    to: z.string().describe('Último bucket, YYYY-MM-DD'),
    points: z
      .array(ActivityPointSchema)
      .describe('Serie sin huecos: los buckets sin actividad vienen en 0, no ausentes'),
  })
  .meta({ id: 'AdminActivity' });

export type AdminActivity = z.infer<typeof AdminActivitySchema>;

// ─── GET /admin/stats/rankings ───────────────────────────────────────────────

export const TopUploaderSchema = z
  .object({
    userId: z.string(),
    displayName: z.string(),
    total: z.number().int().describe('Recursos subidos en la ventana, en cualquier estado'),
    published: z.number().int().describe('De esos, cuántos terminaron publicados'),
  })
  .meta({ id: 'TopUploader' });

export const TopResourceSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    subjectTitle: z.string().nullable(),
    type: ResourceTypeSchema,
    downloadCount: z.number().int(),
  })
  .meta({ id: 'TopResource' });

export const AdminRankingsSchema = z
  .object({
    days: z.number().int(),
    topUploaders: z.array(TopUploaderSchema),
    topResources: z
      .array(TopResourceSchema)
      .describe(
        'Histórico completo. `download_count` es un escalar sin fecha, así que `days` NO aplica acá',
      ),
  })
  .meta({ id: 'AdminRankings' });

export type AdminRankings = z.infer<typeof AdminRankingsSchema>;

// ─── GET /admin/stats/moderation ─────────────────────────────────────────────

export const ModerationLeadTimeSchema = z
  .object({
    sample: z.number().int().describe('Recursos publicados en la ventana'),
    avgHours: z.number().nullable(),
    p50Hours: z.number().nullable(),
    p90Hours: z.number().nullable(),
  })
  .describe(
    'Horas entre que un recurso se sube y se publica. Con `sample: 0` los tres percentiles ' +
      'son null y no 0: "no hubo datos" y "tardó cero" no son lo mismo',
  )
  .meta({ id: 'ModerationLeadTime' });

export const PendingQueueAgeSchema = z
  .object({
    total: z.number().int(),
    under24h: z.number().int(),
    d1to3: z.number().int().describe('Entre 1 y 3 días'),
    d3to7: z.number().int().describe('Entre 3 y 7 días'),
    over7d: z.number().int().describe('Más de 7 días'),
    oldestCreatedAt: IsoDateTime.nullable(),
  })
  .describe('Antigüedad de la cola de moderación. No depende de `days`: es el estado actual')
  .meta({ id: 'PendingQueueAge' });

export const AdminModerationSchema = z
  .object({
    days: z.number().int(),
    leadTime: ModerationLeadTimeSchema,
    queue: PendingQueueAgeSchema,
  })
  .meta({ id: 'AdminModeration' });

export type AdminModeration = z.infer<typeof AdminModerationSchema>;

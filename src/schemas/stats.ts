import { z } from 'zod/v4';

/**
 * `GET /admin/stats` — una sola llamada devuelve todo el dashboard.
 * No hay endpoints por métrica.
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

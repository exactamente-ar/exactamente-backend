import { z } from 'zod/v4';
import { IsoDateTime } from './common';

export const ResourceTypeSchema = z.enum(['resumen', 'parcial', 'final']).meta({
  id: 'ResourceType',
});

export const ResourceSubtypeSchema = z
  .enum(['parcial', 'recuperatorio', 'prefinal', 'parcialito'])
  .meta({ id: 'ResourceSubtype' });

export const ResourceStatusSchema = z.enum(['pending', 'published', 'rejected']).meta({
  id: 'ResourceStatus',
});

/**
 * Respuesta pública de `GET /resources` (solo `status: 'published'`).
 *
 * ⚠️ `src/types/index.ts` declaraba `ResourcePublic` sin `subtype`, `examYear`,
 * `examMonth`, `examDay`, `topic` ni `notes` — seis campos que el handler sí
 * devuelve. Este schema documenta lo que realmente sale por el cable.
 */
export const ResourceSchema = z
  .object({
    id: z.string(),
    subjectId: z.string(),
    title: z
      .string()
      .describe('Para resúmenes lo pone el usuario; para parcial/final se auto-genera'),
    type: ResourceTypeSchema,
    subtype: ResourceSubtypeSchema.nullable().describe('Solo para type=parcial'),
    status: ResourceStatusSchema,
    examYear: z.number().int().nullable(),
    examMonth: z.number().int().nullable().describe('1–12'),
    examDay: z.number().int().nullable().describe('1–31; requerido para type=final'),
    topic: z.number().int().nullable().describe('Tema, 1–5'),
    notes: z.string().nullable(),
    downloadCount: z.number().int(),
    publishedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
    fileUrl: z
      .string()
      .nullable()
      .describe('URL pública ya resuelta. No construir URLs a mano; null si no está publicado'),
  })
  .meta({ id: 'Resource' });

/**
 * Respuesta de `GET /admin/resources`. Suma el contexto de moderación:
 * quién subió, quién revisó, y de qué materia/carrera/plan es.
 */
export const AdminResourceSchema = ResourceSchema.extend({
  subjectTitle: z.string().nullable(),
  careerName: z.string().nullable(),
  planName: z.string().nullable(),
  planYear: z.number().int().nullable(),
  uploadedBy: z.string().describe('ID del usuario que lo subió'),
  reviewedBy: z.string().nullable().describe('ID del admin que lo moderó'),
  rejectionReason: z.string().nullable(),
  updatedAt: IsoDateTime,
}).meta({ id: 'AdminResource' });

/** `POST /resources/check-duplicate` — aviso previo a subir. */
export const DuplicateSimilarSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: ResourceStatusSchema,
  })
  .meta({ id: 'DuplicateSimilar' });

export const CheckDuplicateResponseSchema = z
  .object({
    hasSimilar: z.boolean(),
    similar: z.array(DuplicateSimilarSchema),
  })
  .meta({ id: 'CheckDuplicateResponse' });

/** `PATCH /admin/resources/bulk-approve` — operación parcial. */
export const BulkApproveResponseSchema = z
  .object({
    approved: z.array(z.string()).describe('IDs aprobados con éxito'),
    errors: z
      .array(z.object({ id: z.string(), reason: z.string() }))
      .describe('Los que fallaron; no detienen al resto'),
  })
  .meta({ id: 'BulkApproveResponse' });

/** `GET /admin/resources/:id/preview` — URL firmada y temporal. */
export const SignedUrlResponseSchema = z
  .object({ signedUrl: z.string() })
  .meta({ id: 'SignedUrlResponse' });

export type Resource = z.infer<typeof ResourceSchema>;
export type AdminResource = z.infer<typeof AdminResourceSchema>;

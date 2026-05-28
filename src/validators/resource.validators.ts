import { z } from 'zod';

export const uploadResourceSchema = z.object({
  subjectId: z.string().min(1),
  title:     z.string().min(1).max(255).optional(),
  type:      z.enum(['resumen', 'parcial', 'final']),
  subtype:   z.enum(['parcial', 'recuperatorio', 'prefinal', 'parcialito']).optional(),
  examYear:  z.coerce.number().int().min(1900).max(2100),
  examMonth: z.coerce.number().int().min(1).max(12),
  topic:     z.coerce.number().int().min(1).max(5).optional(),
  notes:     z.string().optional(),
})
.refine(d => d.type !== 'resumen' || (d.title !== undefined && d.title.length > 0),
  { message: 'title es requerido para resúmenes' })
.refine(d => d.type !== 'parcial' || d.subtype !== undefined,
  { message: 'subtype es requerido para recursos de tipo parcial' })
.refine(d => d.type === 'parcial' || d.subtype === undefined,
  { message: 'subtype solo aplica a recursos de tipo parcial' });

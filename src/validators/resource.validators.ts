import { z } from 'zod';

export const uploadResourceSchema = z.object({
  subjectId:  z.string().min(1),
  type:       z.enum(['resumen', 'parcial', 'final']),
  examDate:   z.string().date().optional(),
  topic:      z.coerce.number().int().min(1).max(5).optional(),
  examYear:   z.coerce.number().int().min(1900).max(2100).optional(),
  examMonth:  z.coerce.number().int().min(1).max(12).optional(),
  notes:      z.string().optional(),
}).refine(
  d => (d.examYear === undefined) === (d.examMonth === undefined),
  { message: 'examYear y examMonth deben indicarse juntos' },
);

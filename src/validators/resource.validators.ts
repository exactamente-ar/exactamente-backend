import { z } from 'zod';

export const uploadResourceSchema = z.object({
  subjectId: z.string().min(1),
  type:      z.enum(['resumen', 'parcial', 'final']),
  examDate:  z.string().date().optional(),
  period:    z.string().max(20).optional(),
  notes:     z.string().optional(),
});

import { z } from 'zod';

export const createPostSchema = z.object({
  subtopicId: z.string().min(1, 'subtopicId es requerido'),
  body: z.string().min(1, 'El cuerpo no puede estar vacío').max(50_000, 'El cuerpo es muy largo'),
  authority: z.enum(['visible', 'anonymous']),
});

export const voteSchema = z.object({
  value: z
    .number()
    .int()
    .refine((v) => v === 1 || v === -1, 'value debe ser 1 o -1'),
});

export const createCommentSchema = z.object({
  parentId: z.string().nullable().optional(),
  body: z.string().min(1, 'El cuerpo no puede estar vacío').max(50_000, 'El cuerpo es muy largo'),
  authority: z.enum(['visible', 'anonymous']),
});

export const createSubtopicSchema = z.object({
  name: z.string().min(1, 'El nombre no puede estar vacío').max(100),
});

export const updateSubtopicSchema = z.object({
  name: z.string().min(1, 'El nombre no puede estar vacío').max(100),
});

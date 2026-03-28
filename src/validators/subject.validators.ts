import { z } from 'zod';

export const subjectFiltersSchema = z.object({
  careerId:    z.string().optional(),
  facultyId:   z.string().optional(),
  year:        z.coerce.number().int().min(1).max(5).optional(),
  quadmester:  z.coerce.number().int().min(1).max(2).optional(),
  search:      z.string().optional(),
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().max(100).default(20),
});

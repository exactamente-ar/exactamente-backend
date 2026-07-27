/**
 * University → Faculty → Career → CareerPlan
 *
 * ⚠️ Estas rutas devuelven la fila cruda de drizzle (`db.query.X.findMany()`
 * sin `.map()`), así que la respuesta incluye TODAS las columnas de la tabla.
 * Por eso `shortName` está acá aunque `src/types/index.ts` no lo listaba.
 */
import { z } from 'zod/v4';
import { IsoDateTime } from './common';

export const UniversitySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    shortName: z.string().nullable().describe('Nombre corto, ej: "UNICEN"'),
    slug: z.string().describe('Auto-generado desde name, único'),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'University' });

export const FacultySchema = z
  .object({
    id: z.string(),
    universityId: z.string(),
    name: z.string(),
    shortName: z.string().nullable().describe('Ej: "FACET"'),
    slug: z.string().describe('Único dentro de su universidad'),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'Faculty' });

export const CareerSchema = z
  .object({
    id: z.string(),
    facultyId: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
    slug: z.string().describe('Único dentro de su facultad'),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'Career' });

export const CareerPlanSchema = z
  .object({
    id: z.string(),
    careerId: z.string(),
    name: z.string().describe('Ej: "Plan 2023"'),
    year: z.number().int().describe('Año del plan'),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'CareerPlan' });

/**
 * `GET /api/v1/careers` NO pagina — devuelve `{ data: [...] }` a secas.
 * Es una excepción real del contrato, no un descuido: se documenta como es.
 */
export const CareerListSchema = z
  .object({ data: z.array(CareerSchema) })
  .meta({ id: 'CareerList' });

export type University = z.infer<typeof UniversitySchema>;
export type Faculty = z.infer<typeof FacultySchema>;
export type Career = z.infer<typeof CareerSchema>;
export type CareerPlan = z.infer<typeof CareerPlanSchema>;

import { z } from 'zod/v4';
import { IsoDateTime } from './common';

/** Campos propios de la materia, tal como los arma `rowToSubject()`. */
export const SubjectSchema = z
  .object({
    id: z.string(),
    facultyId: z.string(),
    title: z.string(),
    slug: z.string().describe('Se regenera si cambia el title'),
    description: z.string(),
    urlMoodle: z.string().describe('Puede ser cadena vacía, nunca null'),
    urlPrograma: z.string().describe('Puede ser cadena vacía, nunca null'),
    // Los rangos los impone subject.validators.ts en el input, así que la
    // salida de la API cae siempre dentro. Se declaran como rango y NO como
    // unión literal (`1 | 2`) a propósito: la columna es `smallint` sin CHECK
    // constraint, así que un seed o un script podrían meter otro valor. El
    // contrato documenta el rango esperado sin prometer lo que la base no
    // garantiza.
    year: z.number().int().min(1).max(5).describe('Año de cursada en el plan'),
    quadmester: z.number().int().min(1).max(2).describe('1 o 2'),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .meta({ id: 'Subject' });

/**
 * Una materia puede pertenecer a varias carreras (N:M vía `career_subjects`).
 *
 * `year` y `quadmester` acá son los de ESE plan y pueden diferir de los del
 * `Subject`, que son los valores originales de la materia.
 *
 * Los `*Name` ya vienen resueltos con el `shortName` cuando existe, si no el
 * nombre largo — el cliente no tiene que elegir.
 */
export const SubjectCareerSchema = z
  .object({
    careerId: z.string(),
    careerName: z.string(),
    facultyId: z.string(),
    facultyName: z.string(),
    universityId: z.string(),
    universityName: z.string(),
    planId: z.string(),
    year: z.number().int(),
    quadmester: z.number().int(),
  })
  .meta({ id: 'SubjectCareer' });

export const ResourceCountsSchema = z
  .object({
    resumen: z.number().int(),
    parcial: z.number().int(),
    final: z.number().int(),
  })
  .meta({ id: 'ResourceCounts' });

/**
 * Respuesta del LISTADO `GET /subjects`.
 *
 * ⚠️ Incluye `resourceCounts`; el detalle `GET /subjects/:id` NO lo trae.
 * Son dos shapes distintos y por eso hay dos schemas.
 */
export const SubjectWithCareersSchema = SubjectSchema.extend({
  careers: z.array(SubjectCareerSchema),
  resourceCounts: ResourceCountsSchema,
}).meta({ id: 'SubjectWithCareers' });

/** Respuesta del DETALLE `GET /subjects/:id` — sin `resourceCounts`. */
export const SubjectDetailSchema = SubjectSchema.extend({
  careers: z.array(SubjectCareerSchema),
}).meta({ id: 'SubjectDetail' });

export const SubjectDetailResponseSchema = z
  .object({ subject: SubjectDetailSchema })
  .meta({ id: 'SubjectDetailResponse' });

/** `GET /admin/subjects` suma el contador de recursos publicados. */
export const AdminSubjectSchema = SubjectSchema.extend({
  resourceCount: z.number().int().describe('Recursos en estado published'),
}).meta({ id: 'AdminSubject' });

/**
 * `GET /admin/career-plans/:id/subjects` proyecta un subconjunto: el SELECT no
 * trae `slug` ni `updatedAt`. Es un shape propio, no un AdminSubject.
 */
export const CareerPlanSubjectSchema = z
  .object({
    id: z.string(),
    facultyId: z.string(),
    title: z.string(),
    description: z.string(),
    urlMoodle: z.string().nullable(),
    urlPrograma: z.string().nullable(),
    year: z.number().int().min(1).max(5),
    quadmester: z.number().int().min(1).max(2),
    createdAt: IsoDateTime,
    resourceCount: z.number().int().describe('Recursos en estado published'),
  })
  .meta({ id: 'CareerPlanSubject' });

export type Subject = z.infer<typeof SubjectSchema>;
export type SubjectWithCareers = z.infer<typeof SubjectWithCareersSchema>;
export type SubjectDetail = z.infer<typeof SubjectDetailSchema>;
export type AdminSubject = z.infer<typeof AdminSubjectSchema>;

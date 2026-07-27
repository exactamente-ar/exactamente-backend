/**
 * Configuración del documento OpenAPI.
 *
 * Los schemas se declaran acá en `components.schemas` a propósito: sin eso,
 * hono-openapi genera `$ref: '#/components/schemas/X'` apuntando a un
 * `components` vacío y el spec queda roto — los clientes no pueden resolverlo.
 */
import { resolver } from 'hono-openapi';
import type { z } from 'zod/v4';
import * as S from '@/schemas';

/**
 * Schemas que quedan con nombre propio en el spec. Van los que un cliente
 * puede querer nombrar; los envoltorios de un solo uso se inlinean solos.
 */
const namedSchemas: Record<string, z.ZodType> = {
  // Catálogo
  University: S.UniversitySchema,
  Faculty: S.FacultySchema,
  Career: S.CareerSchema,
  CareerPlan: S.CareerPlanSchema,
  // Materias
  Subject: S.SubjectSchema,
  SubjectCareer: S.SubjectCareerSchema,
  ResourceCounts: S.ResourceCountsSchema,
  SubjectWithCareers: S.SubjectWithCareersSchema,
  SubjectDetail: S.SubjectDetailSchema,
  AdminSubject: S.AdminSubjectSchema,
  CareerPlanSubject: S.CareerPlanSubjectSchema,
  // Recursos
  ResourceType: S.ResourceTypeSchema,
  ResourceSubtype: S.ResourceSubtypeSchema,
  ResourceStatus: S.ResourceStatusSchema,
  Resource: S.ResourceSchema,
  AdminResource: S.AdminResourceSchema,
  DuplicateSimilar: S.DuplicateSimilarSchema,
  // Auth
  UserRole: S.UserRoleSchema,
  PublicUser: S.PublicUserSchema,
  // Transversales
  AdminStats: S.AdminStatsSchema,
  ErrorResponse: S.ErrorResponseSchema,
};

export const openApiDocumentation = {
  info: {
    title: 'Exactamente API',
    version: '1.0.0',
    description: [
      'Recursos universitarios de Exactas: parciales, resúmenes y finales.',
      '',
      'Este documento se genera desde los schemas Zod del backend, así que no',
      'puede desincronizarse de la validación. Los clientes (web, panel admin y',
      'servidor MCP) generan sus tipos desde acá.',
      '',
      '**Paginación:** `page` (default 1) y `limit` (default 20, máx 100).',
      'Excepción: `GET /careers` devuelve `{ data: [...] }` sin paginar.',
      '',
      '**Auth:** las rutas protegidas piden `Authorization: Bearer <jwt>`.',
      'Las de `/admin/*` requieren rol `admin` o `superadmin`.',
    ].join('\n'),
    license: { name: 'MIT', url: 'https://github.com/exactamente-ar/exactamente-backend' },
  },
  servers: [
    { url: 'https://api.exactamente.com.ar/api/v1', description: 'Producción' },
    { url: 'http://localhost:3000/api/v1', description: 'Local' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'bearer', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: Object.fromEntries(
      Object.entries(namedSchemas).map(([name, schema]) => [name, resolver(schema)]),
    ),
  },
  tags: [
    { name: 'Auth', description: 'Registro, login y sesión' },
    { name: 'Catálogo', description: 'Universidades, facultades, carreras y planes' },
    { name: 'Materias', description: 'Materias y su relación con las carreras' },
    { name: 'Recursos', description: 'Búsqueda y subida de material de estudio' },
    { name: 'Admin', description: 'Moderación y ABM. Requieren rol admin' },
  ],
};

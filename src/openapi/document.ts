/**
 * Configuración del documento OpenAPI.
 *
 * Los schemas se declaran acá en `components.schemas` a propósito: sin eso,
 * hono-openapi genera `$ref: '#/components/schemas/X'` apuntando a un
 * `components` vacío y el spec queda roto — los clientes no pueden resolverlo.
 */
import { z } from 'zod/v4';
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
  StatsGranularity: S.StatsGranularitySchema,
  ActivityPoint: S.ActivityPointSchema,
  AdminActivity: S.AdminActivitySchema,
  TopUploader: S.TopUploaderSchema,
  TopResource: S.TopResourceSchema,
  AdminRankings: S.AdminRankingsSchema,
  ModerationLeadTime: S.ModerationLeadTimeSchema,
  PendingQueueAge: S.PendingQueueAgeSchema,
  AdminModeration: S.AdminModerationSchema,
  ErrorResponse: S.ErrorResponseSchema,
};

/**
 * Convierte los schemas a JSON Schema con `z.toJSONSchema()` de Zod v4.
 *
 * NO se puede usar `resolver()` acá: hono-openapi solo lo resuelve dentro de la
 * definición de una ruta, no en `documentation.components.schemas`. Si se usa,
 * queda el objeto crudo `{ vendor: 'zod' }` en el spec — que es válido como
 * JSON, satisface los `$ref` y no rompe nada visible, pero hace que los
 * clientes generen `unknown` para TODOS los tipos. Silencioso y letal.
 *
 * La forma de registry hace que las referencias entre schemas salgan como
 * `$ref` a components en vez de inlinearse duplicadas.
 */
function buildComponentSchemas(): Record<string, unknown> {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(namedSchemas)) {
    registry.add(schema, { id });
  }

  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    io: 'output', // describen respuestas, no entradas
  });

  // `$schema` y `$id` son válidos en JSON Schema pero no dentro de un Schema
  // Object de OpenAPI.
  for (const schema of Object.values(schemas)) {
    delete (schema as Record<string, unknown>).$schema;
    delete (schema as Record<string, unknown>).$id;
  }

  return schemas;
}

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
    schemas: buildComponentSchemas(),
  },
  tags: [
    { name: 'Auth', description: 'Registro, login y sesión' },
    { name: 'Catálogo', description: 'Universidades, facultades, carreras y planes' },
    { name: 'Materias', description: 'Materias y su relación con las carreras' },
    { name: 'Recursos', description: 'Búsqueda y subida de material de estudio' },
    { name: 'Admin', description: 'Moderación y ABM. Requieren rol admin' },
  ],
};

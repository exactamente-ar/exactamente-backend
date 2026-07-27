/**
 * Punto único del contrato de la API.
 *
 * Estos schemas alimentan el OpenAPI que consumen frontend, admin y mcp. Si
 * cambiás uno, esos tres repos van a fallar a compilar hasta regenerar sus
 * tipos — que es exactamente la idea.
 *
 * Ver METODOLOGIA.md en el workspace para el flujo completo.
 */
export * from './common';
export * from './catalog';
export * from './subjects';
export * from './resources';
export * from './auth';
export * from './stats';

import { paginated } from './common';
import { UniversitySchema, FacultySchema, CareerSchema, CareerPlanSchema } from './catalog';
import { SubjectWithCareersSchema, AdminSubjectSchema } from './subjects';
import { ResourceSchema, AdminResourceSchema } from './resources';

/**
 * Envoltorios paginados, con nombre propio para que los clientes generen un
 * tipo con nombre en vez de una estructura anónima repetida.
 *
 * Ojo con carreras: `GET /admin/careers` SÍ pagina, el público `GET /careers` NO.
 * Por eso conviven PaginatedCareerSchema y CareerListSchema.
 */
export const PaginatedUniversitySchema = paginated(UniversitySchema, 'PaginatedUniversity');
export const PaginatedFacultySchema = paginated(FacultySchema, 'PaginatedFaculty');
export const PaginatedCareerSchema = paginated(CareerSchema, 'PaginatedCareer');
export const PaginatedCareerPlanSchema = paginated(CareerPlanSchema, 'PaginatedCareerPlan');
export const PaginatedSubjectSchema = paginated(SubjectWithCareersSchema, 'PaginatedSubject');
export const PaginatedAdminSubjectSchema = paginated(AdminSubjectSchema, 'PaginatedAdminSubject');
export const PaginatedResourceSchema = paginated(ResourceSchema, 'PaginatedResource');
export const PaginatedAdminResourceSchema = paginated(
  AdminResourceSchema,
  'PaginatedAdminResource',
);

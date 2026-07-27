/**
 * Los tipos de la API se DERIVAN de los schemas en `src/schemas/`.
 *
 * Antes se escribían a mano acá y se desincronizaban: `ResourcePublic` no
 * mencionaba `subtype`, `examYear`, `examMonth`, `examDay`, `topic` ni `notes`,
 * y `University` / `Faculty` / `Career` se olvidaban de `shortName`. Todos esos
 * campos sí salían por el cable.
 *
 * Regla: si querés cambiar la forma de una respuesta, tocá el schema. Este
 * archivo solo re-exporta.
 */

// ─── CONTRATO DE LA API ───────────────────────────────────────────────────────

export type {
  University,
  Faculty,
  Career,
  CareerPlan,
  Subject,
  SubjectWithCareers,
  SubjectDetail,
  AdminSubject,
  Resource,
  AdminResource,
  PublicUser,
  UserRole,
  AdminStats,
  ErrorResponse,
} from '@/schemas';

import type { z } from 'zod/v4';
import type {
  ResourceStatusSchema,
  ResourceTypeSchema,
  ResourceSubtypeSchema,
} from '@/schemas/resources';
import type { UserRole } from '@/schemas';

export type ResourceStatus = z.infer<typeof ResourceStatusSchema>;
export type ResourceType = z.infer<typeof ResourceTypeSchema>;
export type ResourceSubtype = z.infer<typeof ResourceSubtypeSchema>;

// ─── INTERNOS ─────────────────────────────────────────────────────────────────
// No forman parte del contrato público: no viajan en ninguna respuesta.

export interface JwtPayload {
  sub: string;
  role: UserRole;
  facultyId: string | null;
  iat: number;
  exp: number;
}

export type AppContext = {
  Variables: {
    user: JwtPayload;
    requestId: string;
  };
};

/**
 * Forma genérica de `buildPaginatedResponse()`. En el OpenAPI cada uso concreto
 * es un schema con nombre propio (`PaginatedResource`, etc.) — ver src/schemas.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

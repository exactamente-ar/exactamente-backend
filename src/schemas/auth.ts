import { z } from 'zod/v4';
import { IsoDateTime } from './common';

export const UserRoleSchema = z.enum(['superadmin', 'admin', 'user']).meta({ id: 'UserRole' });

/** Lo que arma `toPublicUser()` en src/services/auth.service.ts. */
export const PublicUserSchema = z
  .object({
    id: z.string(),
    email: z.email(),
    displayName: z.string(),
    photoUrl: z.string().nullable(),
    role: UserRoleSchema.describe('Los registros nuevos siempre son user'),
    emailVerified: z.boolean().describe('Existe en DB pero hoy ningún flujo de producto lo usa'),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'PublicUser' });

/** `POST /auth/register` y `POST /auth/login`. */
export const AuthResponseSchema = z
  .object({
    user: PublicUserSchema,
    token: z.string().describe('JWT — mandarlo como `Authorization: Bearer <token>`'),
  })
  .meta({ id: 'AuthResponse' });

/** `GET /auth/me`. */
export const MeResponseSchema = z.object({ user: PublicUserSchema }).meta({ id: 'MeResponse' });

/** `POST /auth/exchange` — canjea el código de un solo uso del callback OAuth. */
export const TokenResponseSchema = z.object({ token: z.string() }).meta({ id: 'TokenResponse' });

export type PublicUser = z.infer<typeof PublicUserSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;

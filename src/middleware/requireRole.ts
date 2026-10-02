import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import type { AppContext, UserRole } from '@/types';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 1,
  admin: 2,
  superadmin: 3,
};

/**
 * Exige un rol mínimo, y valida el token contra la base.
 *
 * `verifyToken` solo comprueba la firma: un JWT firmado sigue siendo válido
 * hasta su `exp` aunque al usuario lo hayan borrado o degradado. Acá se cierra
 * eso — un token deja de servir si:
 *
 *   - el usuario ya no existe                      → 401
 *   - su `tokenVersion` quedó atrás del de la base → 401 (sesión revocada)
 *   - su rol en la base ya no alcanza              → 403
 *
 * El chequeo contra el payload va **antes** de la query a propósito: un token
 * que ni siquiera afirma tener privilegio se rechaza sin tocar la base. Solo
 * paga la consulta el que dice ser admin, que es donde importa verificarlo.
 */
export function requireRole(minRole: UserRole) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'No autenticado' }, 401);

    // Rechazo barato: lo que el token declara ya no alcanza.
    if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
      return c.json({ error: 'Sin permisos suficientes' }, 403);
    }

    const current = await db.query.users.findFirst({
      where: eq(users.id, user.sub),
      columns: { role: true, tokenVersion: true },
    });

    if (!current) return c.json({ error: 'Token inválido o expirado' }, 401);

    // Los tokens firmados antes de esta feature no traen el campo; se los trata
    // como versión 0, que es el default de la columna.
    if ((user.tokenVersion ?? 0) !== current.tokenVersion) {
      return c.json({ error: 'Sesión revocada' }, 401);
    }

    if (ROLE_HIERARCHY[current.role] < ROLE_HIERARCHY[minRole]) {
      return c.json({ error: 'Sin permisos suficientes' }, 403);
    }

    await next();
  });
}

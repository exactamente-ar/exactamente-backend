import { createMiddleware } from 'hono/factory';
import type { AppContext, UserRole } from '@/types';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 1,
  admin: 2,
  superadmin: 3,
};

export function requireRole(minRole: UserRole) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'No autenticado' }, 401);

    if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
      return c.json({ error: 'Sin permisos suficientes' }, 403);
    }

    await next();
  });
}

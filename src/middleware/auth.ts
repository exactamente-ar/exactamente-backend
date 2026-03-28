import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AppContext, JwtPayload } from '@/types';

export const verifyToken = createMiddleware<AppContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Token requerido' }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verify(token, process.env.JWT_SECRET!, 'HS256') as JwtPayload;
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
});

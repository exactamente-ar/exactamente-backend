import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AppContext, JwtPayload } from '@/types';
import { env } from '@/env';

export const verifyToken = createMiddleware<AppContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Token requerido' }, 401);
  }

  const token = authHeader.slice(7);
  try {
    // `verify` devuelve el JWTPayload genérico de hono; la forma concreta la
    // garantizamos nosotros al firmar en auth.service. Pasa por `unknown`
    // porque los dos tipos no se solapan lo suficiente para TS.
    const payload = (await verify(token, env.JWT_SECRET, 'HS256')) as unknown as JwtPayload;
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
});

/**
 * Igual que `verifyToken` pero no exige el token: si viene y es válido, setea
 * `user`; si no viene o es inválido, sigue como lectura pública. Sirve para que
 * el GET del blog marque `mine` sin romper la lectura anónima.
 */
export const optionalAuth = createMiddleware<AppContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = (await verify(token, env.JWT_SECRET, 'HS256')) as unknown as JwtPayload;
      c.set('user', payload);
    } catch {
      // token inválido: seguimos como anónimo
    }
  }
  await next();
});

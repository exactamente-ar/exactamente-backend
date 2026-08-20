import { createMiddleware } from 'hono/factory';
import type { JwtPayload } from '@/types';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Máximo de requests permitidos en la ventana */
  limit: number;
  /** Duración de la ventana en milisegundos */
  windowMs: number;
  /**
   * `false` (default) keyea por IP. `true` keyea por el `sub` del JWT: sirve
   * para escrituras, donde una IP rotativa no tendría techo si solo se contara
   * por IP. Requiere correr después de `verifyToken`.
   */
  keyByUser?: boolean;
}

const rateLimitStores: Map<string, RateLimitEntry>[] = [];

/**
 * Limpia todos los almacenes de rate limit (útil para tests).
 */
export function resetAllRateLimits() {
  for (const store of rateLimitStores) {
    store.clear();
  }
}

/**
 * Rate limiter en memoria con ventana fija.
 * Nota: no comparte estado entre instancias. Apto para deployments de una sola instancia.
 */
export function rateLimit({ limit, windowMs, keyByUser = false }: RateLimitOptions) {
  const store = new Map<string, RateLimitEntry>();
  rateLimitStores.push(store);

  // Limpiar entradas expiradas para no acumular memoria indefinidamente
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, windowMs);

  return createMiddleware(async (c, next) => {
    const key = keyByUser
      ? ((c.get('user') as JwtPayload | undefined)?.sub ?? 'unknown')
      : (c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip') ?? 'unknown');

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Demasiados intentos. Intentá de nuevo más tarde.' }, 429);
    }

    entry.count++;
    await next();
  });
}

import { createMiddleware } from 'hono/factory';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Máximo de requests permitidos en la ventana */
  limit: number;
  /** Duración de la ventana en milisegundos */
  windowMs: number;
}

/**
 * Rate limiter en memoria con ventana fija por IP.
 * Nota: no comparte estado entre instancias. Apto para deployments de una sola instancia.
 */
export function rateLimit({ limit, windowMs }: RateLimitOptions) {
  const store = new Map<string, RateLimitEntry>();

  // Limpiar entradas expiradas para no acumular memoria indefinidamente
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, windowMs);

  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
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

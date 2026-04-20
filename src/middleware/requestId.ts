import { createMiddleware } from 'hono/factory';
import type { AppContext } from '@/types';

export const requestId = createMiddleware<AppContext>(async (c, next) => {
  const id = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', id);
  c.header('X-Request-ID', id);
  await next();
});

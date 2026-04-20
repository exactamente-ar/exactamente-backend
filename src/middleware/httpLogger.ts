import { createMiddleware } from 'hono/factory';
import { env } from '@/env';
import type { AppContext } from '@/types';

export const httpLogger = createMiddleware<AppContext>(async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  if (env.NODE_ENV === 'production') {
    console.log(JSON.stringify({
      level: 'info',
      type: 'request',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
      requestId: c.get('requestId'),
    }));
  } else {
    const status = c.res.status;
    const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}${status}\x1b[0m ${c.req.method} ${c.req.path} ${ms}ms [${c.get('requestId')}]`);
  }
});

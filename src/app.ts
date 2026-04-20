import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cors } from 'hono/cors';
import authRoutes         from '@/routes/auth';
import universitiesRoutes from '@/routes/universities';
import facultiesRoutes    from '@/routes/faculties';
import careersRoutes      from '@/routes/careers';
import subjectsRoutes     from '@/routes/subjects';
import resourcesRoutes    from '@/routes/resources';
import { env } from '@/env';
import { requestId } from '@/middleware/requestId';
import { httpLogger } from '@/middleware/httpLogger';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();

app.onError((err, c) => {
  // HTTPException ya tiene su status correcto (400, 401, etc.) — no interceptar
  if (err instanceof HTTPException) return err.getResponse();

  const reqId = c.get('requestId') ?? 'unknown';
  if (env.NODE_ENV !== 'production') {
    console.error(`[${reqId}]`, err);
  } else {
    console.error(`[ERROR] [${reqId}] ${c.req.method} ${c.req.path} — ${err.message}`);
  }
  return c.json({ error: 'Error interno del servidor' }, 500);
});

app.use('*', requestId);
app.use('*', httpLogger);
app.use('*', cors({
  origin: env.CORS_ORIGIN,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

const api = app.basePath('/api/v1');
api.route('/auth',         authRoutes);
api.route('/universities', universitiesRoutes);
api.route('/faculties',    facultiesRoutes);
api.route('/careers',      careersRoutes);
api.route('/subjects',     subjectsRoutes);
api.route('/resources',    resourcesRoutes);

export default app;

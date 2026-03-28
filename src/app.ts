import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import authRoutes         from '@/routes/auth';
import universitiesRoutes from '@/routes/universities';
import facultiesRoutes    from '@/routes/faculties';
import careersRoutes      from '@/routes/careers';
import subjectsRoutes     from '@/routes/subjects';
import resourcesRoutes    from '@/routes/resources';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Error interno del servidor' }, 500);
});

app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

const api = app.basePath('/api/v1');
api.route('/auth',         authRoutes);
api.route('/universities', universitiesRoutes);
api.route('/faculties',    facultiesRoutes);
api.route('/careers',      careersRoutes);
api.route('/subjects',     subjectsRoutes);
api.route('/resources',    resourcesRoutes);

export default app;

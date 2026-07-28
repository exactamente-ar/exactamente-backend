import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cors } from 'hono/cors';
import authRoutes from '@/routes/auth';
import universitiesRoutes from '@/routes/universities';
import facultiesRoutes from '@/routes/faculties';
import careersRoutes from '@/routes/careers';
import careerPlansRoutes from '@/routes/career-plans';
import subjectsRoutes from '@/routes/subjects';
import resourcesRoutes from '@/routes/resources';
import adminResourcesRoutes from '@/routes/admin/resources';
import adminUniversitiesRoutes from '@/routes/admin/universities';
import adminFacultiesRoutes from '@/routes/admin/faculties';
import adminCareersRoutes from '@/routes/admin/careers';
import adminCareerPlansRoutes from '@/routes/admin/career-plans';
import adminSubjectsRoutes from '@/routes/admin/subjects';
import adminStatsRoutes from '@/routes/admin/stats';
import { env } from '@/env';
import { requestId } from '@/middleware/requestId';
import { httpLogger } from '@/middleware/httpLogger';
import { securityHeaders } from '@/middleware/securityHeaders';
import type { AppContext } from '@/types';
import { openAPIRouteHandler } from 'hono-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { openApiDocumentation } from '@/openapi/document';

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
app.use('*', securityHeaders);
app.use(
  '*',
  cors({
    origin: [...env.CORS_ORIGIN.split(','), env.ADMIN_ORIGIN],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

const api = app.basePath('/api/v1');
api.route('/auth', authRoutes);
api.route('/universities', universitiesRoutes);
api.route('/faculties', facultiesRoutes);
api.route('/careers', careersRoutes);
api.route('/career-plans', careerPlansRoutes);
api.route('/subjects', subjectsRoutes);
api.route('/resources', resourcesRoutes);
api.route('/admin/resources', adminResourcesRoutes);
api.route('/admin/universities', adminUniversitiesRoutes);
api.route('/admin/faculties', adminFacultiesRoutes);
api.route('/admin/careers', adminCareersRoutes);
api.route('/admin/career-plans', adminCareerPlansRoutes);
api.route('/admin/subjects', adminSubjectsRoutes);
api.route('/admin/stats', adminStatsRoutes);

// ─── OpenAPI ──────────────────────────────────────────────────────────────────
// Se monta DESPUÉS de las rutas: openAPIRouteHandler recorre el router de `app`
// y solo ve lo que ya está registrado.
//
// Público a propósito: este repo es público, así que los endpoints admin ya se
// leen en GitHub. Están protegidos por JWT + requireRole, no por ser
// desconocidos. Ver src/openapi/document.ts.
app.get(
  '/openapi.json',
  openAPIRouteHandler(app, { documentation: openApiDocumentation as never }),
);

app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Exactamente API', theme: 'purple' }));

export default app;

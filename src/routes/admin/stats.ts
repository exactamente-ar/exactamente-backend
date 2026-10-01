import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod'; // ⚠️ zod clásico: la ENTRADA no usa el mismo dialecto que src/schemas/
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { resources, subjects, careers, faculties, universities, users } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import type { AppContext } from '@/types';
import {
  AdminStatsSchema,
  AdminActivitySchema,
  AdminRankingsSchema,
  AdminModerationSchema,
} from '@/schemas';
import { json, errors, bearerAuth } from '@/openapi/helpers';
import { REPORT_TZ, resolveRange } from '@/utils/timeseries';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

/**
 * `created_at` y `published_at` son `timestamp` SIN zona (src/db/schema.ts),
 * guardados en UTC. `now()` en cambio es `timestamptz`. Comparar los dos
 * directamente hace que el resultado dependa del `timezone` de la sesión, que
 * es un valor del contenedor que no controlamos.
 *
 * Regla: todo filtro `WHERE` compara contra `NOW_UTC`; todo `date_trunc` que
 * arma buckets para mostrarle a un humano se hace en `REPORT_TZ`.
 */
const NOW_UTC = sql`(now() AT TIME ZONE 'UTC')`;

/** `interval` a partir de una cantidad de días, como bind param. */
const daysAgo = (days: number) => sql`${`${days} days`}::interval`;

// ─── GET / — métricas para el dashboard ──────────────────────────────────────

app.get(
  '/',
  describeRoute({
    tags: ['Admin'],
    summary: 'Métricas del dashboard',
    security: bearerAuth,
    description: 'Una sola llamada devuelve todos los contadores. No hay endpoints por métrica.',
    responses: { 200: json(AdminStatsSchema, 'Métricas'), ...errors(401, 403) },
  }),
  ...adminGuard,
  async (c) => {
    const [
      statusRows,
      typeRows,
      [subjectCount],
      [subjectsWithResourcesCount],
      [careerCount],
      [facultyCount],
      [universityCount],
      [userCount],
    ] = await Promise.all([
      db
        .select({ status: resources.status, count: sql<number>`count(*)::int` })
        .from(resources)
        .groupBy(resources.status),
      db
        .select({ type: resources.type, count: sql<number>`count(*)::int` })
        .from(resources)
        .groupBy(resources.type),
      db.select({ count: sql<number>`count(*)::int` }).from(subjects),
      db
        .select({ count: sql<number>`count(distinct ${resources.subjectId})::int` })
        .from(resources)
        .where(eq(resources.status, 'published')),
      db.select({ count: sql<number>`count(*)::int` }).from(careers),
      db.select({ count: sql<number>`count(*)::int` }).from(faculties),
      db.select({ count: sql<number>`count(*)::int` }).from(universities),
      db.select({ count: sql<number>`count(*)::int` }).from(users),
    ]);

    const byStatus = { pending: 0, published: 0, rejected: 0 } as Record<string, number>;
    for (const row of statusRows) byStatus[row.status] = row.count;

    const byType = { resumen: 0, parcial: 0, final: 0 } as Record<string, number>;
    for (const row of typeRows) byType[row.type] = row.count;

    const totalSubjects = subjectCount?.count ?? 0;
    const withResources = subjectsWithResourcesCount?.count ?? 0;

    return c.json({
      resources: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        byStatus: byStatus as { pending: number; published: number; rejected: number },
        byType: byType as { resumen: number; parcial: number; final: number },
      },
      coverage: {
        subjectsWithResources: withResources,
        subjectsWithoutResources: totalSubjects - withResources,
      },
      counts: {
        users: userCount?.count ?? 0,
        subjects: totalSubjects,
        careers: careerCount?.count ?? 0,
        faculties: facultyCount?.count ?? 0,
        universities: universityCount?.count ?? 0,
      },
    });
  },
);

// ─── GET /activity — serie temporal de subidas y publicaciones ───────────────

const activityQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  granularity: z.enum(['day', 'week']).default('day'),
});

app.get(
  '/activity',
  describeRoute({
    tags: ['Admin'],
    summary: 'Actividad en el tiempo',
    security: bearerAuth,
    description:
      'Recursos creados y publicados por bucket. La serie no tiene huecos: los buckets sin ' +
      'actividad vienen en 0. Los buckets se agrupan en hora argentina.',
    responses: { 200: json(AdminActivitySchema, 'Serie temporal'), ...errors(400, 401, 403) },
  }),
  ...adminGuard,
  zValidator('query', activityQuery),
  async (c) => {
    const { days, granularity } = c.req.valid('query');
    const step = granularity === 'week' ? '7 days' : '1 day';

    /**
     * SQL crudo por dos razones que el query builder no cubre:
     * `generate_series` (para que la serie no tenga huecos) y `date_trunc` con
     * conversión de zona.
     *
     * ⚠️ Cada serie se pre-agrega en su PROPIA CTE. El atajo intuitivo —
     * `FROM buckets LEFT JOIN resources u … LEFT JOIN resources p …` — hace
     * producto cartesiano dentro de cada bucket y devuelve `uploads` multiplicado
     * por la cantidad de publicaciones de ese mismo bucket.
     *
     * `granularity` y `step` van como bind params (vienen de un z.enum, nunca de
     * texto libre): nada de sql.raw con input del usuario.
     */
    const { rows } = await db.execute<{ date: string; uploads: number; publications: number }>(sql`
      WITH buckets AS (
        SELECT generate_series(
          -- Se resta PRIMERO y se trunca DESPUÉS. Al revés (truncar y después
          -- restar 30 días) el inicio cae en un día cualquiera de la semana y
          -- el generate_series stepea de a 7 desde ahí: los buckets salen, por
          -- ejemplo, todos sábados, ninguno coincide con los lunes que produce
          -- date_trunc en las CTEs de abajo, y TODA la serie semanal devuelve 0
          -- con la semana actual ausente. Sin error, sin warning.
          date_trunc(${granularity}, (now() AT TIME ZONE ${REPORT_TZ}) - ${daysAgo(days)}),
          date_trunc(${granularity}, (now() AT TIME ZONE ${REPORT_TZ})),
          ${step}::interval
        ) AS bucket
      ),
      uploads AS (
        SELECT date_trunc(${granularity}, ((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TZ})) AS bucket,
               count(*)::int AS n
        FROM resources
        WHERE created_at >= ${NOW_UTC} - ${daysAgo(days)}
        GROUP BY 1
      ),
      pubs AS (
        SELECT date_trunc(${granularity}, ((published_at AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TZ})) AS bucket,
               count(*)::int AS n
        FROM resources
        WHERE published_at IS NOT NULL
          AND published_at >= ${NOW_UTC} - ${daysAgo(days)}
        GROUP BY 1
      )
      SELECT to_char(b.bucket, 'YYYY-MM-DD') AS date,
             coalesce(u.n, 0) AS uploads,
             coalesce(p.n, 0) AS publications
      FROM buckets b
      LEFT JOIN uploads u ON u.bucket = b.bucket
      LEFT JOIN pubs    p ON p.bucket = b.bucket
      ORDER BY b.bucket
    `);

    /**
     * `resolveRange` calcula en JS el mismo rango que el SQL calcula en la base.
     * Que coincidan no es redundante: es el único chequeo que tiene esta query,
     * porque la suite no llega hasta acá.
     *
     * Se comparan los BORDES y no solo la cantidad. Contar alcanza para detectar
     * huecos, pero no para detectar una serie corrida: con el bug de truncar
     * antes de restar los días, la cantidad de buckets daba bien y las fechas
     * estaban todas desplazadas — cada bucket devolvía 0 porque no matcheaba con
     * ningún `date_trunc` de las CTEs.
     */
    const expected = resolveRange(days, granularity);
    const actual = {
      from: rows[0]?.date,
      to: rows[rows.length - 1]?.date,
      expectedBuckets: rows.length,
    };
    if (
      actual.expectedBuckets !== expected.expectedBuckets ||
      actual.from !== expected.from ||
      actual.to !== expected.to
    ) {
      console.warn(
        `[stats/activity] la serie no coincide con el rango calculado ` +
          `(days=${days}, granularity=${granularity}): ` +
          `esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`,
      );
    }

    return c.json({
      granularity,
      from: rows[0]?.date ?? expected.from,
      to: rows[rows.length - 1]?.date ?? expected.to,
      points: rows,
    });
  },
);

// ─── GET /rankings — quién sube y qué se descarga ────────────────────────────

const rankingsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

app.get(
  '/rankings',
  describeRoute({
    tags: ['Admin'],
    summary: 'Rankings de colaboradores y recursos',
    security: bearerAuth,
    description:
      '`topUploaders` respeta la ventana `days`. `topResources` NO: `download_count` es un ' +
      'escalar sin fecha, así que el ranking de descargas es siempre histórico.',
    responses: { 200: json(AdminRankingsSchema, 'Rankings'), ...errors(400, 401, 403) },
  }),
  ...adminGuard,
  zValidator('query', rankingsQuery),
  async (c) => {
    const { days, limit } = c.req.valid('query');

    const [topUploaders, topResources] = await Promise.all([
      db
        .select({
          userId: users.id,
          displayName: users.displayName,
          total: sql<number>`count(*)::int`,
          published: sql<number>`count(*) FILTER (WHERE ${resources.status} = 'published')::int`,
        })
        .from(resources)
        // `users.email` queda afuera a propósito: para un ranking alcanza el
        // display name, y este endpoint no tiene por qué filtrar PII.
        .innerJoin(users, eq(users.id, resources.uploadedBy))
        .where(sql`${resources.createdAt} >= ${NOW_UTC} - ${daysAgo(days)}`)
        .groupBy(users.id, users.displayName)
        .orderBy(sql`count(*) FILTER (WHERE ${resources.status} = 'published') DESC, count(*) DESC`)
        .limit(limit),

      db
        .select({
          id: resources.id,
          title: resources.title,
          subjectTitle: subjects.title,
          type: resources.type,
          downloadCount: resources.downloadCount,
        })
        .from(resources)
        .leftJoin(subjects, eq(subjects.id, resources.subjectId))
        .where(eq(resources.status, 'published'))
        .orderBy(desc(resources.downloadCount))
        .limit(limit),
    ]);

    return c.json({ days, topUploaders, topResources });
  },
);

// ─── GET /moderation — salud de la cola ──────────────────────────────────────

const moderationQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});

/** Cuánto hace que un pendiente está esperando, en la unidad que se pida. */
const pendingAge = sql`${NOW_UTC} - ${resources.createdAt}`;

app.get(
  '/moderation',
  describeRoute({
    tags: ['Admin'],
    summary: 'Salud de la cola de moderación',
    security: bearerAuth,
    description:
      'Lead time (horas entre subida y publicación) sobre la ventana `days`, más la ' +
      'antigüedad de la cola actual de pendientes — que es estado presente y no depende de `days`.',
    responses: { 200: json(AdminModerationSchema, 'Moderación'), ...errors(400, 401, 403) },
  }),
  ...adminGuard,
  zValidator('query', moderationQuery),
  async (c) => {
    const { days } = c.req.valid('query');

    /**
     * SQL crudo: `percentile_cont` es un agregado de conjunto ordenado
     * (`WITHIN GROUP`) y el query builder no lo expresa.
     *
     * ⚠️ Los `::float8` no son cosméticos. `avg()` y `percentile_cont()`
     * devuelven `numeric`, y node-postgres serializa `numeric` como STRING. Sin
     * el cast el JSON tiene "12.5" donde el contrato promete `number`: no lo
     * caza el typecheck, ni los tests, ni el CI — se ve como NaN en el chart.
     */
    const leadTimePromise = db.execute<{
      sample: number;
      avg_hours: number | null;
      p50_hours: number | null;
      p90_hours: number | null;
    }>(sql`
      SELECT
        count(*)::int AS sample,
        (avg(extract(epoch FROM (published_at - created_at))) / 3600.0)::float8 AS avg_hours,
        (percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (published_at - created_at))
        ) / 3600.0)::float8 AS p50_hours,
        (percentile_cont(0.9) WITHIN GROUP (
          ORDER BY extract(epoch FROM (published_at - created_at))
        ) / 3600.0)::float8 AS p90_hours
      FROM resources
      WHERE status = 'published'
        AND published_at IS NOT NULL
        -- descarta importaciones históricas con las fechas invertidas, que
        -- darían un lead time negativo y ensuciarían el promedio
        AND published_at >= created_at
        AND published_at >= ${NOW_UTC} - ${daysAgo(days)}
    `);

    // Una sola pasada sobre los pendientes: `FILTER` evita cuatro queries.
    const queuePromise = db
      .select({
        total: sql<number>`count(*)::int`,
        under24h: sql<number>`count(*) FILTER (WHERE ${pendingAge} < interval '1 day')::int`,
        d1to3: sql<number>`count(*) FILTER (WHERE ${pendingAge} >= interval '1 day' AND ${pendingAge} < interval '3 days')::int`,
        d3to7: sql<number>`count(*) FILTER (WHERE ${pendingAge} >= interval '3 days' AND ${pendingAge} < interval '7 days')::int`,
        over7d: sql<number>`count(*) FILTER (WHERE ${pendingAge} >= interval '7 days')::int`,
        oldestCreatedAt: sql<Date | null>`min(${resources.createdAt})`,
      })
      .from(resources)
      .where(eq(resources.status, 'pending'));

    const [leadTimeResult, [queue]] = await Promise.all([leadTimePromise, queuePromise]);
    const lead = leadTimeResult.rows[0];

    return c.json({
      days,
      leadTime: {
        sample: lead?.sample ?? 0,
        // null y 0 no son lo mismo: con la ventana vacía Postgres devuelve null,
        // y "no hubo publicaciones" no es "tardó cero horas". No colapsar con ?? 0.
        avgHours: lead?.avg_hours ?? null,
        p50Hours: lead?.p50_hours ?? null,
        p90Hours: lead?.p90_hours ?? null,
      },
      queue: {
        total: queue?.total ?? 0,
        under24h: queue?.under24h ?? 0,
        d1to3: queue?.d1to3 ?? 0,
        d3to7: queue?.d3to7 ?? 0,
        over7d: queue?.over7d ?? 0,
        oldestCreatedAt: queue?.oldestCreatedAt
          ? new Date(queue.oldestCreatedAt).toISOString()
          : null,
      },
    });
  },
);

export default app;

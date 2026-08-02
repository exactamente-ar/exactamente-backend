/**
 * Aritmética de buckets para las series temporales de `/admin/stats/activity`.
 *
 * Vive acá y no dentro del handler porque es la única parte de esos endpoints
 * que se puede testear: la suite no tiene base (drizzle conecta lazy, no hay
 * service container en CI), así que el SQL no tiene cobertura automática. Los
 * bordes de semana y los cambios de mes sí la tienen.
 */

export type Granularity = 'day' | 'week';

/** La zona en la que se agrupan los buckets. La API es de un producto argentino. */
export const REPORT_TZ = 'America/Argentina/Buenos_Aires';

/** Partes de una fecha en `REPORT_TZ`, como enteros. */
function partsInReportTz(date: Date): { year: number; month: number; day: number } {
  // `en-CA` da YYYY-MM-DD, que es justo el formato que necesitamos.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number) as [number, number, number];
  return { year, month, day };
}

/**
 * Trunca al inicio del bucket, con la misma semántica que `date_trunc` de
 * Postgres: `week` arranca **lunes** (ISO 8601), no domingo.
 *
 * Devuelve `YYYY-MM-DD` porque es lo que la respuesta expone y lo que hace
 * comparable el resultado del SQL con lo que calculamos acá.
 */
export function truncateToBucket(date: Date, granularity: Granularity): string {
  const { year, month, day } = partsInReportTz(date);
  // Date.UTC evita que la TZ del proceso Node corra el resultado. Ya venimos
  // trabajando con las partes en REPORT_TZ, así que acá el UTC es solo el
  // vehículo aritmético.
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (granularity === 'week') {
    // getUTCDay(): 0 = domingo. Para que el lunes sea el inicio, el domingo
    // retrocede 6 días y no 0.
    const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
    utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  }

  return utc.toISOString().slice(0, 10);
}

export interface Range {
  /** Primer bucket de la serie, `YYYY-MM-DD`. */
  from: string;
  /** Último bucket de la serie, `YYYY-MM-DD`. Siempre el que contiene a `now`. */
  to: string;
  /**
   * Cuántos buckets tiene que devolver el SQL. El handler lo usa para detectar
   * una serie con huecos, que es el síntoma de un `generate_series` mal armado.
   */
  expectedBuckets: number;
}

/**
 * El rango que cubre `/activity`: desde `days` días atrás hasta hoy, truncado a
 * `granularity` en ambos extremos.
 *
 * Ojo con la aritmética: `days=1` da **2** buckets con granularidad diaria (hoy
 * y ayer), no 1. El rango es inclusivo en los dos extremos, igual que el
 * `generate_series` del SQL.
 */
export function resolveRange(
  days: number,
  granularity: Granularity,
  now: Date = new Date(),
): Range {
  const to = truncateToBucket(now, granularity);

  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  const from = truncateToBucket(start, granularity);

  const stepDays = granularity === 'week' ? 7 : 1;
  const msPerDay = 24 * 60 * 60 * 1000;
  const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / msPerDay;

  return { from, to, expectedBuckets: Math.round(spanDays / stepDays) + 1 };
}

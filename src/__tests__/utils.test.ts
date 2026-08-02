import { describe, it, expect } from 'bun:test';
import { slugify } from '@/utils/slugify';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { resolveRange, truncateToBucket } from '@/utils/timeseries';

describe('slugify', () => {
  it('convierte a minúsculas con guiones', () => {
    expect(slugify('Análisis Matemático 1')).toBe('analisis-matematico-1');
  });

  it('elimina acentos y tildes', () => {
    expect(slugify('Introducción a la Programación')).toBe('introduccion-a-la-programacion');
  });

  it('elimina caracteres especiales', () => {
    expect(slugify('Inglés (I)')).toBe('ingles-i');
  });

  it('colapsa múltiples guiones', () => {
    expect(slugify('A  B')).toBe('a-b');
  });

  it('elimina guiones al inicio y final', () => {
    expect(slugify(' Algebra ')).toBe('algebra');
  });
});

describe('getPaginationParams', () => {
  it('devuelve defaults cuando no se pasan parámetros', () => {
    expect(getPaginationParams(undefined, undefined)).toEqual({ offset: 0, limit: 20, page: 1 });
  });

  it('calcula offset correctamente', () => {
    expect(getPaginationParams(3, 10)).toEqual({ offset: 20, limit: 10, page: 3 });
  });

  it('clamp: limit máximo 100', () => {
    expect(getPaginationParams(1, 500).limit).toBe(100);
  });

  it('clamp: page mínimo 1', () => {
    expect(getPaginationParams(0, 20).page).toBe(1);
  });
});

describe('buildPaginatedResponse', () => {
  it('calcula totalPages correctamente', () => {
    const result = buildPaginatedResponse(['a', 'b'], 25, 2, 10);
    expect(result).toEqual({ data: ['a', 'b'], total: 25, page: 2, totalPages: 3 });
  });
});

/**
 * Los buckets de `/admin/stats/activity`.
 *
 * Esta es la única parte de esos endpoints con cobertura automática: el SQL no
 * la tiene porque la suite no toca la base. Por eso se testea acá con saña —
 * bordes de semana, cambios de mes y el corrimiento de zona son justo donde
 * este tipo de código falla en silencio.
 */
describe('truncateToBucket', () => {
  it('con granularidad diaria devuelve el día en hora argentina', () => {
    expect(truncateToBucket(new Date('2026-03-11T12:00:00Z'), 'day')).toBe('2026-03-11');
  });

  // UTC-3: a las 02:00 UTC en Buenos Aires todavía es el día anterior. Si esto
  // se rompe, la actividad de la madrugada aparece en el bucket equivocado.
  it('a las 02:00 UTC todavía es el día anterior en Buenos Aires', () => {
    expect(truncateToBucket(new Date('2026-03-11T02:00:00Z'), 'day')).toBe('2026-03-10');
  });

  // date_trunc('week') de Postgres arranca lunes. Si acá arrancara domingo, el
  // expectedBuckets no coincidiría con la serie y el warning saltaría siempre.
  it('la semana arranca el lunes, como date_trunc de Postgres', () => {
    expect(truncateToBucket(new Date('2026-03-11T12:00:00Z'), 'week')).toBe('2026-03-09');
  });

  it('un domingo cae en la semana que empezó el lunes anterior', () => {
    expect(truncateToBucket(new Date('2026-03-15T12:00:00Z'), 'week')).toBe('2026-03-09');
  });

  it('un lunes es su propio inicio de semana', () => {
    expect(truncateToBucket(new Date('2026-03-16T12:00:00Z'), 'week')).toBe('2026-03-16');
  });

  it('la semana puede empezar en el mes anterior', () => {
    // 2026-03-01 es domingo → su semana empezó el lunes 23 de febrero.
    expect(truncateToBucket(new Date('2026-03-01T12:00:00Z'), 'week')).toBe('2026-02-23');
  });
});

describe('resolveRange', () => {
  const now = new Date('2026-03-11T12:00:00Z'); // miércoles

  // El rango es inclusivo en los dos extremos, igual que el generate_series.
  // days=1 son DOS buckets, no uno: hoy y ayer.
  it('days=1 diario devuelve 2 buckets', () => {
    expect(resolveRange(1, 'day', now)).toEqual({
      from: '2026-03-10',
      to: '2026-03-11',
      expectedBuckets: 2,
    });
  });

  it('days=30 diario devuelve 31 buckets', () => {
    const range = resolveRange(30, 'day', now);
    expect(range).toEqual({ from: '2026-02-09', to: '2026-03-11', expectedBuckets: 31 });
  });

  it('cruza el cambio de mes sin perder buckets', () => {
    const range = resolveRange(15, 'day', new Date('2026-03-05T12:00:00Z'));
    expect(range.from).toBe('2026-02-18');
    expect(range.to).toBe('2026-03-05');
    expect(range.expectedBuckets).toBe(16);
  });

  it('semanal cuenta semanas, no días', () => {
    // 30 días atrás desde el 11/03 es el 09/02 (lunes); el bucket actual
    // arranca el 09/03. Son 5 lunes: 09/02, 16/02, 23/02, 02/03, 09/03.
    expect(resolveRange(30, 'week', now)).toEqual({
      from: '2026-02-09',
      to: '2026-03-09',
      expectedBuckets: 5,
    });
  });

  it('days=1 semanal colapsa en un solo bucket dentro de la misma semana', () => {
    // Del martes al miércoles no se cruza ningún lunes.
    expect(resolveRange(1, 'week', now)).toEqual({
      from: '2026-03-09',
      to: '2026-03-09',
      expectedBuckets: 1,
    });
  });

  it('el tope de un año sigue dando una serie coherente', () => {
    const range = resolveRange(365, 'day', now);
    expect(range.expectedBuckets).toBe(366);
    expect(range.to).toBe('2026-03-11');
  });
});

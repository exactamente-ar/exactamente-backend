import { describe, it, expect } from 'bun:test';
import { slugify } from '@/utils/slugify';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';

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

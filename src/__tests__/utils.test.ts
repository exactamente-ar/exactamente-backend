import { describe, it, expect } from 'bun:test';
import { slugify } from '@/utils/slugify';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { safeDownloadFilename, contentDisposition } from '@/utils/contentDisposition';

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
 * El título de un recurso es texto libre en español y termina dentro de un
 * header HTTP. Acá se testea el escapado, que es lo que evita que unas comillas
 * en el título rompan el `Content-Disposition`.
 */
describe('safeDownloadFilename', () => {
  const PDF = 'public/A1C1M1/uuid.pdf';

  it('deja pasar un título normal y le pone la extensión', () => {
    expect(safeDownloadFilename('Parcial 2 - Álgebra', PDF)).toBe('Parcial 2 - Álgebra.pdf');
  });

  it('reemplaza los caracteres que romperían el header o el filesystem', () => {
    expect(safeDownloadFilename('Final: "Tema 1/2" <2024>', PDF)).toBe('Final Tema 1 2 2024.pdf');
  });

  it('elimina saltos de línea, que permitirían inyectar otro header', () => {
    expect(safeDownloadFilename('Parcial\r\nX-Evil: 1', PDF)).toBe('Parcial X-Evil 1.pdf');
  });

  it('no deja el nombre vacío cuando el título era todo basura', () => {
    expect(safeDownloadFilename('///', PDF)).toBe('recurso.pdf');
  });

  it('corta los títulos larguísimos', () => {
    expect(safeDownloadFilename('a'.repeat(300), PDF).length).toBeLessThanOrEqual(104);
  });

  it('no deja un punto antes de la extensión: Windows rechaza esos nombres', () => {
    expect(safeDownloadFilename('Resumen final...', PDF)).toBe('Resumen final.pdf');
  });

  // La migración de Drive dejó imágenes en la base. Bajar un JPG llamado .pdf
  // da un archivo que no abre.
  it('respeta la extensión real y no asume PDF', () => {
    expect(safeDownloadFilename('Parcial 1', 'public/A1C1M1/uuid.jpg')).toBe('Parcial 1.jpg');
    expect(safeDownloadFilename('Parcial 1', 'public/A1C1M1/uuid.PNG')).toBe('Parcial 1.png');
  });

  it('cae a .pdf si la key no tiene extensión reconocible', () => {
    expect(safeDownloadFilename('Parcial 1', 'public/A1C1M1/uuid')).toBe('Parcial 1.pdf');
  });
});

describe('contentDisposition', () => {
  it('manda el nombre en ASCII y en UTF-8, para que los acentos sobrevivan', () => {
    expect(contentDisposition('Álgebra.pdf')).toBe(
      'attachment; filename="_lgebra.pdf"; filename*=UTF-8\'\'%C3%81lgebra.pdf',
    );
  });

  it('siempre es attachment, nunca inline', () => {
    expect(contentDisposition('x.pdf')).toStartWith('attachment;');
  });
});

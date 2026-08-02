import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import app from '@/app';

// El spec es un documento OpenAPI arbitrario; tiparlo entero acá no aporta
// nada, así que se navega como estructura suelta.
const spec = (await (await app.request('/openapi.json')).json()) as {
  openapi: string;
  paths: Record<string, unknown>;
  components: { schemas: Record<string, object> };
};

describe('GET /openapi.json', () => {
  it('responde un OpenAPI 3.1 con paths y schemas', async () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);
  });

  // Pasó de verdad: con `resolver()` en components, cada schema quedaba como
  // `{ vendor: 'zod' }`. El spec era JSON válido, todos los $ref resolvían, y
  // los clientes generaban `unknown` para TODOS los tipos, en silencio.
  it('cada schema de components describe algo, no queda vacío', () => {
    const shapeKeys = ['type', '$ref', 'anyOf', 'oneOf', 'allOf', 'enum', 'const'];
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      const hasShape = shapeKeys.some((key) => key in (schema as object));
      expect(hasShape, `${name} no describe ninguna forma`).toBe(true);
    }
  });

  it('todos los $ref resuelven a un schema declarado', () => {
    const declared = new Set(Object.keys(spec.components.schemas));
    const referenced = [...JSON.stringify(spec).matchAll(/#\/components\/schemas\/(\w+)/g)].map(
      (m) => m[1],
    );
    for (const name of new Set(referenced)) {
      expect(declared.has(name), `$ref a ${name}, que no está declarado`).toBe(true);
    }
  });

  // Sin esto, openapi-typescript genera `$defs` como una propiedad requerida
  // más del body y los clientes producen tipos que ninguna respuesta cumple.
  it('no quedan artefactos de JSON Schema dentro de paths', () => {
    const serialized = JSON.stringify(spec.paths);
    expect(serialized).not.toContain('"$defs"');
    expect(serialized).not.toContain('"$schema"');
  });

  /**
   * La descarga contada es la única ruta que devuelve un redirect en vez de
   * JSON. Si el 302 desaparece del contrato — o peor, si alguien lo cambia por
   * un 301 — los clientes no se enteran, pero el contador se congela.
   */
  it('la descarga declara un 302, no un 200 ni un 301', () => {
    const download = spec.paths['/api/v1/resources/{id}/download'] as {
      get: { responses: Record<string, unknown> };
    };
    expect(download, 'falta /resources/{id}/download').toBeDefined();
    expect(Object.keys(download.get.responses)).toContain('302');
    expect(Object.keys(download.get.responses)).not.toContain('301');
  });

  /**
   * El contrato que consumen frontend, admin y mcp sale del archivo versionado.
   * Si lo que sirve la app difiere, un cliente que genere desde la URL en vivo
   * obtiene tipos distintos a los del repo. Ya pasó una vez.
   */
  it('lo que sirve la app es idéntico al openapi.json versionado', () => {
    const served = JSON.stringify(spec, null, 2) + '\n';
    const committed = readFileSync('openapi.json', 'utf-8');
    expect(served).toBe(committed);
  });
});

describe('GET /docs', () => {
  it('sirve la referencia navegable', async () => {
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});

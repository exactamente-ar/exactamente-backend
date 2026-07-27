/**
 * Genera `openapi.json` en la raíz del repo desde los schemas de la app.
 *
 *   bun run gen:openapi          escribe el archivo
 *   bun run gen:openapi --check  falla si el archivo no coincide (lo usa el CI)
 *
 * El archivo se versiona a propósito: es el contrato que consumen frontend,
 * admin y mcp, y tiene que poder leerse sin levantar el backend.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import app from '@/app';

const OUT = resolve(import.meta.dirname, '../openapi.json');

/**
 * hono-openapi deja una copia de cada schema referenciado en un `$defs` inline
 * dentro de la respuesta, además de en `components.schemas`. El `$ref` apunta a
 * components, así que el `$defs` es redundante — pero openapi-typescript lo lee
 * como una PROPIEDAD REQUERIDA más del body, y genera tipos que ningún
 * response real satisface. Hay que sacarlo.
 *
 * `id` viene de `.meta({ id })` de Zod; sirve para nombrar el schema pero no es
 * válido dentro de un Schema Object de OpenAPI.
 */
function stripJsonSchemaArtifacts(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(stripJsonSchemaArtifacts);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    delete obj.$defs;
    delete obj.id;
    delete obj.$schema;
    Object.values(obj).forEach(stripJsonSchemaArtifacts);
  }
}

const res = await app.request('/openapi.json');
if (!res.ok) {
  console.error(`✗ El backend devolvió ${res.status} en /openapi.json`);
  process.exit(1);
}

const spec = (await res.json()) as Record<string, unknown>;

// Solo se limpia dentro de paths: components.schemas es justamente donde las
// definiciones tienen que quedar.
stripJsonSchemaArtifacts(spec.paths);

/**
 * Todo `$ref` tiene que resolver. Es fácil equivocarse: alcanza con usar un
 * schema en una ruta y olvidarse de declararlo en `components.schemas` de
 * src/openapi/document.ts. El spec queda sintácticamente válido pero los
 * clientes generan `unknown` en su lugar, en silencio.
 */
const declared = new Set(
  Object.keys(((spec.components as Record<string, unknown>)?.schemas ?? {}) as object),
);
const referenced = new Set(
  [...JSON.stringify(spec).matchAll(/#\/components\/schemas\/(\w+)/g)].map((m) => m[1]),
);
const broken = [...referenced].filter((name) => !declared.has(name));

if (broken.length > 0) {
  console.error(`✗ Hay $ref sin definición: ${broken.join(', ')}`);
  console.error('  Agregá esos schemas a `namedSchemas` en src/openapi/document.ts');
  process.exit(1);
}

const output = JSON.stringify(spec, null, 2) + '\n';

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) {
    console.error('✗ Falta openapi.json. Corré: bun run gen:openapi');
    process.exit(1);
  }
  if (readFileSync(OUT, 'utf-8') !== output) {
    console.error('✗ openapi.json está desactualizado respecto del código.');
    console.error('  Corré `bun run gen:openapi` y commiteá el resultado.');
    process.exit(1);
  }
  const paths = Object.keys((spec.paths ?? {}) as object).length;
  console.log(`✓ openapi.json al día (${paths} paths)`);
  process.exit(0);
}

writeFileSync(OUT, output);
const paths = Object.keys((spec.paths ?? {}) as object).length;
const schemas = Object.keys(
  ((spec.components as Record<string, unknown>)?.schemas ?? {}) as object,
).length;
console.log(`✓ openapi.json escrito — ${paths} paths, ${schemas} schemas`);
process.exit(0);

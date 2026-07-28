/**
 * Limpia los artefactos que hono-openapi deja dentro de `paths`.
 *
 * Se aplica en DOS lugares y tiene que ser el mismo código en ambos:
 *   - la ruta `/openapi.json` (src/app.ts)
 *   - el generador de `openapi.json` (scripts/gen-openapi.ts)
 *
 * Si solo se limpiara en el generador, el spec del repo y el que sirve
 * producción serían distintos, y quien generara tipos desde la URL en vivo
 * obtendría tipos rotos. Ya pasó.
 *
 * Qué se saca y por qué:
 *
 * - `$defs` — hono-openapi deja una copia de cada schema referenciado dentro de
 *   la respuesta, además de en `components.schemas`. El `$ref` ya apunta a
 *   components, así que es redundante; pero `openapi-typescript` lo lee como
 *   una PROPIEDAD REQUERIDA más del body y genera tipos que ninguna respuesta
 *   real satisface.
 * - `id` — viene de `.meta({ id })` de Zod. Sirve para nombrar el schema, pero
 *   no es válido dentro de un Schema Object de OpenAPI.
 * - `$schema` — válido en JSON Schema, no acá.
 */
export function sanitizeOpenApiPaths(paths: unknown): void {
  if (Array.isArray(paths)) {
    paths.forEach(sanitizeOpenApiPaths);
    return;
  }
  if (paths && typeof paths === 'object') {
    const obj = paths as Record<string, unknown>;
    delete obj.$defs;
    delete obj.id;
    delete obj.$schema;
    Object.values(obj).forEach(sanitizeOpenApiPaths);
  }
}

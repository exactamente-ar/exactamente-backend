import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/env';
import type { Context } from 'hono';

/**
 * Sirve un archivo del storage local. Solo se monta cuando
 * STORAGE_PROVIDER=local: en producción los objetos viven en R2 y esta ruta
 * no existe.
 */

// El Content-Type se declara a partir de la extensión. Es obligatorio aunque
// parezca cosmético: securityHeaders agrega `X-Content-Type-Options: nosniff`
// a todas las respuestas, y con nosniff + sin Content-Type el navegador no
// renderiza ni imágenes ni PDFs. En R2 esto no pasa porque el upload ya declara
// el mimeType; acá hay que derivarlo de la key.
const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function contentTypeFor(key: string): string {
  return MIME_BY_EXTENSION[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

export async function serveLocalFile(c: Context): Promise<Response> {
  const key = c.req.path.replace('/local-files/', '');
  const root = path.resolve(env.STORAGE_PATH);
  const resolved = path.resolve(root, key);

  // path.resolve normaliza `..`, así que esto también cierra el traversal:
  // una key que escape de STORAGE_PATH queda fuera de `root`.
  if (!resolved.startsWith(root)) {
    return c.json({ error: 'Archivo no encontrado' }, 404);
  }

  try {
    const buffer = await readFile(resolved);
    return new Response(buffer, { headers: { 'Content-Type': contentTypeFor(key) } });
  } catch {
    return c.json({ error: 'Archivo no encontrado' }, 404);
  }
}

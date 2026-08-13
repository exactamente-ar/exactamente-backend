import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/env';
import type { Context } from 'hono';

/**
 * Sirve un archivo del storage local. Solo se monta cuando
 * STORAGE_PROVIDER=local: en producción los objetos viven en R2 y esta ruta
 * no existe.
 */
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
    return new Response(buffer);
  } catch {
    return c.json({ error: 'Archivo no encontrado' }, 404);
  }
}

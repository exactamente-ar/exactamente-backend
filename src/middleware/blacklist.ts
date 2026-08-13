import { env } from '@/env';

/**
 * Blacklist de palabras prohibidas para posts y comentarios (AD-3).
 *
 * Medida provisional: lista separada por coma en `BLOG_BLACKLIST`, cargada una
 * sola vez al arrancar en un Set. La comparación normaliza acentos y case, y
 * matchea palabra completa para no bloquear "put" dentro de "computadora".
 *
 * Se expone `containsForbiddenWord` para que cada handler de escritura (posts
 * multipart, comentarios json) lo invoque tras validar su body.
 */

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

const forbidden = new Set(
  env.BLOG_BLACKLIST.split(',')
    .map((w) => normalize(w.trim()))
    .filter(Boolean),
);

export function containsForbiddenWord(text: string): boolean {
  if (forbidden.size === 0) return false;
  const words = normalize(text).split(/[^a-z0-9ñ]+/);
  return words.some((word) => forbidden.has(word));
}

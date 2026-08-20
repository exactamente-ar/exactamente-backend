import type { ModerationDecision } from './types';

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+/gi;
const MAX_ALLOWED_URLS = 3;
const REPEATED_CHARS_REGEX = /(.)\1{9,}/u;
const REPEATED_WORDS_REGEX = /\b([a-záéíóúñ0-9]+)(?:\s+\1){3,}\b/iu;

/**
 * Evalúa reglas determinísticas de detección de spam sobre el texto.
 */
export function checkSpam(text: string): ModerationDecision {
  // 1. Límite de URLs
  const urls = text.match(URL_REGEX);
  if (urls && urls.length > MAX_ALLOWED_URLS) {
    return {
      allowed: false,
      code: 'EXCESSIVE_URLS',
      message: `No se permiten más de ${MAX_ALLOWED_URLS} enlaces por publicación`,
    };
  }

  // 2. Repetición abusiva de caracteres (10+ consecutivos)
  if (REPEATED_CHARS_REGEX.test(text)) {
    return {
      allowed: false,
      code: 'SPAM',
      message: 'El contenido contiene repetición excesiva de caracteres',
    };
  }

  // 3. Repetición abusiva de palabras (4+ palabras consecutivas idénticas)
  if (REPEATED_WORDS_REGEX.test(text)) {
    return {
      allowed: false,
      code: 'SPAM',
      message: 'El contenido contiene palabras repetidas consecutivas',
    };
  }

  return { allowed: true };
}

import {
  DataSet,
  RegExpMatcher,
  parseRawPattern,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';
import { env } from '@/env';
import { ES_AR_BANNED_TERMS, ES_AR_WHITELISTED_TERMS } from './corpus/es-ar';
import {
  reserveDuplicateContent,
  type DuplicateReservationDecision,
  type DuplicateTracker,
} from './duplicate';
import { checkSpam } from './spam';
import type { ModerationDecision } from './types';

/**
 * Normaliza diacríticos y case para chequeo fallback de tokens.
 */
function normalizeSimple(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

/**
 * Colapsa caracteres individuales separados por espacios o signos
 * (ej: "p.u.t.o" -> "puto", "f - u - c - k" -> "fuck").
 */
function collapseSpacedLetters(text: string): string {
  return text.replace(/(?<=\b[a-zA-ZáéíóúñÁÉÍÓÚÑ])\s*[.\-_ \t]+\s*(?=[a-zA-ZáéíóúñÁÉÍÓÚÑ]\b)/g, '');
}

/**
 * Inicialización eagerly al cargar el módulo (singleton compilado una sola vez).
 */
const dataset = new DataSet();
dataset.addAll(englishDataset);

for (const term of ES_AR_BANNED_TERMS) {
  dataset.addPhrase((p) => {
    p.addPattern(parseRawPattern('|' + term + '|'));
    const collapsed = term.replace(/(.)\1+/g, '$1');
    if (collapsed !== term) {
      p.addPattern(parseRawPattern('|' + collapsed + '|'));
    }
    for (const w of ES_AR_WHITELISTED_TERMS) {
      p.addWhitelistedTerm(w);
    }
    return p;
  });
}

// Incorporamos las palabras de BLOG_BLACKLIST si las hay
const customEnvWords = env.BLOG_BLACKLIST.split(',')
  .map((w) => normalizeSimple(w.trim()))
  .filter(Boolean);

for (const customWord of customEnvWords) {
  dataset.addPhrase((p) => {
    p.addPattern(parseRawPattern('|' + customWord + '|'));
    const collapsed = customWord.replace(/(.)\1+/g, '$1');
    if (collapsed !== customWord) {
      p.addPattern(parseRawPattern('|' + collapsed + '|'));
    }
    for (const w of ES_AR_WHITELISTED_TERMS) {
      p.addWhitelistedTerm(w);
    }
    return p;
  });
}

const customEnvSet = new Set(customEnvWords);

const matcher = new RegExpMatcher({
  ...dataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * Evalúa las reglas completas de moderación de texto (mensajes duplicados, spam, enlaces, insultos, leet-speak y evasiones).
 */
export function evaluateContent(text: string): ModerationDecision {
  if (!text || text.trim().length === 0) {
    return { allowed: true };
  }

  // 1. Detección de spam y exceso de enlaces
  const spamDecision = checkSpam(text);
  if (!spamDecision.allowed) {
    return spamDecision;
  }

  // 2. Coincidencia con matcher de Obscenity en texto original
  if (matcher.hasMatch(text)) {
    return {
      allowed: false,
      code: 'INAPPROPRIATE_LANGUAGE',
      message: 'El contenido no cumple con las normas de la comunidad',
    };
  }

  // 3. Coincidencia con letras espaciadas / puntuación entre caracteres
  const collapsed = collapseSpacedLetters(text);
  if (collapsed !== text && matcher.hasMatch(collapsed)) {
    return {
      allowed: false,
      code: 'INAPPROPRIATE_LANGUAGE',
      message: 'El contenido no cumple con las normas de la comunidad',
    };
  }

  // 4. Chequeo fallback exacto por token normalizado (mantiene compatibilidad con blacklist existente)
  if (customEnvSet.size > 0) {
    const words = normalizeSimple(text).split(/[^a-z0-9ñ]+/);
    if (words.some((w) => customEnvSet.has(w))) {
      return {
        allowed: false,
        code: 'INAPPROPRIATE_LANGUAGE',
        message: 'El contenido no cumple con las normas de la comunidad',
      };
    }
  }

  return { allowed: true };
}

/**
 * Evalúa el texto y, si es válido, reserva atómicamente su publicación. La
 * reserva debe confirmarse tras persistir o liberarse ante cualquier fallo.
 */
export function evaluateContentForPublication(
  text: string,
  userId: string,
  tracker?: DuplicateTracker,
): DuplicateReservationDecision {
  const decision = evaluateContent(text);
  if (!decision.allowed) return decision;
  return reserveDuplicateContent(userId, text, tracker);
}

/**
 * Helper retrocompatible para call sites que esperan booleano.
 */
export function containsForbiddenWord(text: string): boolean {
  return !evaluateContent(text).allowed;
}

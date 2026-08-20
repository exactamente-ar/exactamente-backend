import type { ModerationDecision } from './types';

interface RecentMessage {
  userId: string;
  normalizedText: string;
  timestamp: number;
}

const DEFAULT_DUPLICATE_WINDOW_MS = 60 * 1000; // 60 segundos

/**
 * Almacén en memoria de envíos recientes para prevenir flooding y mensajes duplicados por usuario.
 */
export class DuplicateTracker {
  private recentMessages: RecentMessage[] = [];
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private windowMs = DEFAULT_DUPLICATE_WINDOW_MS) {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.windowMs);
  }

  private normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanup() {
    const cutoff = Date.now() - this.windowMs;
    this.recentMessages = this.recentMessages.filter((m) => m.timestamp > cutoff);
  }

  /**
   * Chequea si el usuario ya envió un mensaje idéntico en la ventana reciente.
   */
  isDuplicate(userId: string, text: string): boolean {
    const normalized = this.normalize(text);
    if (!normalized) return false;

    const cutoff = Date.now() - this.windowMs;
    return this.recentMessages.some(
      (m) => m.userId === userId && m.normalizedText === normalized && m.timestamp > cutoff,
    );
  }

  /**
   * Registra un mensaje publicado en el historial de envíos recientes.
   */
  record(userId: string, text: string): void {
    const normalized = this.normalize(text);
    if (!normalized) return;

    this.recentMessages.push({
      userId,
      normalizedText: normalized,
      timestamp: Date.now(),
    });
  }

  /**
   * Chequea y devuelve la decisión de moderación.
   */
  check(userId: string, text: string): ModerationDecision {
    if (this.isDuplicate(userId, text)) {
      return {
        allowed: false,
        code: 'DUPLICATE_CONTENT',
        message: 'No podés enviar el mismo mensaje repetidas veces. Por favor esperá un momento.',
      };
    }
    return { allowed: true };
  }

  reset() {
    this.recentMessages = [];
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const duplicateTracker = new DuplicateTracker();

export function checkDuplicateContent(
  userId: string,
  text: string,
  tracker = duplicateTracker,
): ModerationDecision {
  return tracker.check(userId, text);
}

export function recordPublishedContent(
  userId: string,
  text: string,
  tracker = duplicateTracker,
): void {
  tracker.record(userId, text);
}

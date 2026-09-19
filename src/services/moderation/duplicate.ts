import type { ModerationDecision } from './types';

interface RecentMessage {
  userId: string;
  normalizedText: string;
  timestamp: number;
}

export interface DuplicateReservation {
  /** Conserva la reserva como registro de una publicación exitosa. */
  commit(): void;
  /** Elimina la reserva cuando la publicación no llegó a persistirse. */
  release(): void;
}

export type DuplicateReservationDecision =
  | { allowed: true; reservation: DuplicateReservation }
  | Exclude<ModerationDecision, { allowed: true }>;

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
  private isDuplicate(userId: string, text: string): boolean {
    const normalized = this.normalize(text);
    if (!normalized) return false;

    const cutoff = Date.now() - this.windowMs;
    return this.recentMessages.some(
      (m) => m.userId === userId && m.normalizedText === normalized && m.timestamp > cutoff,
    );
  }

  /**
   * Reserva un mensaje de forma sincrónica: ningún segundo request puede pasar
   * el chequeo antes de que el primero termine su trabajo asíncrono.
   */
  reserve(userId: string, text: string): DuplicateReservationDecision {
    const normalized = this.normalize(text);
    if (!normalized) {
      return {
        allowed: true,
        reservation: { commit() {}, release() {} },
      };
    }

    this.cleanup();
    if (this.isDuplicate(userId, text)) {
      return {
        allowed: false,
        code: 'DUPLICATE_CONTENT',
        message: 'No podés enviar el mismo mensaje repetidas veces. Por favor esperá un momento.',
      };
    }

    const message = {
      userId,
      normalizedText: normalized,
      timestamp: Date.now(),
    };
    this.recentMessages.push(message);

    let active = true;
    return {
      allowed: true,
      reservation: {
        commit() {
          active = false;
        },
        release: () => {
          if (!active) return;
          active = false;
          const index = this.recentMessages.indexOf(message);
          if (index !== -1) this.recentMessages.splice(index, 1);
        },
      },
    };
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

export function reserveDuplicateContent(
  userId: string,
  text: string,
  tracker = duplicateTracker,
): DuplicateReservationDecision {
  return tracker.reserve(userId, text);
}

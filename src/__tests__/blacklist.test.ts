import { describe, it, expect } from 'bun:test';
import { containsForbiddenWord } from '@/middleware/blacklist';

// BLOG_BLACKLIST viene de scripts/lib/placeholder-env.ts (preload): 'spam,palabraprohibida'.

describe('containsForbiddenWord', () => {
  it('detecta una palabra prohibida exacta', () => {
    expect(containsForbiddenWord('esto es spam')).toBe(true);
  });

  it('es case-insensitive y tolera acentos', () => {
    expect(containsForbiddenWord('PalabraProhibida')).toBe(true);
    expect(containsForbiddenWord('palabraprohibidá')).toBe(true);
  });

  it('no matchea la palabra dentro de otra (falsos positivos)', () => {
    expect(containsForbiddenWord('la computadora computa')).toBe(false);
  });

  it('no bloquea texto limpio', () => {
    expect(containsForbiddenWord('¿Alguien tiene el parcial 2024?')).toBe(false);
  });
});

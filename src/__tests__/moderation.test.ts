import { describe, it, expect } from 'bun:test';
import {
  evaluateContent,
  evaluateContentForPublication,
  containsForbiddenWord,
  DuplicateTracker,
} from '@/services/moderation';

describe('evaluateContent - Texto limpio', () => {
  it('permite texto académico y consultas normales', () => {
    expect(evaluateContent('¿Alguien tiene los finales resueltos de Álgebra I?')).toEqual({
      allowed: true,
    });
    expect(evaluateContent('Recomiendo cursar con la cátedra de Pérez')).toEqual({
      allowed: true,
    });
    expect(evaluateContent('El parcial del año pasado estuvo accesible')).toEqual({
      allowed: true,
    });
  });

  it('permite texto vacío o whitespace', () => {
    expect(evaluateContent('')).toEqual({ allowed: true });
    expect(evaluateContent('   ')).toEqual({ allowed: true });
  });
});

describe('evaluateContent - Insultos y términos ofensivos (es-AR)', () => {
  it('bloquea insultos directos en español rioplatense', () => {
    const res1 = evaluateContent('sos un pelotudo');
    expect(res1.allowed).toBe(false);
    if (!res1.allowed) {
      expect(res1.code).toBe('INAPPROPRIATE_LANGUAGE');
    }

    const res2 = evaluateContent('que tipo boludo');
    expect(res2.allowed).toBe(false);

    const res3 = evaluateContent('esto es una mierda total');
    expect(res3.allowed).toBe(false);

    const res4 = evaluateContent('sos un forro');
    expect(res4.allowed).toBe(false);

    const res5 = evaluateContent('sos un mogolico');
    expect(res5.allowed).toBe(false);
  });

  it('bloquea insultos en inglés vía dataset base', () => {
    expect(evaluateContent('what the fuck is this').allowed).toBe(false);
    expect(evaluateContent('you are an asshole').allowed).toBe(false);
  });

  it('tolera mayúsculas y acentos', () => {
    expect(evaluateContent('Sos un PELOTUDO').allowed).toBe(false);
    expect(evaluateContent('sos un pelótudo').allowed).toBe(false);
    expect(evaluateContent('BOLUDO').allowed).toBe(false);
  });

  it('detecta evasiones por leet-speak', () => {
    expect(evaluateContent('sos un p3l0tud0').allowed).toBe(false);
    expect(evaluateContent('esto es una m1erd4').allowed).toBe(false);
    expect(evaluateContent('sos un b0lud0').allowed).toBe(false);
  });

  it('detecta evasiones por espaciado y signos entre letras', () => {
    expect(evaluateContent('sos un p.u.t.o').allowed).toBe(false);
    expect(evaluateContent('sos un p u t o').allowed).toBe(false);
    expect(evaluateContent('sos un f - u - c - k').allowed).toBe(false);
  });
});

describe('evaluateContent - Protección contra falso positivo (Scunthorpe problem)', () => {
  it('no bloquea "computadora" ni derivados', () => {
    expect(evaluateContent('la computadora funciona perfecto')).toEqual({ allowed: true });
    expect(evaluateContent('ciencias de la computación')).toEqual({ allowed: true });
    expect(evaluateContent('el modelo computa correctamente')).toEqual({ allowed: true });
  });

  it('no bloquea términos académicos legítimos', () => {
    expect(evaluateContent('el asistente de cátedra me dio la constancia')).toEqual({
      allowed: true,
    });
    expect(evaluateContent('vamos a discutir el ejercicio de análisis')).toEqual({
      allowed: true,
    });
    expect(evaluateContent('¿Cuándo entregan el título y certificado?')).toEqual({
      allowed: true,
    });
    expect(evaluateContent('código penal y análisis')).toEqual({
      allowed: true,
    });
  });
});

describe('evaluateContent - Detección de Spam y Enlaces', () => {
  it('permite hasta 3 URLs por publicación', () => {
    const textWith3Urls =
      'Links útiles: https://uba.ar y también https://exactas.uba.ar y www.google.com';
    expect(evaluateContent(textWith3Urls)).toEqual({ allowed: true });
  });

  it('bloquea más de 3 URLs', () => {
    const textWith4Urls = 'Links: https://a.com https://b.com https://c.com https://d.com';
    const res = evaluateContent(textWith4Urls);
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.code).toBe('EXCESSIVE_URLS');
      expect(res.message).toContain('No se permiten más de 3 enlaces');
    }
  });

  it('bloquea repetición abusiva de caracteres (10+ consecutivos)', () => {
    const res = evaluateContent('Holaaaaaaaaaaa mundo');
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.code).toBe('SPAM');
      expect(res.message).toContain('repetición excesiva');
    }
  });

  it('bloquea repetición consecutiva de palabras (4+)', () => {
    const res = evaluateContent('spam spam spam spam noticia');
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.code).toBe('SPAM');
      expect(res.message).toContain('palabras repetidas');
    }
  });

  it('permite hasta 2 líneas en blanco consecutivas', () => {
    const text = 'Párrafo 1\n\n\nPárrafo 2';
    expect(evaluateContent(text)).toEqual({ allowed: true });
  });

  it('bloquea más de 2 líneas en blanco consecutivas', () => {
    const text = 'Párrafo 1\n\n\n\nPárrafo 2';
    const res = evaluateContent(text);
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.code).toBe('SPAM');
      expect(res.message).toContain('líneas en blanco');
    }
  });

  it('bloquea líneas en blanco consecutivas con espacios intermedios', () => {
    const text = 'Párrafo 1\n  \n  \n  \nPárrafo 2';
    const res = evaluateContent(text);
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.code).toBe('SPAM');
      expect(res.message).toContain('líneas en blanco');
    }
  });
});

describe('containsForbiddenWord - retrocompatibilidad', () => {
  it('devuelve true para contenido bloqueado y false para limpio', () => {
    expect(containsForbiddenWord('esto es spam')).toBe(true);
    expect(containsForbiddenWord('sos un pelotudo')).toBe(true);
    expect(containsForbiddenWord('todo en orden por acá')).toBe(false);
  });
});

describe('DuplicateTracker - Bloqueo de mensajes idénticos (Anti-Flood)', () => {
  it('reserva atómicamente el primer envío y bloquea otro igual', () => {
    const tracker = new DuplicateTracker(1000);
    const first = evaluateContentForPublication(
      '¿Cómo resolver el ejercicio 3?',
      'user-1',
      tracker,
    );
    expect(first.allowed).toBe(true);

    const second = evaluateContentForPublication(
      '   ¿como resolver el   ejercicio 3?   ',
      'user-1',
      tracker,
    );
    expect(second.allowed).toBe(false);
    if (!second.allowed) {
      expect(second.code).toBe('DUPLICATE_CONTENT');
      expect(second.message).toContain('No podés enviar el mismo mensaje');
    }

    if (first.allowed) first.reservation.commit();
    tracker.destroy();
  });

  it('libera la reserva cuando la publicación falla', () => {
    const tracker = new DuplicateTracker(1000);
    const first = evaluateContentForPublication('Consulta sobre el TP', 'user-1', tracker);
    expect(first.allowed).toBe(true);
    if (first.allowed) first.reservation.release();

    const retry = evaluateContentForPublication('Consulta sobre el TP', 'user-1', tracker);
    expect(retry.allowed).toBe(true);
    if (retry.allowed) retry.reservation.commit();
    tracker.destroy();
  });

  it('permite el mismo mensaje para usuarios distintos', () => {
    const tracker = new DuplicateTracker(1000);
    const first = evaluateContentForPublication('Hola a todos', 'user-1', tracker);
    const second = evaluateContentForPublication('Hola a todos', 'user-2', tracker);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    if (first.allowed) first.reservation.commit();
    if (second.allowed) second.reservation.commit();
    tracker.destroy();
  });
});

import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { rateLimit } from '@/middleware/rateLimit';
import type { AppContext } from '@/types';

function makeApp(limit: number, windowMs: number) {
  const app = new Hono();
  app.get('/test', rateLimit({ limit, windowMs }), (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimit', () => {
  it('permite requests dentro del límite', async () => {
    const app = makeApp(3, 60_000);
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
    }
  });

  it('bloquea con 429 al superar el límite', async () => {
    const app = makeApp(2, 60_000);
    await app.request('/test');
    await app.request('/test');
    const res = await app.request('/test');
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Demasiados intentos. Intentá de nuevo más tarde.');
  });

  it('incluye el header Retry-After en la respuesta 429', async () => {
    const app = makeApp(1, 60_000);
    await app.request('/test');
    const res = await app.request('/test');
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('limites independientes por IP', async () => {
    const app = makeApp(1, 60_000);
    // IP A agota su cuota
    await app.request('/test', { headers: { 'x-real-ip': '1.2.3.4' } });
    const blocked = await app.request('/test', { headers: { 'x-real-ip': '1.2.3.4' } });
    expect(blocked.status).toBe(429);
    // IP B todavía tiene cuota
    const allowed = await app.request('/test', { headers: { 'x-real-ip': '5.6.7.8' } });
    expect(allowed.status).toBe(200);
  });

  it('limita por usuario (keyByUser) independientemente de la IP', async () => {
    const app = new Hono<AppContext>();
    app.use('/test', async (c, next) => {
      c.set('user', {
        sub: c.req.query('sub') ?? 'same-user',
        role: 'user',
        facultyId: null,
        iat: 0,
        exp: 0,
      });
      await next();
    });
    app.get('/test', rateLimit({ limit: 1, windowMs: 60_000, keyByUser: true }), (c) =>
      c.json({ ok: true }),
    );

    // Usuario A agota su cuota desde una IP
    expect((await app.request('/test?sub=a', { headers: { 'x-real-ip': '1.1.1.1' } })).status).toBe(
      200,
    );
    // Con IP distinta sigue bloqueado: el límite es por usuario, no por IP
    expect((await app.request('/test?sub=a', { headers: { 'x-real-ip': '2.2.2.2' } })).status).toBe(
      429,
    );
    // Usuario B desde la misma IP todavía tiene cuota
    expect((await app.request('/test?sub=b', { headers: { 'x-real-ip': '2.2.2.2' } })).status).toBe(
      200,
    );
  });
});

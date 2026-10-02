import { describe, it, expect, beforeAll, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import app from '@/app';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-exactly-32-chars!!';
});

// `requireRole` valida el token contra la base: un token cuyo `tokenVersion`
// quedó viejo, o cuyo usuario ya no existe o fue degradado, deja de servir.
// `userInDb` es lo que la base devolvería para el usuario del token; cada test
// lo setea para simular esos casos. `null` = el usuario ya no está.
type FakeUser = { role: string; tokenVersion: number };
let userInDb: FakeUser | null = null;

mock.module('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: mock(() => Promise.resolve(userInDb)),
      },
    },
  },
}));

import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { signToken } from '@/services/auth.service';
import type { AppContext } from '@/types';

describe('verifyToken', () => {
  const app = new Hono<AppContext>();
  app.get('/protected', verifyToken, (c) => {
    const user = c.get('user');
    return c.json({ userId: user.sub, role: user.role });
  });

  it('devuelve 401 sin header Authorization', async () => {
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Token requerido');
  });

  it('devuelve 401 con token inválido', async () => {
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer token-basura' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Token inválido o expirado');
  });

  it('pasa con token válido y expone el payload', async () => {
    const token = await signToken({
      sub: 'user-1',
      role: 'user',
      facultyId: null,
      tokenVersion: 0,
    });
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
    expect(body.role).toBe('user');
  });
});

describe('requireRole', () => {
  const app = new Hono<AppContext>();
  app.get('/admin-only', verifyToken, requireRole('admin'), (c) => c.json({ ok: true }));
  app.get('/super-only', verifyToken, requireRole('superadmin'), (c) => c.json({ ok: true }));

  beforeEach(() => {
    userInDb = { role: 'admin', tokenVersion: 0 };
  });

  it('devuelve 403 cuando user intenta acceder a ruta de admin', async () => {
    const token = await signToken({ sub: 'u1', role: 'user', facultyId: null, tokenVersion: 0 });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('pasa cuando admin accede a ruta de admin', async () => {
    const token = await signToken({
      sub: 'a1',
      role: 'admin',
      facultyId: 'FACET',
      tokenVersion: 0,
    });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('pasa cuando superadmin accede a ruta de admin (jerarquía)', async () => {
    userInDb = { role: 'superadmin', tokenVersion: 0 };
    const token = await signToken({
      sub: 'sa1',
      role: 'superadmin',
      facultyId: null,
      tokenVersion: 0,
    });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('devuelve 403 cuando admin intenta acceder a ruta de superadmin', async () => {
    const token = await signToken({
      sub: 'a1',
      role: 'admin',
      facultyId: 'FACET',
      tokenVersion: 0,
    });
    const res = await app.request('/super-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  // ─── Revocación ─────────────────────────────────────────────────────────────

  it('devuelve 401 si el tokenVersion del token quedó viejo', async () => {
    const token = await signToken({
      sub: 'a1',
      role: 'admin',
      facultyId: 'FACET',
      tokenVersion: 0,
    });
    userInDb = { role: 'admin', tokenVersion: 1 }; // alguien bumpeó la versión
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Sesión revocada');
  });

  it('devuelve 401 si el usuario ya no existe', async () => {
    const token = await signToken({
      sub: 'borrado',
      role: 'admin',
      facultyId: null,
      tokenVersion: 0,
    });
    userInDb = null;
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('devuelve 403 si al usuario lo degradaron, aunque el token diga admin', async () => {
    const token = await signToken({
      sub: 'a1',
      role: 'admin',
      facultyId: 'FACET',
      tokenVersion: 0,
    });
    userInDb = { role: 'user', tokenVersion: 0 }; // degradado en la base
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('no consulta la base cuando el rol del token ya es insuficiente', async () => {
    // El rechazo barato va primero: las lecturas con token de `user` no pagan
    // una query. Si el middleware consultara igual, este test daría 401.
    userInDb = null;
    const token = await signToken({ sub: 'u1', role: 'user', facultyId: null, tokenVersion: 0 });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe('security headers', () => {
  it('incluye X-Content-Type-Options: nosniff', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('incluye X-Frame-Options: DENY', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('incluye Referrer-Policy', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('incluye Strict-Transport-Security', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });
});

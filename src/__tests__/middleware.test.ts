import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-exactly-32-chars!!';
});

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
    const token = await signToken({ sub: 'user-1', role: 'user', facultyId: null });
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

  it('devuelve 403 cuando user intenta acceder a ruta de admin', async () => {
    const token = await signToken({ sub: 'u1', role: 'user', facultyId: null });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('pasa cuando admin accede a ruta de admin', async () => {
    const token = await signToken({ sub: 'a1', role: 'admin', facultyId: 'FACET' });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('pasa cuando superadmin accede a ruta de admin (jerarquía)', async () => {
    const token = await signToken({ sub: 'sa1', role: 'superadmin', facultyId: null });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('devuelve 403 cuando admin intenta acceder a ruta de superadmin', async () => {
    const token = await signToken({ sub: 'a1', role: 'admin', facultyId: 'FACET' });
    const res = await app.request('/super-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});

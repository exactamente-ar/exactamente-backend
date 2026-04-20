import { describe, it, expect, mock, beforeAll } from 'bun:test';

// Mock de la DB antes de cualquier import que la use
mock.module('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: mock(() => Promise.resolve(null)),
      },
    },
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
          role: 'user',
          emailVerified: false,
          adminFacultyId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          passwordHash: 'hash',
        }])),
      })),
    })),
  },
}));

import app from '@/app';

describe('POST /api/v1/auth/register', () => {
  it('devuelve 400 si falta el email', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123', displayName: 'Test' }),
    });
    expect(res.status).toBe(400);
  });

  it('devuelve 400 si la contraseña tiene menos de 8 caracteres', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'corta', displayName: 'Test' }),
    });
    expect(res.status).toBe(400);
  });

  it('devuelve 400 si el body no es JSON válido', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('devuelve 400 si falta el password', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('devuelve 400 con email inválido', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no-es-email', password: 'pass1234' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('devuelve 401 sin token', async () => {
    const res = await app.request('/api/v1/auth/me');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Token requerido');
  });

  it('devuelve 401 con token malformado', async () => {
    const res = await app.request('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer token-basura' },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /health', () => {
  it('devuelve 200 con status ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});

describe('404 global', () => {
  it('devuelve 404 con formato { error } para rutas inexistentes', async () => {
    const res = await app.request('/api/v1/ruta-que-no-existe');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Ruta no encontrada');
  });
});

describe('X-Request-ID', () => {
  it('incluye X-Request-ID en la respuesta', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Request-ID')).not.toBeNull();
  });

  it('reutiliza el X-Request-ID enviado por el cliente', async () => {
    const res = await app.request('/health', {
      headers: { 'X-Request-ID': 'mi-id-custom' },
    });
    expect(res.headers.get('X-Request-ID')).toBe('mi-id-custom');
  });
});

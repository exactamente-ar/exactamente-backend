import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

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
          id:             'user-google-1',
          email:          'juan@gmail.com',
          displayName:    'Juan Google',
          googleId:       'google-sub-123',
          role:           'user',
          emailVerified:  true,
          adminFacultyId: null,
          passwordHash:   null,
          createdAt:      new Date(),
          updatedAt:      new Date(),
        }])),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(() => Promise.resolve([{
            id:             'user-existing-1',
            email:          'existing@gmail.com',
            displayName:    'Existing User',
            googleId:       'google-sub-456',
            role:           'user',
            emailVerified:  true,
            adminFacultyId: null,
            passwordHash:   'hash',
            createdAt:      new Date(),
            updatedAt:      new Date(),
          }])),
        })),
      })),
    })),
  },
}));

import app from '@/app';

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchGoogleSuccess(googleId = 'google-sub-123', email = 'juan@gmail.com', name = 'Juan Google') {
  global.fetch = mock((url: string) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return Promise.resolve({
        ok:   true,
        json: () => Promise.resolve({ access_token: 'fake-access-token' }),
      } as Response);
    }
    if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
      return Promise.resolve({
        ok:   true,
        json: () => Promise.resolve({ id: googleId, email, name }),
      } as Response);
    }
    return originalFetch(url);
  }) as typeof fetch;
}

describe('GET /api/v1/auth/google', () => {
  it('redirige a accounts.google.com con state', async () => {
    const res = await app.request('/api/v1/auth/google');
    expect(res.status).toBe(302);
    const location = res.headers.get('Location') ?? '';
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('client_id=test-google-client-id');
    expect(location).toContain('state=');
  });
});

describe('GET /api/v1/auth/google/callback', () => {
  it('redirige a /login?error=oauth_denied cuando Google devuelve error', async () => {
    const res = await app.request('/api/v1/auth/google/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/login?error=oauth_denied');
  });

  it('redirige a /login?error=oauth_denied sin code ni error', async () => {
    const res = await app.request('/api/v1/auth/google/callback');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/login?error=oauth_denied');
  });

  it('crea usuario nuevo y redirige con state válido', async () => {
    mockFetchGoogleSuccess();

    // Get valid state from the redirect
    const initRes = await app.request('/api/v1/auth/google');
    const location = initRes.headers.get('Location') ?? '';
    const state = new URL(location).searchParams.get('state') ?? '';

    const res = await app.request(`/api/v1/auth/google/callback?code=valid-code-123&state=${state}`);
    expect(res.status).toBe(302);
    const callbackLocation = res.headers.get('Location') ?? '';
    expect(callbackLocation).toContain('/auth/callback');
  });

  it('rechaza callback sin state', async () => {
    const res = await app.request('/api/v1/auth/google/callback?code=valid-code');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/login?error=oauth_denied');
  });

  it('rechaza callback con state inválido', async () => {
    const res = await app.request('/api/v1/auth/google/callback?code=valid-code&state=fake-state');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/login?error=oauth_denied');
  });

  it('redirige a /login?error=oauth_failed si Google rechaza el code', async () => {
    global.fetch = mock(() => Promise.resolve({
      ok:   false,
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    } as Response)) as typeof fetch;

    // Get valid state
    const initRes = await app.request('/api/v1/auth/google');
    const location = initRes.headers.get('Location') ?? '';
    const state = new URL(location).searchParams.get('state') ?? '';

    const res = await app.request(`/api/v1/auth/google/callback?code=bad-code&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/login?error=oauth_failed');
  });
});

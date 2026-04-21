import { test, expect, describe } from 'bun:test';
import adminUniversitiesApp from '@/routes/admin/universities';
import adminFacultiesApp    from '@/routes/admin/faculties';
import adminCareersApp      from '@/routes/admin/careers';
import adminCareerPlansApp  from '@/routes/admin/career-plans';
import adminSubjectsApp     from '@/routes/admin/subjects';
import adminDriveApp        from '@/routes/admin/drive';
import { signToken } from '@/services/auth.service';

async function token(role: 'user' | 'admin') {
  return signToken({ sub: 'u1', role, facultyId: null });
}

// ─── Helper: make a request to a Hono app ─────────────────────────────────────

async function req(
  app: typeof adminUniversitiesApp,
  path: string,
  opts: { method?: string; authRole?: 'user' | 'admin' | null; body?: unknown } = {},
) {
  const { method = 'GET', authRole = null, body } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authRole) headers['Authorization'] = `Bearer ${await token(authRole)}`;
  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Universities ─────────────────────────────────────────────────────────────

describe('admin/universities', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminUniversitiesApp, '/');
    expect(res.status).toBe(401);
  });

  test('GET / returns 403 with user role', async () => {
    const res = await req(adminUniversitiesApp, '/', { authRole: 'user' });
    expect(res.status).toBe(403);
  });

  test('POST / returns 400 when name is missing', async () => {
    const res = await req(adminUniversitiesApp, '/', {
      method: 'POST', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id returns 400 when name is missing', async () => {
    const res = await req(adminUniversitiesApp, '/some-id', {
      method: 'PATCH', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });
});

// ─── Faculties ────────────────────────────────────────────────────────────────

describe('admin/faculties', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminFacultiesApp, '/');
    expect(res.status).toBe(401);
  });

  test('GET / returns 403 with user role', async () => {
    const res = await req(adminFacultiesApp, '/', { authRole: 'user' });
    expect(res.status).toBe(403);
  });

  test('POST / returns 400 when universityId is missing', async () => {
    const res = await req(adminFacultiesApp, '/', {
      method: 'POST', authRole: 'admin', body: { name: 'FACET' },
    });
    expect(res.status).toBe(400);
  });
});

// ─── Careers ──────────────────────────────────────────────────────────────────

describe('admin/careers', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminCareersApp, '/');
    expect(res.status).toBe(401);
  });

  test('POST / returns 400 when facultyId is missing', async () => {
    const res = await req(adminCareersApp, '/', {
      method: 'POST', authRole: 'admin', body: { name: 'Sistemas' },
    });
    expect(res.status).toBe(400);
  });
});

// ─── Career Plans ─────────────────────────────────────────────────────────────

describe('admin/career-plans', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminCareerPlansApp, '/');
    expect(res.status).toBe(401);
  });

  test('POST / returns 400 when year is missing', async () => {
    const res = await req(adminCareerPlansApp, '/', {
      method: 'POST', authRole: 'admin', body: { careerId: 'c1', name: 'Plan 2019' },
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id returns 400 when body is empty', async () => {
    const res = await req(adminCareerPlansApp, '/some-id', {
      method: 'PATCH', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });
});

// ─── Subjects ─────────────────────────────────────────────────────────────────

describe('admin/subjects', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminSubjectsApp, '/');
    expect(res.status).toBe(401);
  });

  test('POST / returns 400 when required fields are missing', async () => {
    const res = await req(adminSubjectsApp, '/', {
      method: 'POST', authRole: 'admin', body: { title: 'Análisis' },
    });
    expect(res.status).toBe(400);
  });
});

// ─── Drive ────────────────────────────────────────────────────────────────────

describe('admin/drive', () => {
  test('GET /tree returns 401 without token', async () => {
    const res = await req(adminDriveApp, '/tree');
    expect(res.status).toBe(401);
  });

  test('GET /tree returns 403 with user role', async () => {
    const res = await req(adminDriveApp, '/tree', { authRole: 'user' });
    expect(res.status).toBe(403);
  });

  test('POST /folder returns 400 when name is missing', async () => {
    const res = await req(adminDriveApp, '/folder', {
      method: 'POST', authRole: 'admin', body: { parentId: 'root' },
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /folder/:id returns 400 when name is missing', async () => {
    const res = await req(adminDriveApp, '/folder/some-id', {
      method: 'PATCH', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });
});

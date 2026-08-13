import { describe, it, expect } from 'bun:test';
import blogsApp from '@/routes/blogs';
import { signToken } from '@/services/auth.service';

async function token(role: 'user' | 'admin' = 'user') {
  return signToken({ sub: 'u1', role, facultyId: null });
}

async function post(fields: Record<string, string>, authRole: 'user' | 'admin' | null = 'user') {
  const headers: Record<string, string> = {};
  if (authRole) headers['Authorization'] = `Bearer ${await token(authRole)}`;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return blogsApp.request('/s1/posts', { method: 'POST', headers, body: form });
}

describe('blogs — crear post', () => {
  it('rechaza sin token (401)', async () => {
    const res = await post({}, null);
    expect(res.status).toBe(401);
  });

  it('rechaza body inválido (400)', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('rechaza contenido con palabra prohibida (400)', async () => {
    const res = await post({
      subtopicId: 'st1',
      authority: 'anonymous',
      body: 'esto es spam',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('El contenido no cumple con las normas de la comunidad');
  });
});

describe('blogs — votar post', () => {
  it('rechaza sin token (401)', async () => {
    const res = await blogsApp.request('/s1/posts/p1/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('rechaza valor de voto inválido (400)', async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
    };
    const res = await blogsApp.request('/s1/posts/p1/vote', {
      method: 'POST',
      headers,
      body: JSON.stringify({ value: 0 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('blogs — comentar', () => {
  it('rechaza sin token (401)', async () => {
    const formData = new FormData();
    formData.append('body', 'hola');
    formData.append('authority', 'visible');
    const res = await blogsApp.request('/s1/posts/p1/comments', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(401);
  });

  it('rechaza body inválido (400)', async () => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await token()}`,
    };
    const res = await blogsApp.request('/s1/posts/p1/comments', {
      method: 'POST',
      headers,
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });

  it('rechaza contenido con palabra prohibida (400)', async () => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await token()}`,
    };
    const formData = new FormData();
    formData.append('body', 'esto es spam');
    formData.append('authority', 'visible');
    const res = await blogsApp.request('/s1/posts/p1/comments', {
      method: 'POST',
      headers,
      body: formData,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('El contenido no cumple con las normas de la comunidad');
  });
});

describe('blogs — borrar post y comentario', () => {
  it('rechaza borrar post sin token (401)', async () => {
    const res = await blogsApp.request('/s1/posts/p1', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('rechaza borrar comentario sin token (401)', async () => {
    const res = await blogsApp.request('/s1/posts/p1/comments/c1', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

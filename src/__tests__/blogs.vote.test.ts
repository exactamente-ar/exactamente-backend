import { describe, it, expect, mock } from 'bun:test';
import { signToken } from '@/services/auth.service';

mock.module('@/db', () => ({
  db: {
    query: {
      blogPosts: {
        findFirst: mock(() =>
          Promise.resolve({
            id: 'p1',
            subjectId: 's1',
            authorId: 'u-other',
            status: 'deleted',
          }),
        ),
      },
    },
  },
}));

import blogsApp from '@/routes/blogs';

async function token() {
  return signToken({ sub: 'u1', role: 'user', facultyId: null });
}

describe('blogs — votar contenido eliminado', () => {
  it('rechaza votar una publicación eliminada (400)', async () => {
    const res = await blogsApp.request('/s1/posts/p1/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({ value: 1 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('No se puede votar una publicación eliminada');
  });
});

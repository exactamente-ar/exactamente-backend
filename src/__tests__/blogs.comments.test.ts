import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { signToken } from '@/services/auth.service';
import { resetAllRateLimits } from '@/middleware/rateLimit';

mock.module('@/db', () => ({
  db: {
    query: {
      blogPosts: {
        findFirst: mock(() =>
          Promise.resolve({
            id: 'p1',
            subjectId: 's1',
            authorId: 'u-other',
            body: 'contenido del post',
            authority: 'visible',
            status: 'published',
            netScore: 0,
            createdAt: new Date(),
          }),
        ),
      },
      blogComments: {
        findFirst: mock(() => Promise.resolve(null)),
      },
      users: {
        findFirst: mock(() =>
          Promise.resolve({ id: 'u1', email: 'me@example.com', displayName: 'Yo' }),
        ),
      },
    },
    insert: mock(() => ({
      values: mock((vals: Record<string, unknown>) => ({
        returning: mock(() =>
          Promise.resolve([
            {
              id: 'c1',
              postId: vals.postId,
              parentId: vals.parentId ?? null,
              authorId: vals.authorId,
              body: vals.body,
              authority: vals.authority,
              status: 'published',
              netScore: 0,
              depth: vals.depth,
              createdAt: new Date(),
            },
          ]),
        ),
      })),
    })),
    transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: mock(() => ({
          values: mock((vals: Record<string, unknown>) => ({
            returning: mock(() =>
              Promise.resolve([
                {
                  id: 'c1',
                  postId: vals.postId || 'p1',
                  parentId: vals.parentId ?? null,
                  authorId: vals.authorId || 'u1',
                  body: vals.body || 'hola',
                  authority: vals.authority || 'visible',
                  status: 'published',
                  netScore: 0,
                  depth: vals.depth || 1,
                  createdAt: new Date(),
                },
              ]),
            ),
          })),
        })),
      };
      return await cb(tx);
    }),
  },
}));

import blogsApp from '@/routes/blogs';

async function token() {
  return signToken({ sub: 'u1', role: 'user', facultyId: null });
}

describe('blogs — crear comentario', () => {
  beforeEach(() => {
    resetAllRateLimits();
  });

  it('devuelve 201 con el comentario creado', async () => {
    const formData = new FormData();
    formData.append('body', 'hola');
    formData.append('authority', 'visible');

    const res = await blogsApp.request('/s1/posts/p1/comments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token()}`,
      },
      body: formData,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      body: string;
      author: { name: string } | null;
    };
    expect(body.id).toBe('c1');
    expect(body.body).toBe('hola');
    expect(body.author).toEqual({ name: 'Yo' });
  });
});

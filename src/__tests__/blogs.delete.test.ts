import { describe, it, expect, mock } from 'bun:test';
import { signToken } from '@/services/auth.service';

const deleteMock = mock(() => ({
  where: mock(() => Promise.resolve()),
}));

const updateMock = mock(() => ({
  set: mock(() => ({
    where: mock(() => Promise.resolve()),
  })),
}));

let findFirstReturn: unknown;

mock.module('@/db', () => ({
  db: {
    query: {
      blogPosts: {
        findFirst: mock(() => Promise.resolve(findFirstReturn)),
      },
      blogImages: {
        findMany: mock(() => Promise.resolve([])),
      },
    },
    transaction: mock(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        delete: deleteMock,
        update: updateMock,
      };
      await cb(tx);
    }),
  },
}));

import blogsApp from '@/routes/blogs';

async function token() {
  return signToken({ sub: 'u1', role: 'user', facultyId: null });
}

describe('blogs — DELETE /:subjectId/posts/:postId', () => {
  it('hace soft delete si hay comentarios activos', async () => {
    deleteMock.mockClear();
    updateMock.mockClear();

    findFirstReturn = {
      id: 'p-soft',
      authorId: 'u1',
      images: [],
      comments: [{ id: 'c1', status: 'published' }],
    };

    const res = await blogsApp.request('/s1/posts/p-soft', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('hace hard delete si todos los comentarios están eliminados (o no hay)', async () => {
    deleteMock.mockClear();
    updateMock.mockClear();

    findFirstReturn = {
      id: 'p-hard',
      authorId: 'u1',
      images: [],
      comments: [{ id: 'c1', status: 'deleted' }],
    };

    const res = await blogsApp.request('/s1/posts/p-hard', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

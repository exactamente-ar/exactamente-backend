import { describe, it, expect, mock, beforeEach } from 'bun:test';
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
let commentsReturn: unknown;
let imagesReturn: unknown;

beforeEach(() => {
  deleteMock.mockClear();
  updateMock.mockClear();
});

mock.module('@/db', () => ({
  db: {
    query: {
      blogPosts: {
        findFirst: mock(() => Promise.resolve(findFirstReturn)),
      },
      blogComments: {
        findMany: mock(() => Promise.resolve(commentsReturn)),
      },
      blogImages: {
        findMany: mock(() => Promise.resolve(imagesReturn)),
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

async function token(role: 'user' | 'admin' | 'superadmin' = 'user') {
  return signToken({ sub: 'u1', role, facultyId: null });
}

describe('blogs — DELETE /:subjectId/posts/:postId', () => {
  it('hace soft delete si hay comentarios activos', async () => {
    findFirstReturn = {
      id: 'p-soft',
      authorId: 'u1',
      subtitle: null,
      body: 'x',
      authority: 'visible',
      status: 'published',
      netScore: 0,
      comments: [{ id: 'c1', status: 'published' }],
    };
    imagesReturn = [];

    const res = await blogsApp.request('/s1/posts/p-soft', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('hace hard delete si todos los comentarios están eliminados (o no hay)', async () => {
    findFirstReturn = {
      id: 'p-hard',
      authorId: 'u1',
      body: 'x',
      authority: 'visible',
      status: 'published',
      netScore: 0,
      comments: [{ id: 'c1', status: 'deleted' }],
    };
    imagesReturn = [];

    const res = await blogsApp.request('/s1/posts/p-hard', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('permite borrar a un admin aunque no sea el autor (403 solo para ajenos)', async () => {
    findFirstReturn = {
      id: 'p-admin',
      authorId: 'u-other',
      body: 'x',
      authority: 'visible',
      status: 'published',
      netScore: 0,
      comments: [{ id: 'c1', status: 'published' }],
    };
    imagesReturn = [];

    const res = await blogsApp.request('/s1/posts/p-admin', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token('admin')}` },
    });
    expect(res.status).toBe(204);
  });
});

describe('blogs — DELETE /:subjectId/posts/:postId/comments/:commentId', () => {
  it('rechaza un comentario que no es del post (404)', async () => {
    commentsReturn = [
      { id: 'c-other', postId: 'p-other', authorId: 'u-other', status: 'published' },
    ];

    const res = await blogsApp.request('/s1/posts/p1/comments/c-not-there', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('rechaza borrar un comentario ajeno (403)', async () => {
    commentsReturn = [{ id: 'c1', postId: 'p1', authorId: 'u-other', status: 'published' }];

    const res = await blogsApp.request('/s1/posts/p1/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(403);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('hace soft delete si hay descendientes activos', async () => {
    deleteMock.mockClear();
    updateMock.mockClear();

    commentsReturn = [
      { id: 'c1', postId: 'p1', parentId: null, authorId: 'u1', status: 'published' },
      { id: 'c2', postId: 'p1', parentId: 'c1', authorId: 'u-other', status: 'published' },
    ];
    imagesReturn = [];

    const res = await blogsApp.request('/s1/posts/p1/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('hace hard delete de todo el subárbol cuando todos sus descendientes están eliminados', async () => {
    commentsReturn = [
      { id: 'c1', postId: 'p1', parentId: null, authorId: 'u1', status: 'published' },
      { id: 'c2', postId: 'p1', parentId: 'c1', authorId: 'u-other', status: 'deleted' },
      { id: 'c3', postId: 'p1', parentId: 'c2', authorId: 'u-other', status: 'deleted' },
    ];
    imagesReturn = [];

    const res = await blogsApp.request('/s1/posts/p1/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('hace hard delete de un comentario hoja sin descendientes', async () => {
    commentsReturn = [
      { id: 'c1', postId: 'p1', parentId: null, authorId: 'u-other', status: 'published' },
      { id: 'c2', postId: 'p1', parentId: 'c1', authorId: 'u1', status: 'published' },
    ];
    imagesReturn = [];

    const res = await blogsApp.request('/s1/posts/p1/comments/c2', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

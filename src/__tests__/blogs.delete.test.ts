import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { signToken } from '@/services/auth.service';
import { prepareSubjectBlogDeletion, deletePolymorphicBlogData } from '@/services/blog-deletion';

const deleteMock = mock(() => ({
  where: mock(() => Promise.resolve()),
}));

const updateMock = mock(() => ({
  set: mock(() => ({
    where: mock(() => Promise.resolve()),
  })),
}));

let postFindFirstReturn: unknown;
let postsFindManyReturn: unknown;
let commentFindFirstReturn: unknown;
let commentsFindManyReturn: unknown;
let imagesFindManyReturn: unknown;

beforeEach(() => {
  deleteMock.mockClear();
  updateMock.mockClear();
  postFindFirstReturn = undefined;
  postsFindManyReturn = [];
  commentFindFirstReturn = undefined;
  commentsFindManyReturn = undefined;
  imagesFindManyReturn = [];
});

mock.module('@/db', () => ({
  db: {
    query: {
      blogPosts: {
        findFirst: mock(() => Promise.resolve(postFindFirstReturn)),
        findMany: mock(() => Promise.resolve(postsFindManyReturn)),
      },
      blogComments: {
        findFirst: mock(() => Promise.resolve(commentFindFirstReturn)),
        findMany: mock(() => Promise.resolve(commentsFindManyReturn)),
      },
      blogImages: {
        findMany: mock(() => Promise.resolve(imagesFindManyReturn)),
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
    postFindFirstReturn = {
      id: 'p-soft',
      authorId: 'u1',
      subtitle: null,
      body: 'x',
      authority: 'visible',
      status: 'published',
      netScore: 0,
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
    postFindFirstReturn = {
      id: 'p-hard',
      authorId: 'u1',
      body: 'x',
      authority: 'visible',
      status: 'published',
      netScore: 0,
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

  it('permite borrar a un admin aunque no sea el autor (403 solo para ajenos)', async () => {
    postFindFirstReturn = {
      id: 'p-admin',
      authorId: 'u-other',
      body: 'x',
      authority: 'visible',
      status: 'published',
      netScore: 0,
      comments: [{ id: 'c1', status: 'published' }],
    };

    const res = await blogsApp.request('/s1/posts/p-admin', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token('admin')}` },
    });
    expect(res.status).toBe(204);
  });
});

describe('blogs — DELETE /:subjectId/posts/:postId/comments/:commentId', () => {
  it('rechaza si el post no existe o no es de la materia (404)', async () => {
    postFindFirstReturn = undefined;

    const res = await blogsApp.request('/s1/posts/p1/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('rechaza un comentario que no es del post (404)', async () => {
    postFindFirstReturn = { id: 'p1' };
    commentFindFirstReturn = undefined;

    const res = await blogsApp.request('/s1/posts/p1/comments/c-not-there', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('rechaza borrar un comentario ajeno (403)', async () => {
    postFindFirstReturn = { id: 'p1' };
    commentFindFirstReturn = { id: 'c1', postId: 'p1', authorId: 'u-other', status: 'published' };

    const res = await blogsApp.request('/s1/posts/p1/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(403);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('hace soft delete si hay descendientes activos', async () => {
    postFindFirstReturn = { id: 'p1' };
    commentFindFirstReturn = { id: 'c1', postId: 'p1', authorId: 'u1', status: 'published' };
    commentsFindManyReturn = [
      { id: 'c1', parentId: null, status: 'published' },
      { id: 'c2', parentId: 'c1', status: 'published' },
    ];

    const res = await blogsApp.request('/s1/posts/p1/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('hace hard delete de todo el subárbol cuando todos sus descendientes están eliminados', async () => {
    postFindFirstReturn = { id: 'p1' };
    commentFindFirstReturn = { id: 'c1', postId: 'p1', authorId: 'u1', status: 'published' };
    commentsFindManyReturn = [
      { id: 'c1', parentId: null, status: 'published' },
      { id: 'c2', parentId: 'c1', status: 'deleted' },
      { id: 'c3', parentId: 'c2', status: 'deleted' },
    ];

    const res = await blogsApp.request('/s1/posts/p1/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('hace hard delete de un comentario hoja sin descendientes', async () => {
    postFindFirstReturn = { id: 'p1' };
    commentFindFirstReturn = { id: 'c2', postId: 'p1', authorId: 'u1', status: 'published' };
    commentsFindManyReturn = [
      { id: 'c1', parentId: null, status: 'published' },
      { id: 'c2', parentId: 'c1', status: 'published' },
    ];

    const res = await blogsApp.request('/s1/posts/p1/comments/c2', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('prepareSubjectBlogDeletion & deletePolymorphicBlogData', () => {
  it('recopila correctamente los targetIds y r2Keys de posts y comentarios de la materia', async () => {
    postsFindManyReturn = [{ id: 'p1' }, { id: 'p2' }];
    commentsFindManyReturn = [{ id: 'c1' }, { id: 'c2' }];
    imagesFindManyReturn = [{ r2Key: 'key-1' }, { r2Key: 'key-2' }];

    const { targetIds, r2Keys } = await prepareSubjectBlogDeletion('s1');

    expect(targetIds).toEqual(['p1', 'p2', 'c1', 'c2']);
    expect(r2Keys).toEqual(['key-1', 'key-2']);
  });

  it('no ejecuta deletes en BD si no hay targetIds', async () => {
    const tx = {
      delete: deleteMock,
      update: updateMock,
    } as unknown as Parameters<typeof deletePolymorphicBlogData>[0];

    await deletePolymorphicBlogData(tx, []);

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('ejecuta delete de votes e images en BD si hay targetIds', async () => {
    const tx = {
      delete: deleteMock,
      update: updateMock,
    } as unknown as Parameters<typeof deletePolymorphicBlogData>[0];

    await deletePolymorphicBlogData(tx, ['p1', 'c1']);

    expect(deleteMock).toHaveBeenCalledTimes(2);
  });
});

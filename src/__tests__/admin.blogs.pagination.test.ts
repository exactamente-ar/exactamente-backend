import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { signToken } from '@/services/auth.service';

const subjectFindFirst = mock(() => Promise.resolve<{ id: string } | null>({ id: 's1' }));
const subtopicsFindMany = mock(() =>
  Promise.resolve([
    { id: 'st1', name: 'Algoritmos', slug: 'algoritmos', isDefault: false },
    { id: 'st2', name: 'General', slug: 'general', isDefault: true },
  ]),
);
const postsFindMany = mock(() =>
  Promise.resolve([
    {
      id: 'p1',
      subjectId: 's1',
      postId: null,
      body: 'post',
      authority: 'visible',
      status: 'published',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      author: { displayName: 'Autora' },
      subject: { title: 'Materia' },
    },
  ]),
);
const commentsFindMany = mock(() =>
  Promise.resolve([
    {
      id: 'c1',
      postId: 'p1',
      body: 'comentario',
      authority: 'visible',
      status: 'published',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      author: { displayName: 'Autor' },
      post: { subjectId: 's1', subject: { title: 'Materia' } },
    },
  ]),
);

mock.module('@/db', () => ({
  db: {
    query: {
      subjects: { findFirst: subjectFindFirst },
      blogSubtopics: { findMany: subtopicsFindMany },
      blogPosts: { findMany: postsFindMany },
      blogComments: { findMany: commentsFindMany },
    },
    select: mock(() => ({
      from: mock(() => {
        const result = Promise.resolve([{ count: 3 }]);
        return {
          where: mock(() => result),
          then: result.then.bind(result),
        };
      }),
    })),
  },
}));

import adminBlogsApp from '@/routes/admin/blogs';

async function adminToken() {
  return signToken({ sub: 'admin-1', role: 'admin', facultyId: null });
}

describe('admin/blogs — paginación', () => {
  beforeEach(() => {
    subjectFindFirst.mockClear();
    subtopicsFindMany.mockClear();
    postsFindMany.mockClear();
    commentsFindMany.mockClear();
    subjectFindFirst.mockImplementation(() => Promise.resolve({ id: 's1' }));
  });

  it('pagina la actividad y devuelve el contrato estándar', async () => {
    const res = await adminBlogsApp.request('/activity?page=2&limit=1', {
      headers: { Authorization: `Bearer ${await adminToken()}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: unknown[];
      total: number;
      page: number;
      totalPages: number;
    };
    expect(body).toMatchObject({ total: 6, page: 2, totalPages: 6 });
    expect(body.data).toHaveLength(1);
  });

  it('devuelve 404 sin consultar subtemas cuando la materia no existe', async () => {
    subjectFindFirst.mockImplementation(() => Promise.resolve(null));

    const res = await adminBlogsApp.request('/missing/subtopics', {
      headers: { Authorization: `Bearer ${await adminToken()}` },
    });

    expect(res.status).toBe(404);
    expect(subtopicsFindMany).not.toHaveBeenCalled();
  });

  it('pagina los subtemas de una materia válida', async () => {
    const res = await adminBlogsApp.request('/s1/subtopics?page=2&limit=2', {
      headers: { Authorization: `Bearer ${await adminToken()}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: unknown[];
      total: number;
      page: number;
      totalPages: number;
    };
    expect(body).toMatchObject({ total: 3, page: 2, totalPages: 2 });
    expect(body.data).toHaveLength(2);
    expect(subtopicsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2, offset: 2 }),
    );
  });
});

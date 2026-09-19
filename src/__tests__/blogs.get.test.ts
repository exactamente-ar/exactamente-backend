import { describe, it, expect, mock } from 'bun:test';
import { signToken } from '@/services/auth.service';

const postRow = {
  id: 'p1',
  subjectId: 's1',
  subtopicId: 'st1',
  body: 'contenido del post',
  authority: 'visible',
  status: 'published',
  netScore: 5,
  authorId: 'u-other',
  createdAt: new Date(),
};

const commentRow = {
  id: 'c1',
  postId: 'p1',
  parentId: null,
  authorId: 'u-other',
  body: 'un comentario',
  authority: 'visible',
  status: 'published',
  netScore: 2,
  depth: 1,
  createdAt: new Date(),
  images: [],
};

// Votos del usuario u1: +1 en el post p1 y -1 en el comentario c1.
const votes = [
  { userId: 'u1', targetType: 'post', targetId: 'p1', value: 1 },
  { userId: 'u1', targetType: 'comment', targetId: 'c1', value: -1 },
];

const findPosts = mock((_query: unknown) =>
  Promise.resolve([
    {
      ...postRow,
      author: { displayName: 'Otro' },
      images: [],
      comments: [{ ...commentRow, author: { displayName: 'Otro' } }],
    },
  ]),
);

mock.module('@/db', () => ({
  db: {
    query: {
      subjects: {
        findFirst: mock(() => Promise.resolve({ id: 's1' })),
      },
      blogSubtopics: {
        findMany: mock(() => Promise.resolve([])),
      },
      blogPosts: {
        findMany: findPosts,
      },
      blogVotes: {
        findMany: mock(() => Promise.resolve(votes)),
      },
      blogImages: {
        findMany: mock(() => Promise.resolve([])),
      },
    },
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([{ count: 1 }])),
      })),
    })),
  },
}));

import blogsApp from '@/routes/blogs';

async function token() {
  return signToken({ sub: 'u1', role: 'user', facultyId: null });
}

describe('blogs — GET /:subjectId hidrata myVote', () => {
  it('devuelve el voto del usuario en posts y comentarios', async () => {
    const res = await blogsApp.request('/s1', {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { myVote: number; comments: { myVote: number }[] }[];
      total: number;
      page: number;
      totalPages: number;
    };
    expect(body.data[0].myVote).toBe(1);
    expect(body.data[0].comments[0].myVote).toBe(-1);
    expect({ total: body.total, page: body.page, totalPages: body.totalPages }).toEqual({
      total: 1,
      page: 1,
      totalPages: 1,
    });

    const query = findPosts.mock.calls.at(-1)?.[0] as {
      limit: number;
      offset: number;
      with: { comments: { limit: number } };
    };
    expect(query.limit).toBe(20);
    expect(query.offset).toBe(0);
    expect(query.with.comments.limit).toBe(100);
  });

  it('devuelve myVote 0 sin token', async () => {
    const res = await blogsApp.request('/s1');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { myVote: number; comments: { myVote: number }[] }[];
    };
    expect(body.data[0].myVote).toBe(0);
    expect(body.data[0].comments[0].myVote).toBe(0);
  });
});

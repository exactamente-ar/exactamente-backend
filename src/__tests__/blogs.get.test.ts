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
};

// Votos del usuario u1: +1 en el post p1 y -1 en el comentario c1.
const votes = [
  { userId: 'u1', targetType: 'post', targetId: 'p1', value: 1 },
  { userId: 'u1', targetType: 'comment', targetId: 'c1', value: -1 },
];

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
        findMany: mock(() =>
          Promise.resolve([
            {
              ...postRow,
              author: { displayName: 'Otro' },
              images: [],
              comments: [{ ...commentRow, author: { displayName: 'Otro' } }],
            },
          ]),
        ),
      },
      blogVotes: {
        findMany: mock(() => Promise.resolve(votes)),
      },
    },
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
      posts: { myVote: number; comments: { myVote: number }[] }[];
    };
    expect(body.posts[0].myVote).toBe(1);
    expect(body.posts[0].comments[0].myVote).toBe(-1);
  });

  it('devuelve myVote 0 sin token', async () => {
    const res = await blogsApp.request('/s1');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      posts: { myVote: number; comments: { myVote: number }[] }[];
    };
    expect(body.posts[0].myVote).toBe(0);
    expect(body.posts[0].comments[0].myVote).toBe(0);
  });
});

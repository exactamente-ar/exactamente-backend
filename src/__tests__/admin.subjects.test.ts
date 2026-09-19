import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { blogSubtopics, subjects } from '@/db/schema';
import { signToken } from '@/services/auth.service';

type InsertedRow = { table: unknown; values: Record<string, unknown> };
const inserted: InsertedRow[] = [];

function makeInsert(table: unknown) {
  return {
    values: (values: Record<string, unknown>) => {
      inserted.push({ table, values });
      return { returning: () => Promise.resolve([values]) };
    },
  };
}

mock.module('@/db', () => ({
  db: {
    // Camino sin transacción (código viejo) y con transacción (fix): el test
    // vale para ambos y lo que se asserta es QUÉ se inserta.
    insert: (table: unknown) => makeInsert(table),
    transaction: (fn: (tx: { insert: typeof makeInsert }) => Promise<unknown>) =>
      fn({ insert: makeInsert }),
  },
}));

import adminSubjectsApp from '@/routes/admin/subjects';

async function token() {
  return signToken({ sub: 'u1', role: 'admin', facultyId: null });
}

describe('admin/subjects — POST /', () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it('crea la materia con su "Subtema general" de blog (FR-2)', async () => {
    const res = await adminSubjectsApp.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({
        facultyId: 'f1',
        title: 'Análisis Matemático',
        year: 1,
        quadmester: 1,
      }),
    });
    expect(res.status).toBe(201);

    const subjectInsert = inserted.find((r) => r.table === subjects);
    const subtopicInsert = inserted.find((r) => r.table === blogSubtopics);

    expect(subjectInsert).toBeDefined();
    expect(subtopicInsert).toBeDefined();
    expect(subtopicInsert!.values).toMatchObject({
      subjectId: subjectInsert!.values.id,
      name: 'General',
      slug: 'general',
      isDefault: true,
    });
  });
});

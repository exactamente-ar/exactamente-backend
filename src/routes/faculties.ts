import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { faculties } from '@/db/schema';

const app = new Hono();

app.get('/', async (c) => {
  const universityId = c.req.query('universityId');

  const data = await db.query.faculties.findMany({
    where: universityId ? eq(faculties.universityId, universityId) : undefined,
    orderBy: (f, { asc }) => [asc(f.name)],
  });

  return c.json({ data });
});

export default app;

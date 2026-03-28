import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { careers } from '@/db/schema';

const app = new Hono();

app.get('/', async (c) => {
  const facultyId = c.req.query('facultyId');

  const data = await db.query.careers.findMany({
    where: facultyId ? eq(careers.facultyId, facultyId) : undefined,
    orderBy: (t, { asc }) => [asc(t.name)],
  });

  return c.json({ data });
});

export default app;

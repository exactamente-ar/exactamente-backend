import { Hono } from 'hono';
import { db } from '@/db';

const app = new Hono();

app.get('/', async (c) => {
  const data = await db.query.universities.findMany({
    orderBy: (u, { asc }) => [asc(u.name)],
  });
  return c.json({ data });
});

export default app;

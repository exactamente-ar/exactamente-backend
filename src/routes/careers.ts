import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { careers } from '@/db/schema';

const app = new Hono();

const careersQuerySchema = z.object({
  facultyId: z.string().optional(),
});

app.get('/', zValidator('query', careersQuerySchema), async (c) => {
  const { facultyId } = c.req.valid('query');

  const data = await db.query.careers.findMany({
    where: facultyId ? eq(careers.facultyId, facultyId) : undefined,
    orderBy: (t, { asc }) => [asc(t.name)],
  });

  return c.json({ data });
});

export default app;

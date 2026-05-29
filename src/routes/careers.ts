import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { careers } from '@/db/schema';
import { rateLimit } from '@/middleware/rateLimit';

const app = new Hono();

const publicReadLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 }); // 100 req/min

const careersQuerySchema = z.object({
  facultyId: z.string().optional(),
});

app.get('/', publicReadLimit, zValidator('query', careersQuerySchema), async (c) => {
  const { facultyId } = c.req.valid('query');

  const data = await db.query.careers.findMany({
    where: facultyId ? eq(careers.facultyId, facultyId) : undefined,
    orderBy: (t, { asc }) => [asc(t.name)],
  });

  return c.json({ data });
});

export default app;

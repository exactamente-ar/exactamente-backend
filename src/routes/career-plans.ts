import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { careerPlans } from '@/db/schema';

const app = new Hono();

const querySchema = z.object({
  careerId: z.string(),
});

app.get('/', zValidator('query', querySchema), async (c) => {
  const { careerId } = c.req.valid('query');

  const data = await db
    .select({
      id: careerPlans.id,
      careerId: careerPlans.careerId,
      name: careerPlans.name,
      year: careerPlans.year,
    })
    .from(careerPlans)
    .where(eq(careerPlans.careerId, careerId))
    .orderBy(careerPlans.year);

  return c.json({ data });
});

export default app;

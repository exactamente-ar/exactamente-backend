import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { careerPlans } from '@/db/schema';
import { CareerPlanListSchema } from '@/schemas';
import { json } from '@/openapi/helpers';

const app = new Hono();

const querySchema = z.object({
  careerId: z.string(),
});

app.get(
  '/',
  describeRoute({
    tags: ['Catálogo'],
    summary: 'Listar planes de estudio',
    description: 'Sin paginación: devuelve todos los planes en `data`.',
    responses: { 200: json(CareerPlanListSchema, 'Planes, filtrables por careerId') },
  }),
  zValidator('query', querySchema),
  async (c) => {
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
  },
);

export default app;

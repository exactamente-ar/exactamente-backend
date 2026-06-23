import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, ilike, or, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { subjectGroups, subjectGroupMembers, subjects } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// ─── GET / — listar grupos (paginado, con búsqueda) ──────────────────────────

const listSchema = z.object({
  search: z.string().optional(),
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { search, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  const conditions = [];
  if (search) {
    conditions.push(ilike(subjectGroups.name, `%${search}%`));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select({
      id:          subjectGroups.id,
      name:        subjectGroups.name,
      description: subjectGroups.description,
      memberCount: sql<number>`count(${subjectGroupMembers.id})::int`,
      createdAt:   subjectGroups.createdAt,
      updatedAt:   subjectGroups.updatedAt,
    })
    .from(subjectGroups)
    .leftJoin(subjectGroupMembers, eq(subjectGroupMembers.groupId, subjectGroups.id))
    .where(whereClause)
    .groupBy(subjectGroups.id)
    .orderBy(subjectGroups.name)
    .limit(safeLimit)
    .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(subjectGroups).where(whereClause),
  ]);

  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// ─── POST / — crear grupo ────────────────────────────────────────────────────

const createSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().default(''),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const data = c.req.valid('json');
  const id = crypto.randomUUID();
  const [group] = await db.insert(subjectGroups).values({
    id,
    name:        data.name,
    description: data.description,
  }).returning();
  return c.json(group, 201);
});

// ─── GET /:id — obtener grupo con miembros ───────────────────────────────────

app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const group = await db.query.subjectGroups.findFirst({
    where: eq(subjectGroups.id, id),
    with: {
      members: {
        with: {
          subject: {
            columns: {
              id:    true,
              title: true,
              slug:  true,
            },
          },
        },
        orderBy: (m, { asc }) => [asc(m.sortOrder), asc(m.createdAt)],
      },
    },
  });
  if (!group) return c.json({ error: 'Grupo no encontrado' }, 404);

  return c.json({
    ...group,
    members: group.members.map(m => ({
      id:        m.id,
      subjectId: m.subject.id,
      title:     m.subject.title,
      slug:      m.subject.slug,
      sortOrder: m.sortOrder,
    })),
  });
});

// ─── PUT /:id — editar grupo ─────────────────────────────────────────────────

const updateSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

app.put('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined)        updates.name        = data.name;
  if (data.description !== undefined) updates.description = data.description;

  const [group] = await db.update(subjectGroups)
    .set(updates)
    .where(eq(subjectGroups.id, id))
    .returning();
  if (!group) return c.json({ error: 'Grupo no encontrado' }, 404);
  return c.json(group);
});

// ─── DELETE /:id — eliminar grupo (cascade members) ──────────────────────────

app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [group] = await db.delete(subjectGroups)
    .where(eq(subjectGroups.id, id))
    .returning();
  if (!group) return c.json({ error: 'Grupo no encontrado' }, 404);
  return new Response(null, { status: 204 });
});

// ─── POST /:id/members — agregar member ──────────────────────────────────────

const addMemberSchema = z.object({
  subjectId: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
});

app.post('/:id/members', ...adminGuard, zValidator('json', addMemberSchema), async (c) => {
  const groupId = c.req.param('id');
  const { subjectId, sortOrder } = c.req.valid('json');

  // verificar que el grupo existe
  const group = await db.query.subjectGroups.findFirst({
    where: eq(subjectGroups.id, groupId),
  });
  if (!group) return c.json({ error: 'Grupo no encontrado' }, 404);

  // verificar que la materia existe
  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, subjectId),
  });
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

  // verificar que no esté duplicada
  const existing = await db.query.subjectGroupMembers.findFirst({
    where: and(
      eq(subjectGroupMembers.groupId, groupId),
      eq(subjectGroupMembers.subjectId, subjectId),
    ),
  });
  if (existing) return c.json({ error: 'La materia ya pertenece a este grupo' }, 409);

  const memberId = crypto.randomUUID();
  const [member] = await db.insert(subjectGroupMembers).values({
    id:        memberId,
    groupId,
    subjectId,
    sortOrder,
  }).returning();

  return c.json(member, 201);
});

// ─── DELETE /:id/members/:memberId — quitar member ───────────────────────────

app.delete('/:id/members/:memberId', ...adminGuard, async (c) => {
  const groupId = c.req.param('id');
  const memberId = c.req.param('memberId');

  const [member] = await db.delete(subjectGroupMembers)
    .where(and(
      eq(subjectGroupMembers.id, memberId),
      eq(subjectGroupMembers.groupId, groupId),
    ))
    .returning();
  if (!member) return c.json({ error: 'Miembro no encontrado' }, 404);
  return new Response(null, { status: 204 });
});

export default app;

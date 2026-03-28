import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { hashPassword, verifyPassword, signToken, toPublicUser } from '@/services/auth.service';
import { registerSchema, loginSchema } from '@/validators/auth.validators';
import { verifyToken } from '@/middleware/auth';
import type { AppContext } from '@/types';

const auth = new Hono<AppContext>();

auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, displayName } = c.req.valid('json');

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return c.json({ error: 'Email ya registrado' }, 409);

  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();

  const [user] = await db.insert(users).values({
    id,
    email,
    passwordHash,
    displayName,
    role: 'user',
  }).returning();

  const token = await signToken({
    sub: user.id,
    role: user.role,
    facultyId: user.adminFacultyId ?? null,
  });

  return c.json({ user: toPublicUser(user), token }, 201);
});

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'Credenciales inválidas' }, 401);
  }

  const token = await signToken({
    sub: user.id,
    role: user.role,
    facultyId: user.adminFacultyId ?? null,
  });

  return c.json({ user: toPublicUser(user), token });
});

auth.get('/me', verifyToken, async (c) => {
  const { sub } = c.get('user');

  const user = await db.query.users.findFirst({
    where: eq(users.id, sub),
  });

  if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);

  return c.json({ user: toPublicUser(user) });
});

export default auth;

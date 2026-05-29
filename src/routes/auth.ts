import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, or } from 'drizzle-orm';
import { env } from '@/env';
import { db } from '@/db';
import { users } from '@/db/schema';
import { hashPassword, verifyPassword, signToken, toPublicUser, getGoogleAuthUrl, getGoogleUserInfo } from '@/services/auth.service';
import { registerSchema, loginSchema } from '@/validators/auth.validators';
import { verifyToken } from '@/middleware/auth';
import { rateLimit } from '@/middleware/rateLimit';
import type { AppContext } from '@/types';

const loginRateLimit    = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000 });  // 10 / 15 min
const registerRateLimit = rateLimit({ limit: 5,  windowMs: 60 * 60 * 1000 });  // 5 / 1 hora
const oauthRateLimit    = rateLimit({ limit: 20, windowMs: 15 * 60 * 1000 }); // 20 / 15 min

// In-memory store for OAuth state tokens (TTL 10 min)
const oauthStateStore = new Map<string, number>(); // state → expiresAt

// In-memory store for one-time OAuth codes (TTL 60s)
const oauthCodeStore = new Map<string, { token: string; expiresAt: number }>();

function storeOneTimeCode(token: string): string {
  const code = crypto.randomUUID();
  oauthCodeStore.set(code, { token, expiresAt: Date.now() + 60 * 1000 });
  return code;
}

function consumeOneTimeCode(code: string): string | null {
  const entry = oauthCodeStore.get(code);
  if (!entry || Date.now() > entry.expiresAt) return null;
  oauthCodeStore.delete(code);
  return entry.token;
}

function generateOAuthState(): string {
  const state = crypto.randomUUID();
  oauthStateStore.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}

function validateAndConsumeState(state: string): boolean {
  const expiresAt = oauthStateStore.get(state);
  if (!expiresAt || Date.now() > expiresAt) return false;
  oauthStateStore.delete(state); // one-time use
  return true;
}

const auth = new Hono<AppContext>();

auth.post('/register', registerRateLimit, zValidator('json', registerSchema), async (c) => {
  const { email, password, displayName } = c.req.valid('json');

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return c.json({ message: 'Si el email no estaba registrado, recibirás un email de confirmación.' }, 201);
  }

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

auth.post('/login', loginRateLimit, zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
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

auth.get('/google', oauthRateLimit, (c) => {
  const state = generateOAuthState();
  return c.redirect(getGoogleAuthUrl(state));
});

auth.get('/google/callback', oauthRateLimit, async (c) => {
  const code  = c.req.query('code');
  const error = c.req.query('error');
  const state = c.req.query('state');

  const frontendUrl = env.CORS_ORIGIN.split(',')[0].trim();

  if (error || !code || !state || !validateAndConsumeState(state)) {
    return c.redirect(`${frontendUrl}/login?error=oauth_denied`);
  }

  try {
    const { googleId, email, displayName } = await getGoogleUserInfo(code);

    let user = await db.query.users.findFirst({
      where: or(eq(users.googleId, googleId), eq(users.email, email)),
    });

    if (!user) {
      const id = crypto.randomUUID();
      [user] = await db.insert(users).values({
        id,
        email,
        displayName,
        googleId,
        passwordHash: null,
        role: 'user',
        emailVerified: true,
      }).returning();
    } else if (!user.googleId) {
      [user] = await db.update(users)
        .set({ googleId, emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
    }

    const token = await signToken({
      sub:       user.id,
      role:      user.role,
      facultyId: user.adminFacultyId ?? null,
    });

    const oauthCode = storeOneTimeCode(token);
    return c.redirect(`${frontendUrl}/auth/callback?code=${oauthCode}`);
  } catch {
    return c.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
});

auth.post('/exchange', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.code || typeof body.code !== 'string') {
    return c.json({ error: 'Código requerido' }, 400);
  }

  const token = consumeOneTimeCode(body.code);
  if (!token) {
    return c.json({ error: 'Código inválido o expirado' }, 401);
  }

  return c.json({ token });
});

export default auth;

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { eq, or } from 'drizzle-orm';
import { env } from '@/env';
import { db } from '@/db';
import { users } from '@/db/schema';
import {
  hashPassword,
  verifyPassword,
  signToken,
  toPublicUser,
  getGoogleAuthUrl,
  getGoogleUserInfo,
} from '@/services/auth.service';
import { registerSchema, loginSchema } from '@/validators/auth.validators';
import { verifyToken } from '@/middleware/auth';
import { rateLimit } from '@/middleware/rateLimit';
import type { AppContext } from '@/types';
import { AuthResponseSchema, MeResponseSchema, TokenResponseSchema } from '@/schemas';
import { json, errors, bearerAuth } from '@/openapi/helpers';

const loginRateLimit = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000 }); // 10 / 15 min
const registerRateLimit = rateLimit({ limit: 5, windowMs: 60 * 60 * 1000 }); // 5 / 1 hora
const oauthRateLimit = rateLimit({ limit: 20, windowMs: 15 * 60 * 1000 }); // 20 / 15 min

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

auth.post(
  '/register',
  describeRoute({
    tags: ['Auth'],
    summary: 'Registrar un usuario',
    description: 'Los registros nuevos siempre reciben rol `user`. Límite: 5 por hora por IP.',
    responses: {
      201: json(AuthResponseSchema, 'Usuario creado con su token'),
      ...errors(400, 409, 429),
    },
  }),
  registerRateLimit,
  zValidator('json', registerSchema),
  async (c) => {
    const { email, password, displayName } = c.req.valid('json');

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existing) {
      return c.json(
        { message: 'Si el email no estaba registrado, recibirás un email de confirmación.' },
        201,
      );
    }

    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();

    const [user] = await db
      .insert(users)
      .values({
        id,
        email,
        passwordHash,
        displayName,
        role: 'user',
      })
      .returning();

    const token = await signToken({
      sub: user.id,
      role: user.role,
      facultyId: user.adminFacultyId ?? null,
    });

    return c.json({ user: toPublicUser(user), token }, 201);
  },
);

auth.post(
  '/login',
  describeRoute({
    tags: ['Auth'],
    summary: 'Iniciar sesión',
    description:
      'Rechaza con 401 a los usuarios creados vía Google, que no tienen contraseña. Límite: 10 cada 15 min por IP.',
    responses: { 200: json(AuthResponseSchema, 'Sesión iniciada'), ...errors(400, 401, 429) },
  }),
  loginRateLimit,
  zValidator('json', loginSchema),
  async (c) => {
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
  },
);

auth.get(
  '/me',
  describeRoute({
    tags: ['Auth'],
    summary: 'Usuario autenticado actual',
    security: bearerAuth,
    responses: { 200: json(MeResponseSchema, 'Usuario de la sesión'), ...errors(401, 404) },
  }),
  verifyToken,
  async (c) => {
    const { sub } = c.get('user');

    const user = await db.query.users.findFirst({
      where: eq(users.id, sub),
    });

    if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);

    return c.json({ user: toPublicUser(user) });
  },
);

auth.get(
  '/google',
  describeRoute({
    tags: ['Auth'],
    summary: 'Iniciar el flujo OAuth de Google',
    responses: { 302: { description: 'Redirige al consent screen de Google' }, ...errors(429) },
  }),
  oauthRateLimit,
  (c) => {
    const state = generateOAuthState();
    return c.redirect(getGoogleAuthUrl(state));
  },
);

auth.get(
  '/google/callback',
  describeRoute({
    tags: ['Auth'],
    summary: 'Callback de Google',
    description:
      'Canjea el code por un JWT propio y redirige al frontend con un código de un solo uso. Ante error redirige a `/upload?error=...`.',
    responses: { 302: { description: 'Redirige al frontend' }, ...errors(429) },
  }),
  oauthRateLimit,
  async (c) => {
    const code = c.req.query('code');
    const error = c.req.query('error');
    const state = c.req.query('state');

    const frontendUrl = env.CORS_ORIGIN.split(',')[0].trim();

    if (error || !code || !state || !validateAndConsumeState(state)) {
      return c.redirect(`${frontendUrl}/upload?error=oauth_denied`);
    }

    try {
      const { googleId, email, displayName, photoUrl } = await getGoogleUserInfo(code);

      let user = await db.query.users.findFirst({
        where: or(eq(users.googleId, googleId), eq(users.email, email)),
      });

      if (!user) {
        const id = crypto.randomUUID();
        [user] = await db
          .insert(users)
          .values({
            id,
            email,
            displayName,
            photoUrl,
            googleId,
            passwordHash: null,
            role: 'user',
            emailVerified: true,
          })
          .returning();
      } else if (!user.googleId) {
        [user] = await db
          .update(users)
          .set({ googleId, photoUrl, emailVerified: true, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
      } else {
        [user] = await db
          .update(users)
          .set({ photoUrl, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
      }

      const token = await signToken({
        sub: user.id,
        role: user.role,
        facultyId: user.adminFacultyId ?? null,
      });

      const oauthCode = storeOneTimeCode(token);
      return c.redirect(`${frontendUrl}/auth/callback?code=${oauthCode}`);
    } catch (err) {
      console.error('[oauth/callback] error:', err);
      return c.redirect(`${frontendUrl}/upload?error=oauth_failed`);
    }
  },
);

auth.post(
  '/exchange',
  describeRoute({
    tags: ['Auth'],
    summary: 'Canjear el código de un solo uso por un JWT',
    description: 'Cierra el flujo OAuth sin exponer el JWT en la URL.',
    responses: { 200: json(TokenResponseSchema, 'JWT'), ...errors(400, 401) },
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.code || typeof body.code !== 'string') {
      return c.json({ error: 'Código requerido' }, 400);
    }

    const token = consumeOneTimeCode(body.code);
    if (!token) {
      return c.json({ error: 'Código inválido o expirado' }, 401);
    }

    return c.json({ token });
  },
);

export default auth;

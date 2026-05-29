import { sign, verify } from 'hono/jwt';
import type { JwtPayload, PublicUser } from '@/types';
import type { users } from '@/db/schema';
import { env } from '@/env';

export function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export async function signToken(
  payload: Pick<JwtPayload, 'sub' | 'role' | 'facultyId'>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { ...payload, iat: now, exp: now + 60 * 60 * 24 },
    env.JWT_SECRET,
    'HS256',
  );
}

export async function verifyTokenPayload(token: string): Promise<JwtPayload> {
  return verify(token, env.JWT_SECRET, 'HS256') as Promise<JwtPayload>;
}

export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function getGoogleUserInfo(
  code: string,
): Promise<{ googleId: string; email: string; displayName: string }> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  env.GOOGLE_REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) throw new Error('google_token_exchange_failed');

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) throw new Error('google_userinfo_failed');

  const { id, email, name } = (await userRes.json()) as {
    id: string;
    email: string;
    name: string;
  };

  return { googleId: id, email, displayName: name };
}

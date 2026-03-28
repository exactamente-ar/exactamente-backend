import { sign, verify } from 'hono/jwt';
import type { JwtPayload } from '@/types';

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
    { ...payload, iat: now, exp: now + 60 * 60 * 24 * 7 },
    process.env.JWT_SECRET!,
    'HS256',
  );
}

export async function verifyTokenPayload(token: string): Promise<JwtPayload> {
  return verify(token, process.env.JWT_SECRET!, 'HS256') as Promise<JwtPayload>;
}

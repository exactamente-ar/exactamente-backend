import { describe, it, expect, beforeAll } from 'bun:test';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-exactly-32-chars!!';
});

import { hashPassword, verifyPassword, signToken, verifyTokenPayload } from '@/services/auth.service';

describe('hashPassword / verifyPassword', () => {
  it('produce un hash diferente a la contraseña original', async () => {
    const hash = await hashPassword('mipassword123');
    expect(hash).not.toBe('mipassword123');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifica la contraseña correcta', async () => {
    const hash = await hashPassword('correcta');
    expect(await verifyPassword('correcta', hash)).toBe(true);
  });

  it('rechaza la contraseña incorrecta', async () => {
    const hash = await hashPassword('correcta');
    expect(await verifyPassword('incorrecta', hash)).toBe(false);
  });
});

describe('signToken / verifyTokenPayload', () => {
  it('firma y verifica un token correctamente', async () => {
    const token = await signToken({ sub: 'user-abc', role: 'user', facultyId: null });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const payload = await verifyTokenPayload(token);
    expect(payload.sub).toBe('user-abc');
    expect(payload.role).toBe('user');
    expect(payload.facultyId).toBeNull();
  });

  it('firma token de admin con facultyId', async () => {
    const token = await signToken({ sub: 'admin-1', role: 'admin', facultyId: 'FACET' });
    const payload = await verifyTokenPayload(token);
    expect(payload.role).toBe('admin');
    expect(payload.facultyId).toBe('FACET');
  });
});

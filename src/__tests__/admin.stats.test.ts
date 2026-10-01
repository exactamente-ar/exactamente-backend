import { test, expect, describe } from 'bun:test';
import adminStatsApp from '@/routes/admin/stats';
import { signToken } from '@/services/auth.service';

/**
 * Qué se puede testear acá y qué no.
 *
 * La suite no tiene base: drizzle conecta lazy y no hay service container en CI.
 * O sea que ningún test puede llegar al handler de estos endpoints — el primer
 * `await db…` explota.
 *
 * Lo que sí se ejercita de verdad, porque corre ANTES del handler:
 *   - los guards (`verifyToken` + `requireRole`), que cortan en 401/403
 *   - `zValidator('query')`, que corta en 400
 *
 * Esa segunda tanda es la que importa: son los límites que evitan que alguien
 * pida `days=100000` y se lleve puesta la base. La aritmética de buckets tiene
 * su propia cobertura en `utils.test.ts` (`resolveRange`), y el SQL se verifica
 * a mano contra Docker — ver el checklist en la descripción del PR.
 */

const PATHS = ['/activity', '/rankings', '/moderation'] as const;

async function req(
  path: string,
  opts: { authRole?: 'user' | 'admin' | null } = {},
): Promise<Response> {
  const { authRole = null } = opts;
  const headers: Record<string, string> = {};
  if (authRole) {
    headers['Authorization'] =
      `Bearer ${await signToken({ sub: 'u1', role: authRole, facultyId: null })}`;
  }
  return adminStatsApp.request(path, { headers });
}

describe('admin/stats — guards', () => {
  for (const path of PATHS) {
    test(`GET ${path} devuelve 401 sin token`, async () => {
      expect((await req(path)).status).toBe(401);
    });

    test(`GET ${path} devuelve 403 con rol user`, async () => {
      expect((await req(path, { authRole: 'user' })).status).toBe(403);
    });
  }
});

describe('admin/stats — validación de query', () => {
  // Con token admin el guard pasa y zValidator es lo siguiente en la cadena.
  const asAdmin = (path: string) => req(path, { authRole: 'admin' });

  test('rechaza una granularidad que no está en el enum', async () => {
    expect((await asAdmin('/activity?granularity=month')).status).toBe(400);
  });

  test('rechaza days=0: la ventana mínima es un día', async () => {
    expect((await asAdmin('/activity?days=0')).status).toBe(400);
  });

  test('rechaza days por encima del año', async () => {
    expect((await asAdmin('/activity?days=400')).status).toBe(400);
  });

  test('rechaza days no numérico', async () => {
    expect((await asAdmin('/activity?days=treinta')).status).toBe(400);
  });

  test('rechaza days fraccionario', async () => {
    expect((await asAdmin('/moderation?days=7.5')).status).toBe(400);
  });

  test('rechaza un limit desmedido en rankings', async () => {
    expect((await asAdmin('/rankings?limit=999')).status).toBe(400);
  });

  test('rechaza limit=0', async () => {
    expect((await asAdmin('/rankings?limit=0')).status).toBe(400);
  });
});

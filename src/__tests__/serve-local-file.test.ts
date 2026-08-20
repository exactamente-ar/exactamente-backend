import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import app from '@/app';
import { env } from '@/env';

// La ruta /local-files/* sirve los objetos del storage local sin Content-Type,
// pero securityHeaders agrega X-Content-Type-Options: nosniff a todo. Sin un
// Content-Type explícito el navegador se niega a renderizar imágenes y PDFs:
// por eso el servidor tiene que declararlo a partir de la extensión.

const dir = `serve-local-file-test-${crypto.randomUUID()}`;

beforeAll(async () => {
  await mkdir(path.join(env.STORAGE_PATH, dir), { recursive: true });
});

afterAll(async () => {
  await rm(path.join(env.STORAGE_PATH, dir), { recursive: true, force: true });
});

describe('serveLocalFile — Content-Type', () => {
  test('sirve imágenes webp con image/webp', async () => {
    await writeFile(path.join(env.STORAGE_PATH, dir, 'foto.webp'), Buffer.from('RIFF0000WEBP'));

    const res = await app.request(`/local-files/${dir}/foto.webp`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
  });

  test('sirve pdfs con application/pdf', async () => {
    await writeFile(path.join(env.STORAGE_PATH, dir, 'doc.pdf'), Buffer.from('%PDF-1.7'));

    const res = await app.request(`/local-files/${dir}/doc.pdf`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  test('cae a application/octet-stream para extensiones desconocidas', async () => {
    await writeFile(path.join(env.STORAGE_PATH, dir, 'x.bin'), Buffer.from('data'));

    const res = await app.request(`/local-files/${dir}/x.bin`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  });
});

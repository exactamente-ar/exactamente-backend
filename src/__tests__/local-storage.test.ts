import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '@/services/storage/local.provider';

describe('LocalStorageProvider', () => {
  let dir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'exactamente-storage-'));
    provider = new LocalStorageProvider(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('uploadFile escribe el archivo en el filesystem', async () => {
    await provider.uploadFile('pending/uuid.pdf', Buffer.from('%PDF-1.7'), 'application/pdf');

    const stored = await readFile(path.join(dir, 'pending/uuid.pdf'));
    expect(stored.toString()).toBe('%PDF-1.7');
  });

  test('moveFile mueve el objeto y borra el origen', async () => {
    const src = 'pending/uuid.pdf';
    const dest = 'published/dest.pdf';
    await provider.uploadFile(src, Buffer.from('contenido'), 'application/pdf');

    await provider.moveFile(src, dest);

    expect(await readFile(path.join(dir, dest))).toBeDefined();
    const srcExists = await readdir(path.join(dir, 'pending')).catch(() => []);
    expect(srcExists).toHaveLength(0);
  });

  test('deleteFile borra el objeto sin fallar si no existe', async () => {
    await provider.uploadFile('pending/uuid.pdf', Buffer.from('x'), 'application/pdf');

    await provider.deleteFile('pending/uuid.pdf');
    await provider.deleteFile('no-existe.pdf');

    const entries = await readdir(path.join(dir, 'pending'));
    expect(entries).toHaveLength(0);
  });

  test('getPublicUrl y getSignedUrl apuntan al server local', async () => {
    const key = 'pending/uuid.pdf';
    const expected = `http://localhost:${process.env.PORT ?? 3000}/local-files/${key}`;

    expect(provider.getPublicUrl(key)).toBe(expected);
    expect(await provider.getSignedUrl(key)).toBe(expected);
  });

  test('uploadFile rechaza keys que escapan del root', async () => {
    expect(
      provider.uploadFile('../fuera.pdf', Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow('fuera del storage');
  });
});

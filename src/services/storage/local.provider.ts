import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/env';
import type { StorageService } from './types';

/**
 * Storage local — para desarrollo y tests, cuando no hay credenciales reales de
 * R2. Persiste los objetos en el filesystem bajo `STORAGE_PATH` y los sirve por
 * HTTP desde `/local-files/*` (montada en app.ts solo con STORAGE_PROVIDER=local).
 *
 * Imita el contrato de StorageService, no el comportamiento de R2: no hay
 * firmado de URLs ni CDN. Las URLs pendientes requieren que el cliente mande
 * su Bearer JWT a `/local-files/*`; las publicadas admiten acceso anónimo.
 */
export class LocalStorageProvider implements StorageService {
  private root: string;
  private origin: string;

  /** `root` y `origin` son opcionales para tests. */
  constructor(root?: string, origin = env.API_ORIGIN ?? new URL(env.GOOGLE_REDIRECT_URI).origin) {
    this.root = path.resolve(root ?? env.STORAGE_PATH);
    this.origin = new URL(origin).origin;
  }

  private resolveKey(key: string): string {
    const resolved = path.resolve(this.root, key);
    // `root + sep`, no `startsWith(root)`: un prefijo de string dejaría pasar
    // una key que resuelva a un hermano (`/storage-secrets/x` con root `/storage`).
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`Key fuera del storage local: ${key}`);
    }
    return resolved;
  }

  async uploadFile(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  async moveFile(sourceKey: string, destKey: string): Promise<void> {
    const src = this.resolveKey(sourceKey);
    const dest = this.resolveKey(destKey);
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(src, dest);
  }

  async deleteFile(key: string): Promise<void> {
    await unlink(this.resolveKey(key)).catch(() => {});
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.resourceUrl(key);
  }

  getPublicUrl(key: string): string {
    if (key.startsWith('pending/')) {
      throw new Error('Los objetos pendientes no tienen una URL pública');
    }
    return this.resourceUrl(key);
  }

  private resourceUrl(key: string): string {
    return new URL(`/local-files/${key}`, this.origin).toString();
  }
}

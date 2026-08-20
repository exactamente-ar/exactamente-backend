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
 * firmado de URLs ni CDN. `getSignedUrl` y `getPublicUrl` devuelven la URL del
 * server local; en descargas el `Content-Disposition` con nombre bonito se
 * pierde y el navegador guarda el archivo con el nombre de la key.
 */
export class LocalStorageProvider implements StorageService {
  private root: string;

  /** `root` es opcional para tests; sin él usa STORAGE_PATH del env. */
  constructor(root?: string) {
    this.root = path.resolve(root ?? env.STORAGE_PATH);
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
    return this.publicUrl(key);
  }

  getPublicUrl(key: string): string {
    return this.publicUrl(key);
  }

  private publicUrl(key: string): string {
    return `http://localhost:${env.PORT}/local-files/${key}`;
  }
}

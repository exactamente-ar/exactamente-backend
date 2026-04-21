import { mkdir, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@/env';
import type { StorageProvider, StagingResult, PublishResult } from './types';

export class LocalStorageProvider implements StorageProvider {
  private stagingDir = join(env.STORAGE_PATH, 'staging');
  private publishedDir = join(env.STORAGE_PATH, 'published');

  async saveToStaging(file: File, resourceId: string): Promise<StagingResult> {
    const destDir = join(this.stagingDir, resourceId);
    await mkdir(destDir, { recursive: true });
    const destPath = join(destDir, file.name);
    await Bun.write(destPath, file);
    return {
      path: destPath,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    };
  }

  async publishFile(stagingPath: string, targetPath: string, fileName: string): Promise<PublishResult> {
    const destDir = join(this.publishedDir, targetPath);
    await mkdir(destDir, { recursive: true });
    const destPath = join(destDir, fileName);
    await rename(stagingPath, destPath);
    const fileId = join(targetPath, fileName);
    return {
      fileId,
      mimeType: 'application/octet-stream',
      size: Bun.file(destPath).size,
      previewUrl: this.getPreviewUrl(fileId),
      downloadUrl: this.getDownloadUrl(fileId),
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    const absPath = fileId.startsWith('/') ? fileId : join(this.publishedDir, fileId);
    await unlink(absPath).catch(() => {});
  }

  getPreviewUrl(fileId: string): string {
    return `http://localhost:${env.PORT}/files/${fileId}`;
  }

  getDownloadUrl(fileId: string): string {
    return `http://localhost:${env.PORT}/files/${fileId}`;
  }
}

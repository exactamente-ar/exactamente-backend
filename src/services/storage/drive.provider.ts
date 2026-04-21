import { buildPreviewUrl, buildDownloadUrl } from '@/utils/drive-urls';
import { LocalStorageProvider } from './local.provider';
import type { StorageProvider, StagingResult, PublishResult } from './types';

export class DriveStorageProvider implements StorageProvider {
  private local = new LocalStorageProvider();

  async saveToStaging(file: File, resourceId: string): Promise<StagingResult> {
    return this.local.saveToStaging(file, resourceId);
  }

  async publishFile(_stagingPath: string, _targetPath: string, _fileName: string): Promise<PublishResult> {
    throw new Error('DriveStorageProvider.publishFile: no implementado. Instalar @googleapis/drive primero.');
  }

  async deleteFile(_fileId: string): Promise<void> {
    throw new Error('DriveStorageProvider.deleteFile: no implementado.');
  }

  getPreviewUrl(fileId: string): string {
    return buildPreviewUrl(fileId);
  }

  getDownloadUrl(fileId: string): string {
    return buildDownloadUrl(fileId);
  }
}

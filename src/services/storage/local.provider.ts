import type { StorageProvider, StagingResult, PublishResult } from './types';

export class LocalStorageProvider implements StorageProvider {
  async stage(file: File, metadata?: Record<string, string>): Promise<StagingResult> {
    throw new Error('LocalStorageProvider.stage not yet implemented');
  }

  async publish(fileId: string, resourceId: number): Promise<PublishResult> {
    throw new Error('LocalStorageProvider.publish not yet implemented');
  }

  async delete(fileId: string): Promise<void> {
    throw new Error('LocalStorageProvider.delete not yet implemented');
  }
}

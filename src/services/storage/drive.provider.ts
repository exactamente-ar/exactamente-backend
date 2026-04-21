import type { StorageProvider, StagingResult, PublishResult } from './types';

export class DriveStorageProvider implements StorageProvider {
  async stage(file: File, metadata?: Record<string, string>): Promise<StagingResult> {
    throw new Error('DriveStorageProvider.stage not yet implemented');
  }

  async publish(fileId: string, resourceId: number): Promise<PublishResult> {
    throw new Error('DriveStorageProvider.publish not yet implemented');
  }

  async delete(fileId: string): Promise<void> {
    throw new Error('DriveStorageProvider.delete not yet implemented');
  }
}

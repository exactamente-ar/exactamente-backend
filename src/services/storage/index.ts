import { env } from '@/env';
import { LocalStorageProvider } from './local.provider';
import { DriveStorageProvider } from './drive.provider';
import type { StorageProvider } from './types';

export const storage: StorageProvider =
  env.STORAGE_PROVIDER === 'drive'
    ? new DriveStorageProvider()
    : new LocalStorageProvider();

export type { StorageProvider, StagingResult, PublishResult } from './types';

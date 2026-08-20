import { env } from '@/env';
import { LocalStorageProvider } from './local.provider';
import { R2StorageProvider } from './r2.provider';
import type { StorageService } from './types';

export const storage: StorageService =
  env.STORAGE_PROVIDER === 'local' ? new LocalStorageProvider() : new R2StorageProvider();

export type { StorageService } from './types';

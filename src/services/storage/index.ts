import { R2StorageProvider } from './r2.provider';
import type { StorageService } from './types';

export const storage: StorageService = new R2StorageProvider();

export type { StorageService } from './types';

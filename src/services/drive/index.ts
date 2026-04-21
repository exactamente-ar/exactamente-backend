import { join } from 'node:path';
import { env } from '@/env';
import { LocalDriveProvider } from './local.provider';
import { DriveApiProvider } from './drive.provider';
import type { DriveService } from './types';

function createDriveService(): DriveService {
  if (env.STORAGE_PROVIDER === 'drive') {
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.DRIVE_ROOT_FOLDER_ID) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON y DRIVE_ROOT_FOLDER_ID son requeridos cuando STORAGE_PROVIDER=drive',
      );
    }
    const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new DriveApiProvider(credentials);
  }
  return new LocalDriveProvider(join(env.STORAGE_PATH, 'drive'));
}

export const driveService: DriveService = createDriveService();
export type { DriveService, DriveNode } from './types';

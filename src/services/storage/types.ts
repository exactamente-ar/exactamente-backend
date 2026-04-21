export interface StagingResult {
  path: string;
  mimeType: string;
  size: number;
}

export interface PublishResult {
  fileId: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  downloadUrl: string;
}

export interface StorageProvider {
  saveToStaging(file: File, resourceId: string): Promise<StagingResult>;
  publishFile(stagingPath: string, targetPath: string, fileName: string): Promise<PublishResult>;
  deleteFile(fileId: string): Promise<void>;
  getPreviewUrl(fileId: string): string;
  getDownloadUrl(fileId: string): string;
}

export interface StagingResult {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface PublishResult {
  resourceId: number;
  fileId: string;
  url: string;
  message: string;
}

export interface StorageProvider {
  stage(file: File, metadata?: Record<string, string>): Promise<StagingResult>;
  publish(fileId: string, resourceId: number): Promise<PublishResult>;
  delete(fileId: string): Promise<void>;
}

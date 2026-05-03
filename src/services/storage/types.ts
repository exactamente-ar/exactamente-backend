export interface StorageService {
  uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  moveFile(sourceKey: string, destKey: string): Promise<void>;
  deleteFile(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  getPublicUrl(key: string): string;
}

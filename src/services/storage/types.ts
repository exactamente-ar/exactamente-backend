export interface StorageService {
  uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  moveFile(sourceKey: string, destKey: string): Promise<void>;
  deleteFile(key: string): Promise<void>;
  /**
   * URL temporal para leer un objeto.
   *
   * `downloadFilename` fuerza un `Content-Disposition: attachment` con ese
   * nombre. Sin él el navegador guarda el archivo con el nombre de la key, que
   * es un uuid — inútil para alguien que se baja diez parciales.
   */
  getSignedUrl(key: string, expiresIn?: number, downloadFilename?: string): Promise<string>;
  getPublicUrl(key: string): string;
}

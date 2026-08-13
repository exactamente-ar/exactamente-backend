import sharp from 'sharp';

/**
 * Pipeline de imágenes para posts del blog (AD-2 / addendum). Es un pipeline
 * propio: el de recursos es PDF-only y buffered, no sirve para fotos.
 *
 * Garantías acá:
 * - Whitelist de MIME (jpeg/png/webp).
 * - Tope de peso y de cantidad por post.
 * - Stripeo de metadata: una foto de celular anónima trae GPS, timestamp y
 *   device en el EXIF — de-anonimiza al autor. `sharp` re-encodifica aplicando
 *   la rotación y descarta toda la metadata.
 */

export const BLOG_IMAGE_MIME_WHITELIST = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB por imagen
export const BLOG_IMAGE_MAX_COUNT = 6;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isAllowedImageMime(mime: string): boolean {
  return (BLOG_IMAGE_MIME_WHITELIST as readonly string[]).includes(mime);
}

export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? 'bin';
}

export async function stripImageMetadata(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).rotate().toBuffer();
}

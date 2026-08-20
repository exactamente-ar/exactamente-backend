import sharp from 'sharp';
import { blogImages } from '@/db/schema';
import { storage } from '@/services/storage';

/**
 * Pipeline de adjuntos para posts y comentarios del blog (AD-2 / addendum). Es
 * un pipeline propio: el de recursos es PDF-only y buffered, no sirve para fotos.
 *
 * Garantías acá:
 * - Whitelist de MIME (jpeg/png/webp) + PDF.
 * - Tope de peso (por archivo y total), de cantidad y de píxeles por
 *   post/comentario.
 * - Stripeo de metadata: una foto de celular anónima trae GPS, timestamp y
 *   device en el EXIF — de-anonimiza al autor.
 * - Normalización de formato: toda imagen sale en WebP redimensionado a un tope
 *   de dimensión. Baja ancho de banda (egreso de R2) y almacenamiento. La
 *   calidad depende del input: lossy para fotos (JPEG), nearLossless para texto
 *   y diagramas (PNG o imágenes con alpha) — capturas de apuntes no pierden
 *   legibilidad. El `sharp` re-encodifica aplicando la rotación, descarta toda
 *   la metadata y encoge el lado mayor a `MAX_IMAGE_DIMENSION` sin agrandar.
 * - Los PDFs no se tocan: se suben tal cual a R2 (no hay re-encodificación
 *   posible) con su `application/pdf`.
 */

export const BLOG_IMAGE_MIME_WHITELIST = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB por imagen
export const PDF_MIME = 'application/pdf';
export const BLOG_PDF_MAX_BYTES = 20 * 1024 * 1024; // 20 MB por PDF
export const BLOG_ATTACHMENT_MAX_COUNT = 6;
/** Tope de peso sumando todos los adjuntos de un post/comentario. */
export const BLOG_ATTACHMENT_MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB

/** MIME de salida del pipeline: toda imagen se normaliza a WebP. */
export const OPTIMIZED_IMAGE_MIME = 'image/webp';
/** Tope del lado mayor en px; una imagen más grande se encoge, una más chica no se toca. */
export const MAX_IMAGE_DIMENSION = 2048;
/**
 * Tope de píxeles (ancho × alto) del input. `sharp` descomprime el original a
 * bitmap antes de redimensionar: 100 MP son ~300 MB de RAM en una máquina de
 * 4 GB. Este tope corta la bomba de descompresión antes de llegar ahí.
 */
export const MAX_IMAGE_PIXELS = 50_000_000; // 50 megapíxeles
const WEBP_QUALITY = 80;

/**
 * Error de entrada del usuario en el pipeline de adjuntos. Los handlers lo
 * convierten en un 400 (a diferencia de un error interno, que es 500). Cubre
 * imágenes corruptas/truncadas, no-imágenes, PDFs sin magic bytes y el tope de
 * píxeles.
 */
export class BlogImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlogImageError';
  }
}

/** Magic bytes de un PDF real (`%PDF-`). El `file.type` lo manda el cliente y no se puede confiar. */
const PDF_MAGIC = Buffer.from('%PDF-');

export function isPdfBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  );
}

export type BlogImageRow = typeof blogImages.$inferSelect;

export function isAllowedImageMime(mime: string): boolean {
  return (BLOG_IMAGE_MIME_WHITELIST as readonly string[]).includes(mime);
}

export function isPdfMime(mime: string): boolean {
  return mime === PDF_MIME;
}

/**
 * Decide si una imagen se comprime nearLossless en vez de lossy.
 *
 * JPEG nunca trae alpha y es foto → lossy. PNG es típicamente captura de
 * texto/diagrama → nearLossless. WebP es ambiguo: se decide por el canal alpha
 * (alpha presente ≈ texto/diagrama).
 */
export function isNearLosslessCandidate(inputMime: string, hasAlpha: boolean): boolean {
  return inputMime === 'image/png' || hasAlpha;
}

/**
 * Verdadero si `width × height` supera el tope de píxeles del pipeline. Se
 * extrae a función pura para poder testear el límite sin decodificar una
 * imagen gigante en los tests.
 */
export function exceedsPixelLimit(
  width: number,
  height: number,
  maxPixels = MAX_IMAGE_PIXELS,
): boolean {
  return width * height > maxPixels;
}

/**
 * Redimensiona, re-encodifica a WebP y descarta la metadata EXIF de una imagen.
 *
 * `.rotate()` aplica la orientación del EXIF antes de encoger, y como `sharp`
 * no re-agrega metadata salvo con `.withMetadata()`, el stripeo es implícito.
 * `fit: 'inside'` acota ambos lados (paisaje y retrato) y `withoutEnlargement`
 * evita que una imagen chica crezca en dimensiones. La calidad de salida sale
 * de `isNearLosslessCandidate`: nearLossless para texto, lossy para fotos.
 */
export async function optimizeImage(buffer: Buffer, inputMime: string): Promise<Buffer> {
  const { hasAlpha = false, width = 0, height = 0 } = await sharp(buffer).metadata();
  if (exceedsPixelLimit(width, height)) {
    throw new BlogImageError('La imagen supera el máximo de 50 megapíxeles');
  }
  const nearLossless = isNearLosslessCandidate(inputMime, hasAlpha);
  return sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp(nearLossless ? { nearLossless: true, quality: WEBP_QUALITY } : { quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * Valida cantidad, MIME y peso de los adjuntos de un post o comentario.
 * Devuelve `null` si todo está bien, o el mensaje de error para responder 400.
 * `noun` es el término para el mensaje de cantidad: "post" o "comentario".
 */
export function validateBlogImages(files: File[], noun: 'post' | 'comentario'): string | null {
  if (files.length > BLOG_ATTACHMENT_MAX_COUNT) {
    return `Máximo ${BLOG_ATTACHMENT_MAX_COUNT} archivos por ${noun}`;
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > BLOG_ATTACHMENT_MAX_TOTAL_BYTES) {
    return 'El peso total de los adjuntos no puede superar los 30MB';
  }
  for (const file of files) {
    if (isPdfMime(file.type)) {
      if (file.size > BLOG_PDF_MAX_BYTES) {
        return 'Cada PDF no puede superar los 20MB';
      }
      continue;
    }
    if (!isAllowedImageMime(file.type)) {
      return 'Solo se aceptan imágenes JPEG, PNG o WebP, o PDFs';
    }
    if (file.size > BLOG_IMAGE_MAX_BYTES) {
      return 'Cada imagen no puede superar los 5MB';
    }
  }
  return null;
}

/**
 * Sube los adjuntos a storage y devuelve las filas listas para insertar en
 * `blogImages`. Las imágenes se optimizan (resize + WebP) antes de subir; los
 * PDFs se suben tal cual. Las keys agrupan por entidad y las URLs públicas
 * salen de la clave.
 *
 * Extensión (`.webp`/`.pdf`), `mimeType` y `Content-Type` del upload (en R2)
 * derivan del formato de salida, nunca del MIME original del input: un JPEG
 * reconvertido a WebP servido con `Content-Type: image/jpeg` no abre.
 */
export async function uploadBlogImages(
  targetType: 'post' | 'comment',
  targetId: string,
  files: File[],
): Promise<BlogImageRow[]> {
  const rows: BlogImageRow[] = [];
  const prefix = targetType === 'post' ? 'blog-posts' : 'blog-comments';
  const uploadedKeys: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const original = Buffer.from(await file.arrayBuffer());
      const isPdf = isPdfMime(file.type);

      let output: Buffer;
      if (isPdf) {
        if (!isPdfBuffer(original)) {
          throw new BlogImageError('El archivo no es un PDF válido');
        }
        output = original;
      } else {
        try {
          output = await optimizeImage(original, file.type);
        } catch (e) {
          if (e instanceof BlogImageError) throw e;
          // `sharp` rechaza archivos truncados/corruptos o no-imagen.
          throw new BlogImageError('No se pudo procesar la imagen');
        }
      }

      const mimeType = isPdf ? PDF_MIME : OPTIMIZED_IMAGE_MIME;
      const ext = isPdf ? 'pdf' : 'webp';
      const imageId = crypto.randomUUID();
      const key = `${prefix}/${targetId}/${imageId}.${ext}`;
      await storage.uploadFile(key, output, mimeType);
      uploadedKeys.push(key);
      rows.push({
        id: imageId,
        targetType,
        targetId,
        r2Key: key,
        mimeType,
        position: i,
        createdAt: new Date(),
      });
    }
  } catch (e) {
    // Upload parcial (falló el archivo N de M): borrar lo ya subido para no
    // dejar objetos huérfanos en el bucket.
    await Promise.all(uploadedKeys.map((key) => storage.deleteFile(key).catch(() => {})));
    throw e;
  }

  return rows;
}

/**
 * Borra los objetos de storage de un set de filas `blogImages`. Es el cleanup
 * del caso en que el upload salió bien pero la transacción de DB que inserta
 * las filas falla después: sin esto, los objetos quedan huérfanos en R2.
 */
export async function deleteBlogImageObjects(rows: BlogImageRow[]): Promise<void> {
  await Promise.all(rows.map((row) => storage.deleteFile(row.r2Key).catch(() => {})));
}

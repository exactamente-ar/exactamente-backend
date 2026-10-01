/**
 * Arma un header `Content-Disposition` de descarga para un nombre arbitrario.
 *
 * Existe porque los títulos de los recursos son texto libre en español
 * ("Álgebra — Parcial 2 (Tema B)") y terminan dentro de un header HTTP. Sin
 * escapar, unas comillas o un salto de línea en el título rompen el header o
 * permiten inyectar otro.
 *
 * La clasificación se hace por code point y no con un literal de regex a
 * propósito: los rangos de caracteres de control en un regex son fáciles de
 * escribir mal y el error es invisible al leerlo.
 */

const SPACE = 0x20;
const DEL = 0x7f;

/** Los que Windows y POSIX no aceptan en un nombre de archivo. */
const FORBIDDEN_IN_FILENAME = '"\\/:*?<>|';

const MAX_LENGTH = 100;

/**
 * Un carácter de control rompe o inyecta headers (CR y LF sobre todo); la
 * comilla cierra antes de tiempo el valor de `filename`.
 */
function isUnsafeInFilename(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < SPACE || code === DEL || FORBIDDEN_IN_FILENAME.includes(char);
}

/**
 * Nombre de archivo a partir del título del recurso, con la extensión del
 * archivo real.
 *
 * La extensión sale de la key y **no se asume `.pdf`**: hoy los recursos son
 * PDF, pero la migración de Drive dejó imágenes (27 `.jpg` en la base). Bajar
 * un JPG con nombre `.pdf` da un archivo que no abre.
 */
export function safeDownloadFilename(title: string, key: string): string {
  const base = [...title]
    .map((char) => (isUnsafeInFilename(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH)
    .replace(/\.+$/, '') // Windows no acepta nombres terminados en punto
    .trim();

  // Un título que era todo caracteres prohibidos no puede dejar el nombre vacío.
  return `${base || 'recurso'}${extensionOf(key)}`;
}

/** La extensión de una key de R2, en minúsculas. `.pdf` si no tiene una válida. */
function extensionOf(key: string): string {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(key);
  return match ? `.${match[1].toLowerCase()}` : '.pdf';
}

/**
 * `Content-Disposition: attachment` con las dos formas del nombre.
 *
 * `filename` va en ASCII imprimible para los clientes viejos, y `filename*` en
 * UTF-8 (RFC 5987) para los que entienden acentos. Los navegadores actuales
 * prefieren `filename*` cuando está, así que "Álgebra.pdf" llega entero.
 */
export function contentDisposition(filename: string): string {
  const ascii = [...filename]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= SPACE && code < DEL ? char : '_';
    })
    .join('');

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

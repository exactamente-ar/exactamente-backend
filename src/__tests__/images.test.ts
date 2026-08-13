import { describe, it, expect } from 'bun:test';
import sharp from 'sharp';
import { isAllowedImageMime, extensionForMime, stripImageMetadata } from '@/services/images';

describe('isAllowedImageMime', () => {
  it('acepta jpeg, png y webp', () => {
    expect(isAllowedImageMime('image/jpeg')).toBe(true);
    expect(isAllowedImageMime('image/png')).toBe(true);
    expect(isAllowedImageMime('image/webp')).toBe(true);
  });

  it('rechaza otros tipos', () => {
    expect(isAllowedImageMime('application/pdf')).toBe(false);
    expect(isAllowedImageMime('image/gif')).toBe(false);
    expect(isAllowedImageMime('')).toBe(false);
  });
});

describe('extensionForMime', () => {
  it('mapea los MIME a extensión', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/webp')).toBe('webp');
  });
});

describe('stripImageMetadata', () => {
  it('descarta la metadata EXIF de una imagen', async () => {
    const withExif = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'red' },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'de-anonimiza-al-autor' } } })
      .toBuffer();

    const metaBefore = await sharp(withExif).metadata();
    expect(metaBefore.exif).toBeDefined();

    const stripped = await stripImageMetadata(withExif);
    const metaAfter = await sharp(stripped).metadata();
    expect(metaAfter.exif).toBeUndefined();
  });
});

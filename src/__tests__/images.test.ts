import { describe, it, expect, mock } from 'bun:test';
import sharp from 'sharp';

mock.module('@/services/storage', () => ({
  storage: {
    uploadFile: mock(async () => {}),
  },
}));

import { storage } from '@/services/storage';
import {
  isAllowedImageMime,
  isNearLosslessCandidate,
  optimizeImage,
  uploadBlogImages,
  MAX_IMAGE_DIMENSION,
} from '@/services/images';

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

describe('isNearLosslessCandidate', () => {
  it('usa lossy para fotos (jpeg sin alpha)', () => {
    expect(isNearLosslessCandidate('image/jpeg', false)).toBe(false);
  });

  it('usa nearLossless para png (texto/diagrama)', () => {
    expect(isNearLosslessCandidate('image/png', false)).toBe(true);
    expect(isNearLosslessCandidate('image/png', true)).toBe(true);
  });

  it('decide webp por su canal alpha', () => {
    expect(isNearLosslessCandidate('image/webp', true)).toBe(true);
    expect(isNearLosslessCandidate('image/webp', false)).toBe(false);
  });
});

describe('optimizeImage', () => {
  it('descarta la metadata EXIF de una imagen', async () => {
    const withExif = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'red' },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'de-anonimiza-al-autor' } } })
      .toBuffer();

    const metaBefore = await sharp(withExif).metadata();
    expect(metaBefore.exif).toBeDefined();

    const optimized = await optimizeImage(withExif, 'image/jpeg');
    const metaAfter = await sharp(optimized).metadata();
    expect(metaAfter.exif).toBeUndefined();
  });

  it('re-encodifica a webp', async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();

    const optimized = await optimizeImage(png, 'image/png');
    const meta = await sharp(optimized).metadata();
    expect(meta.format).toBe('webp');
  });

  it('redimensiona el lado mayor a MAX_IMAGE_DIMENSION (paisaje)', async () => {
    const large = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: 'green' },
    })
      .jpeg()
      .toBuffer();

    const optimized = await optimizeImage(large, 'image/jpeg');
    const meta = await sharp(optimized).metadata();
    expect(meta.width).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
    expect(meta.height).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
    expect(meta.width).toBe(MAX_IMAGE_DIMENSION);
  });

  it('acota la altura en una imagen vertical', async () => {
    const portrait = await sharp({
      create: { width: 3000, height: 4000, channels: 3, background: 'navy' },
    })
      .jpeg()
      .toBuffer();

    const optimized = await optimizeImage(portrait, 'image/jpeg');
    const meta = await sharp(optimized).metadata();
    expect(meta.height).toBe(MAX_IMAGE_DIMENSION);
    expect(meta.width).toBeLessThan(MAX_IMAGE_DIMENSION);
  });

  it('no agranda una imagen más chica que el tope', async () => {
    const small = await sharp({
      create: { width: 400, height: 300, channels: 3, background: 'purple' },
    })
      .jpeg()
      .toBuffer();

    const optimized = await optimizeImage(small, 'image/jpeg');
    const meta = await sharp(optimized).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it('conserva la transparencia de un PNG', async () => {
    const png = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const optimized = await optimizeImage(png, 'image/png');
    const meta = await sharp(optimized).metadata();
    expect(meta.hasAlpha).toBe(true);
  });
});

describe('uploadBlogImages', () => {
  it('sube con key .webp y mimeType image/webp, derivados del formato de salida', async () => {
    const uploadFile = storage.uploadFile as unknown as { mock: { calls: unknown[] } };
    uploadFile.mock.calls.length = 0;

    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const file = new File([png], 'foto.png', { type: 'image/png' });

    const rows = await uploadBlogImages('post', 'p1', [file]);

    expect(rows).toHaveLength(1);
    expect(rows[0].mimeType).toBe('image/webp');
    expect(rows[0].r2Key).toMatch(/^blog-posts\/p1\/.+\.webp$/);
    expect(rows[0].position).toBe(0);

    const [key, , mimeType] = uploadFile.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(/\.webp$/);
    expect(mimeType).toBe('image/webp');
  });
});

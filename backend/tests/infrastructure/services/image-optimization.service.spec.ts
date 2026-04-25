import sharp from 'sharp';
import {
  ImageOptimizationService,
  type ImageUploadPreset,
} from '../../../src/infrastructure/services/image-optimization.service';

describe('ImageOptimizationService', () => {
  let service: ImageOptimizationService;

  beforeEach(() => {
    service = new ImageOptimizationService();
  });

  async function createSampleImage(width: number, height: number) {
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels);
    let seed = 31;

    for (let i = 0; i < raw.length; i += channels) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      raw[i] = seed & 0xff;
      raw[i + 1] = (seed >> 8) & 0xff;
      raw[i + 2] = (seed >> 16) & 0xff;
    }

    return sharp(raw, {
      raw: { width, height, channels },
    })
      .png()
      .toBuffer();
  }

  async function optimizeSample(
    preset: ImageUploadPreset,
    width: number,
    height: number,
  ) {
    const input = await createSampleImage(width, height);

    return {
      input,
      output: await service.optimizeForUpload(
        {
          buffer: input,
          originalname: 'source-cover.png',
          mimetype: 'image/png',
        } as Express.Multer.File,
        preset,
      ),
    };
  }

  it('creates a lightweight jpeg for miniapp recipe cover cards', async () => {
    const { input, output } = await optimizeSample('recipe-cover', 1800, 1012);
    const metadata = await sharp(output.buffer).metadata();

    expect(output.filename).toMatch(/^source-cover-miniapp-cover\.jpg$/);
    expect(output.contentType).toBe('image/jpeg');
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(750);
    expect(metadata.height).toBe(422);
    expect(output.buffer.length).toBeLessThan(input.length);
    expect(output.buffer.length).toBeLessThanOrEqual(160 * 1024);
  });

  it('creates a lightweight fixed-size jpeg for the home banner', async () => {
    const { input, output } = await optimizeSample('home-header-bg', 2400, 1400);
    const metadata = await sharp(output.buffer).metadata();

    expect(output.filename).toMatch(/^source-cover-home-header\.jpg$/);
    expect(output.contentType).toBe('image/jpeg');
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(1125);
    expect(metadata.height).toBe(600);
    expect(output.buffer.length).toBeLessThan(input.length);
    expect(output.buffer.length).toBeLessThanOrEqual(220 * 1024);
  });
});

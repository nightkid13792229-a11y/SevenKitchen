import sharp from 'sharp';
import {
  ImageOptimizationService,
  type ImageUploadPreset,
} from '../../../src/infrastructure/services/image-optimization.service';

describe('ImageOptimizationService', () => {
  // mozjpeg 编码本身偏慢，并行跑全量时给足余量（默认 5s 会偶发超时）
  jest.setTimeout(60_000);

  let service: ImageOptimizationService;

  beforeEach(() => {
    service = new ImageOptimizationService();
  });

  /**
   * 生成一张**接近真实照片**的示例图。
   *
   * 2026-09-27：原先这里逐像素填伪随机数 —— 纯随机噪声恰好是 JPEG 压缩的
   * 最坏情况，mozjpeg 会为此做大量搜索，导致这两个用例在并行跑全量时
   * 频繁超出 Jest 默认的 5s 超时（单独跑却通过）。
   * 真实封面是平滑图像，用渐变 + 少量色块既贴近实际、又把编码耗时降下来。
   */
  const createSampleRawImage = (width: number, height: number): Buffer => {
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * channels;
        // 平滑渐变打底
        raw[offset] = Math.floor((x / width) * 255);
        raw[offset + 1] = Math.floor((y / height) * 255);
        raw[offset + 2] = Math.floor(((x + y) / (width + height)) * 255);
        // 少量色块，保证图里不是纯渐变（更接近真实构图）
        if ((x >> 6) % 2 === 0 && (y >> 6) % 2 === 0) {
          raw[offset] = 240;
          raw[offset + 1] = 200;
          raw[offset + 2] = 120;
        }
      }
    }

    return raw;
  };

  async function createSampleImage(width: number, height: number) {
    const channels = 3;

    return sharp(createSampleRawImage(width, height), {
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

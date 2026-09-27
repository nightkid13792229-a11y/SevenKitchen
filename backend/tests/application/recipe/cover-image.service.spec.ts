import sharp from 'sharp';
import { CoverImageService } from 'src/application/recipe/cover-image.service';

describe('CoverImageService', () => {
  // 中文标题渲染 + mozjpeg 编码本身偏慢，并行跑全量时给足余量
  jest.setTimeout(60_000);

  const mockCosService = {
    uploadImage: jest.fn(),
  };

  let service: CoverImageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoverImageService(mockCosService as any);
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

  const createSampleCoverBuffer = async (): Promise<Buffer> => {
    const width = 960;
    const height = 540;

    return sharp(createSampleRawImage(width, height), {
      raw: { width, height, channels: 3 },
    })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  };

  it('uploads rendered covers as compressed jpeg files', async () => {
    const sourceBuffer = await createSampleCoverBuffer();
    let uploadedBuffer: Buffer | undefined;
    let uploadedFilename: string | undefined;
    let uploadedFolder: string | undefined;

    jest
      .spyOn(service as any, 'downloadImage')
      .mockResolvedValue(sourceBuffer);

    mockCosService.uploadImage.mockImplementation(
      async (file: Buffer, filename: string, folder: string) => {
        uploadedBuffer = file;
        uploadedFilename = filename;
        uploadedFolder = folder;

        return {
          url: 'https://img.sevenkitchen.cloud/recipes/covers/rendered-cover.jpg',
          key: 'recipes/covers/rendered-cover.jpg',
        };
      },
    );

    const result = await service.renderTitleOnCover(
      'https://img.sevenkitchen.cloud/recipes/source-cover.jpg',
      '胆泥淤积',
    );

    expect(result).toBe(
      'https://img.sevenkitchen.cloud/recipes/covers/rendered-cover.jpg',
    );
    expect(mockCosService.uploadImage).toHaveBeenCalledTimes(1);
    expect(uploadedFilename).toMatch(/^cover-with-title-\d+\.jpg$/);
    expect(uploadedFolder).toBe('recipes/covers');
    expect(uploadedBuffer).toBeDefined();

    const metadata = await sharp(uploadedBuffer!).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(750);
    expect(metadata.height).toBe(422);
    expect(uploadedBuffer!.length).toBeLessThan(800 * 1024);
  });
});

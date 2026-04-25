import sharp from 'sharp';
import { CoverImageService } from 'src/application/recipe/cover-image.service';

describe('CoverImageService', () => {
  const mockCosService = {
    uploadImage: jest.fn(),
  };

  let service: CoverImageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoverImageService(mockCosService as any);
  });

  const createSampleCoverBuffer = async (): Promise<Buffer> => {
    const width = 960;
    const height = 540;
    const raw = Buffer.alloc(width * height * 3);
    let seed = 17;

    for (let i = 0; i < raw.length; i += 3) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      raw[i] = seed & 0xff;
      raw[i + 1] = (seed >> 8) & 0xff;
      raw[i + 2] = (seed >> 16) & 0xff;
    }

    return sharp(raw, {
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

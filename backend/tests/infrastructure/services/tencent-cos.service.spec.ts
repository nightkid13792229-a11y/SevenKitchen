import { BadRequestException } from '@nestjs/common';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

describe('TencentCosService credential fallback', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as any;

  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns a mock upload result in development when COS credentials are missing', async () => {
    process.env.NODE_ENV = 'development';

    const service = new TencentCosService(
      createConfigService({
        NODE_ENV: 'development',
        COS_SECRET_ID: undefined,
        COS_SECRET_KEY: undefined,
        COS_BUCKET: undefined,
      }),
    );

    await expect(
      service.uploadImage(
        {
          originalname: 'proof.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('proof'),
        } as Express.Multer.File,
        'proof.jpg',
        'reimbursement-payment-proofs',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        url: expect.stringContaining(
          'http://localhost:3000/mock/reimbursement-payment-proofs/',
        ),
        key: expect.stringContaining(
          'mock/reimbursement-payment-proofs/',
        ),
      }),
    );
  });

  it('still throws in production when COS credentials are missing', async () => {
    process.env.NODE_ENV = 'production';

    const service = new TencentCosService(
      createConfigService({
        NODE_ENV: 'production',
        COS_SECRET_ID: undefined,
        COS_SECRET_KEY: undefined,
        COS_BUCKET: undefined,
      }),
    );

    await expect(
      service.uploadImage(
        {
          originalname: 'proof.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('proof'),
        } as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

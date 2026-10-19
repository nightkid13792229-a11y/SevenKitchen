import { TencentCosService } from 'src/infrastructure/services/tencent-cos.service';

describe('TencentCosService review image security', () => {
  it('removes a temporary image when content inspection rejects it', async () => {
    const service = new TencentCosService({ get: jest.fn().mockReturnValue('value') } as any);
    jest.spyOn(service as any, 'uploadPrivateImage').mockResolvedValue({
      key: 'review-uploads/pending/a.jpg',
    });
    jest.spyOn(service as any, 'inspectImage').mockResolvedValue({ safe: false });
    jest.spyOn(service, 'deleteImage').mockResolvedValue();

    await expect(
      service.uploadReviewedImage(
        { buffer: Buffer.from('image'), originalname: 'a.jpg' } as any,
      ),
    ).rejects.toThrow('图片含违规或不适宜信息，请更换后重试');
    expect(service.deleteImage).toHaveBeenCalledWith('review-uploads/pending/a.jpg');
  });

  it('uses the configured COS image-audit policy', async () => {
    const service = new TencentCosService({
      get: jest.fn((key: string) =>
        ({
          COS_SECRET_ID: 'id', COS_SECRET_KEY: 'key', COS_BUCKET: 'bucket-123',
          COS_REGION: 'ap-chengdu', COS_IMAGE_AUDIT_BIZ_TYPE: 'ffeaddbd8dbe11f19e40525400141ffd',
        })[key],
      ),
    } as any);
    const request = jest.fn().mockResolvedValue({ RecognitionResult: { Result: 0 } });
    jest.spyOn(service as any, 'createCosClient').mockReturnValue({ request });

    await expect((service as any).inspectImage('pending/a.jpg')).resolves.toEqual({ safe: true });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      Query: expect.objectContaining({ 'biz-type': 'ffeaddbd8dbe11f19e40525400141ffd' }),
    }));
  });

  it('copies an approved image with the COS CopySource URL format', async () => {
    const service = new TencentCosService({
      get: jest.fn((key: string) =>
        ({
          COS_SECRET_ID: 'id', COS_SECRET_KEY: 'key', COS_BUCKET: 'bucket-123',
          COS_REGION: 'ap-chengdu',
        })[key],
      ),
    } as any);
    const putObjectCopy = jest.fn().mockResolvedValue({});
    jest.spyOn(service as any, 'uploadPrivateImage').mockResolvedValue({
      key: 'review-uploads/pending/a.jpg',
    });
    jest.spyOn(service as any, 'inspectImage').mockResolvedValue({ safe: true });
    jest.spyOn(service as any, 'createCosClient').mockReturnValue({ putObjectCopy });
    jest.spyOn(service, 'deleteImage').mockResolvedValue();

    await service.uploadReviewedImage(
      { buffer: Buffer.from('image'), originalname: 'a.jpg' } as any,
    );

    expect(putObjectCopy).toHaveBeenCalledWith(expect.objectContaining({
      CopySource: 'bucket-123.cos.ap-chengdu.myqcloud.com/review-uploads/pending/a.jpg',
    }));
  });
});

describe('TencentCosService signed media access (2026-10-19 P0)', () => {
  const config = {
    get: jest.fn((key: string) =>
      ({
        COS_SECRET_ID: 'id',
        COS_SECRET_KEY: 'key',
        COS_BUCKET: 'bucket-123',
        COS_REGION: 'ap-chengdu',
      })[key],
    ),
  } as any;

  it('extractKey 从 URL 中取 COS key', () => {
    const service = new TencentCosService(config);
    expect(
      service.extractKey(
        'https://cdn.example.com/allergy-records/a.jpg?sign=abc',
      ),
    ).toBe('allergy-records/a.jpg');
    expect(service.extractKey('custom-recipe-sensitive-attachments/b.pdf')).toBe(
      'custom-recipe-sensitive-attachments/b.pdf',
    );
  });

  it('getSignedUrl 使用 Sign=true 生成短时地址', async () => {
    const service = new TencentCosService(config);
    const getObjectUrl = jest.fn((params: any, cb: any) =>
      cb(null, { Url: `https://signed/${params.Key}` }),
    );
    jest.spyOn(service as any, 'createCosClient').mockReturnValue({ getObjectUrl });

    await expect(
      service.getSignedUrl('allergy-records/a.jpg'),
    ).resolves.toBe('https://signed/allergy-records/a.jpg');
    expect(getObjectUrl).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'allergy-records/a.jpg', Sign: true }),
      expect.any(Function),
    );
  });
});

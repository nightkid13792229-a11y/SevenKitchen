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
});

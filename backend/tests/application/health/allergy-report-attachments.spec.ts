import { AllergyReportService } from 'src/application/health/allergy-report.service';

describe('AllergyReportService · 历史报告附件恢复', () => {
  it('代理 URL 失效时从订单草稿的 attachmentKeys 重新签发', async () => {
    const prisma = {
      customRecipeOrder: {
        findUnique: jest.fn().mockResolvedValue({
          allergyReportDrafts: [
            {
              attachments: [
                'https://api.sevenkitchen.cloud/api/v1/media/sensitive/dead-token?ext=jpg',
              ],
              attachmentKeys: ['allergy-records/report.jpg'],
            },
          ],
        }),
      },
    } as any;
    const cos = {
      getSensitiveMediaUrl: jest.fn((value: string) => `signed:${value}`),
      extractKey: jest.fn(),
    } as any;
    const service = new AllergyReportService(prisma, {} as any, cos);

    const urls = await (service as any).signAttachments(
      [
        'https://api.sevenkitchen.cloud/api/v1/media/sensitive/dead-token?ext=jpg',
      ],
      'order-uuid:0',
    );

    expect(urls).toEqual(['signed:allergy-records/report.jpg']);
    expect(cos.getSensitiveMediaUrl).toHaveBeenCalledWith(
      'allergy-records/report.jpg',
    );
  });

  it('新建报告时把还活着的代理 URL 换成 COS key', () => {
    const service = new AllergyReportService(
      {} as any,
      {} as any,
      {
        extractKey: jest.fn(() => 'allergy-records/report.jpg'),
      } as any,
    );

    expect(
      (service as any).normalizeAttachmentStorage([
        'https://api.sevenkitchen.cloud/api/v1/media/sensitive/token?ext=jpg',
        'https://img.sevenkitchen.cloud/allergy-records/legacy.jpg',
      ]),
    ).toEqual([
      'allergy-records/report.jpg',
      'https://img.sevenkitchen.cloud/allergy-records/legacy.jpg',
    ]);
  });
});

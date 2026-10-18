import { AllergyReportService } from 'src/application/health/allergy-report.service';

/**
 * 过敏检测报告删除/换附件时，COS 文件要跟着删（2026-10-19）。
 *
 * 之前只删数据库里的链接，文件永远留在 COS：
 * 顾客删了照片/PDF，档案里看不到了，但文件还在、还在占空间。
 */
describe('AllergyReportService · COS 附件清理', () => {
  const prisma: any = {
    dog: { findUnique: jest.fn() },
    allergyReport: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const vocabulary: any = { getVocabulary: jest.fn() };
  const cosService: any = { deleteImageByUrl: jest.fn() };

  const service = new AllergyReportService(prisma, vocabulary, cosService);

  const report = {
    id: 'report-1',
    dogId: 'dog-1',
    attachments: [
      'https://cdn.example.com/allergy-records/a.jpg',
      'https://cdn.example.com/allergy-records/b.pdf',
    ],
    results: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'customer-1',
    });
    prisma.allergyReport.findFirst.mockResolvedValue(report);
    prisma.allergyReport.update.mockResolvedValue({});
    prisma.allergyReport.delete.mockResolvedValue({});
    cosService.deleteImageByUrl.mockResolvedValue(undefined);
  });

  it('修改报告时只删被移除的附件', async () => {
    await service.update('customer-1', 'dog-1', 'report-1', {
      attachments: ['https://cdn.example.com/allergy-records/a.jpg'],
    });

    expect(cosService.deleteImageByUrl).toHaveBeenCalledTimes(1);
    expect(cosService.deleteImageByUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/allergy-records/b.pdf',
    );
  });

  it('删除报告时删掉全部附件', async () => {
    const result = await service.remove('customer-1', 'dog-1', 'report-1');

    expect(result).toEqual({ deleted: true, keptAllergyRecords: true });
    expect(cosService.deleteImageByUrl).toHaveBeenCalledTimes(2);
  });

  it('COS 删除失败不影响报告删除/修改', async () => {
    cosService.deleteImageByUrl.mockRejectedValue(new Error('cos down'));

    await expect(
      service.remove('customer-1', 'dog-1', 'report-1'),
    ).resolves.toEqual({ deleted: true, keptAllergyRecords: true });
  });
});

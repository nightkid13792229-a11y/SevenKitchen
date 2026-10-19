import { CustomRecipeService } from 'src/application/custom-recipe/custom-recipe.service';

describe('CustomRecipeService · 健康档案汇总', () => {
  it('最近就诊带日期和诊断，供定制页只读确认块使用', async () => {
    const prisma: any = {
      allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
      medicalRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'med-1',
            visitDate: new Date('2026-09-20T00:00:00.000Z'),
            diagnosis: '胰腺炎',
          },
        ]),
      },
      checkupRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'checkup-1',
            checkupDate: new Date('2026-08-12T00:00:00.000Z'),
            checkupType: '血常规',
          },
        ]),
      },
      weightRecord: { findMany: jest.fn().mockResolvedValue([]) },
      vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
      dog: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new CustomRecipeService(
      prisma,
      {} as any,
      {} as any,
    );

    const summary: any = await service.getDogHealthSummary('dog-1');

    expect(summary.recentVisits).toEqual([
      {
        id: 'med-1',
        visitDate: new Date('2026-09-20T00:00:00.000Z'),
        diagnosis: '胰腺炎',
      },
    ]);
    expect(summary.recentCheckups[0].checkupType).toBe('血常规');
    // 兼容旧字段：疾病名仍然保留
    expect(summary.medicalConditions).toEqual(['胰腺炎']);
  });
});

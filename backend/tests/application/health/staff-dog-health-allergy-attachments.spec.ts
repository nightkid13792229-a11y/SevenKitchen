import { StaffDogHealthService } from '../../../src/application/health/staff-dog-health.service';
import { AllergyReportService } from '../../../src/application/health/allergy-report.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

/**
 * 健康档案 · 过敏检测报告原件（2026-11-16）
 *
 * ## 背景
 *
 * 后台"健康档案"页面此前只收集**就诊 / 体检**两处的附件，
 * 顾客在小程序上传的**过敏检测报告**（`allergy_report.attachments`）
 * 后台完全看不到 —— 数据在库里，页面没有。
 *
 * 代客下单页要做「看档案」抽屉时，员工最想看的恰恰是这份报告：
 * 过敏是定制食谱的第一道红线，只看顾客手打的一行字不够。
 *
 * 这里锁住：
 *   ① 过敏报告的附件也进 attachments，且 source='allergy'；
 *   ② 报告本身（日期/机构/结论/附件）单独带出来，供抽屉按报告分组展示；
 *   ③ counts.attachments 统计口径包含过敏报告；
 *   ④ 没有报告的狗不炸（老档案大量如此）。
 */
describe('健康档案 · 过敏检测报告', () => {
  const DOG_ID = 'dog-1';

  function createService(dogOverrides: Record<string, any> = {}) {
    const prisma = {
      dog: {
        findUnique: jest.fn().mockResolvedValue({
          id: DOG_ID,
          ownerId: 'customer-1',
          name: '面包',
          breedId: 'breed-1',
          customBreedName: null,
          gender: 'MALE',
          isNeutered: true,
          birthday: new Date('2023-05-10T00:00:00.000Z'),
          currentWeightKg: 12.4,
          bcsScore: 7,
          mealsPerDay: 2,
          activityLevel: 'NORMAL',
          preferredFoods: '',
          pickyFoods: '',
          medicalHistory: '',
          healthTagOverrides: {},
          medicalRecords: [],
          checkupRecords: [],
          allergyRecords: [],
          allergyReports: [
            {
              id: 'ar-1',
              dogId: DOG_ID,
              testDate: new Date('2026-10-12T00:00:00.000Z'),
              testMethod: 'SERUM_IGE',
              institution: '宠爱国际动物医院',
              summary: '牛肉、小麦阳性',
              attachments: [
                'https://cdn.example.com/allergy-1.jpg',
                'https://cdn.example.com/allergy-2.jpg',
              ],
              ocrText: '…',
              sourceKey: null,
              createdAt: new Date('2026-10-13T00:00:00.000Z'),
              updatedAt: new Date('2026-10-13T00:00:00.000Z'),
            },
          ],
          vaccineRecords: [],
          weightRecords: [],
          dietPreferences: [],
          ...dogOverrides,
        }),
      },
      dogBreed: {
        findUnique: jest.fn().mockResolvedValue({ id: 'breed-1', name: '比熊' }),
      },
      customRecipeOrder: { findMany: jest.fn().mockResolvedValue([]) },
      medicalRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      checkupRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      allergyRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      vaccineRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      weightRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      dogDietPreferenceChange: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;

    const timeline = {
      getVisitSummaryForStaff: jest.fn().mockResolvedValue({
        dog: {
          id: DOG_ID,
          name: '面包',
          breedName: '比熊',
          gender: '公',
          isNeutered: true,
          birthday: '2023-05-10',
          ageText: '3 岁 6 个月',
          currentWeightKg: 12.4,
          bcsScore: 7,
          weightUpdatedAt: null,
        },
        allergies: [],
        ongoingConditions: [],
        recentVisits: [],
        recentCheckups: [],
        vaccines: { latest: [], upcoming: [] },
        weight: { current: 12.4, records: [], recentChangeKg: null },
        diet: { preferredFoods: '', pickyFoods: '' },
        counts: { visits: 0, checkups: 0, allergies: 0, vaccines: 0, weights: 0 },
        medicalHistory: '',
        generatedAt: '2026-11-16T00:00:00.000Z',
      }),
    } as any;

    const analysis = { analyzeForStaff: jest.fn() } as any;

    /**
     * 附件签发替身：把 COS key 换成"可访问的代理地址"。
     * 真实实现见 AllergyReportService.signStoredAttachments（有独立测试）。
     */
    const allergyReportService = {
      signStoredAttachments: jest.fn(
        async (urls: string[], _sourceKey?: string | null) =>
          (urls || []).map((url) =>
            String(url).startsWith('http')
              ? url
              : `https://api.example.com/api/v1/media/sensitive/token?ext=jpg&key=${encodeURIComponent(url)}`,
          ),
      ),
    } as any;

    return {
      service: new StaffDogHealthService(
        prisma,
        timeline,
        analysis,
        allergyReportService,
      ),
      allergyReportService,
    };
  }

  it('★ 过敏报告的附件进入报告原件，source 标成 allergy', async () => {
    const { service } = createService();
    const overview = await service.getHealthOverview(DOG_ID, {
      includeAnalysis: false,
    });

    const allergyAttachments = overview.attachments.filter(
      (item) => item.source === 'allergy',
    );
    expect(allergyAttachments).toHaveLength(2);
    expect(allergyAttachments[0]).toMatchObject({
      recordId: 'ar-1',
      recordDate: '2026-10-12',
      recordLabel: '牛肉、小麦阳性',
      url: 'https://cdn.example.com/allergy-1.jpg',
    });
    expect(overview.counts.attachments).toBe(2);
  });

  it('★ 报告本身单独带出来（日期/机构/结论/附件）', async () => {
    const { service } = createService();
    const overview = await service.getHealthOverview(DOG_ID, {
      includeAnalysis: false,
    });

    expect(overview.allergyReports).toHaveLength(1);
    expect(overview.allergyReports[0]).toMatchObject({
      id: 'ar-1',
      testDate: '2026-10-12',
      institution: '宠爱国际动物医院',
      summary: '牛肉、小麦阳性',
      testMethod: 'SERUM_IGE',
    });
    expect(overview.allergyReports[0].attachments).toEqual([
      'https://cdn.example.com/allergy-1.jpg',
      'https://cdn.example.com/allergy-2.jpg',
    ]);
  });

  it('★ 没有报告的狗不炸，列表为空、附件为空', async () => {
    const { service } = createService({ allergyReports: [] });
    const overview = await service.getHealthOverview(DOG_ID, {
      includeAnalysis: false,
    });

    expect(overview.allergyReports).toEqual([]);
    expect(overview.attachments).toEqual([]);
  });

  it('★ 附件必须是签发后的可访问地址，不能把 COS key 原样吐给页面', async () => {
    const prismaDog = {
      allergyReports: [
        {
          id: 'ar-2',
          testDate: new Date('2026-11-10T00:00:00.000Z'),
          testMethod: 'SERUM_IGE',
          institution: null,
          summary: '三文鱼阳性',
          sourceKey: 'order-uuid:0',
          attachments: [
            'custom-recipe-sensitive-attachments/1762000000000-abc.jpg',
          ],
        },
      ],
    };
    const { service, allergyReportService } = createService(prismaDog);

    const overview = await service.getHealthOverview(DOG_ID, {
      includeAnalysis: false,
    });

    expect(
      allergyReportService.signStoredAttachments,
    ).toHaveBeenCalledWith(
      ['custom-recipe-sensitive-attachments/1762000000000-abc.jpg'],
      'order-uuid:0',
    );
    expect(overview.allergyReports[0].attachments[0]).toContain(
      '/api/v1/media/sensitive/',
    );
    expect(overview.allergyReports[0].attachments[0]).not.toBe(
      'custom-recipe-sensitive-attachments/1762000000000-abc.jpg',
    );
    // 报告原件墙里那一份也必须是签发后的地址
    const allergyWall = overview.attachments.filter(
      (item) => item.source === 'allergy',
    );
    expect(allergyWall[0].url).toContain('/api/v1/media/sensitive/');
  });

  it('★ 真实签发链路：COS key → 媒体代理地址（不是拿假函数糊过去）', async () => {
    // 上一个用例用的是替身；这个用例把真的 TencentCosService +
    // AllergyReportService 接进来，防止"两边都假、线上还是破图"。
    const config = {
      get: (key: string) =>
        ({
          COS_BUCKET: 'bucket-test',
          COS_REGION: 'ap-guangzhou',
          COS_SECRET_ID: 'id',
          COS_SECRET_KEY: 'key',
        })[key],
    } as any;
    const cos = new TencentCosService(config);
    const allergyService = new AllergyReportService(
      {
        customRecipeOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any,
      {} as any,
      cos,
    );

    const prisma = {
      dog: {
        findUnique: jest.fn().mockResolvedValue({
          id: DOG_ID,
          name: '面包',
          breedId: null,
          customBreedName: null,
          gender: 'MALE',
          isNeutered: true,
          birthday: new Date('2023-05-10T00:00:00.000Z'),
          currentWeightKg: 12.4,
          bcsScore: 7,
          mealsPerDay: 2,
          activityLevel: 'NORMAL',
          preferredFoods: '',
          pickyFoods: '',
          allergyFoods: '',
          medicalHistory: '',
          healthTagOverrides: {},
          medicalRecords: [],
          checkupRecords: [],
          allergyRecords: [],
          allergyReports: [
            {
              id: 'ar-real',
              testDate: new Date('2026-11-01T00:00:00.000Z'),
              testMethod: 'SERUM_IGE',
              institution: '宠爱国际',
              summary: '牛肉阳性',
              sourceKey: null,
              attachments: [
                'custom-recipe-sensitive-attachments/1762000000000-abc.jpg',
              ],
            },
          ],
          vaccineRecords: [],
          weightRecords: [],
          dietPreferences: [],
        }),
      },
      dogBreed: { findUnique: jest.fn().mockResolvedValue(null) },
      customRecipeOrder: { findMany: jest.fn().mockResolvedValue([]) },
      medicalRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      checkupRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      allergyRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      vaccineRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      weightRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      dogDietPreferenceChange: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const timeline = {
      getVisitSummaryForStaff: jest.fn().mockResolvedValue({
        dog: { ageText: '3 岁', name: '面包' },
        allergies: [],
        ongoingConditions: [],
        recentVisits: [],
        recentCheckups: [],
        vaccines: { latest: [], upcoming: [] },
        weight: {},
        diet: {},
        counts: {},
        medicalHistory: '',
      }),
    } as any;
    const service = new StaffDogHealthService(
      prisma,
      timeline,
      { analyzeForStaff: jest.fn() } as any,
      allergyService,
    );

    const overview = await service.getHealthOverview(DOG_ID, {
      includeAnalysis: false,
    });

    const signed = overview.allergyReports[0].attachments[0];
    expect(signed).toContain('/api/v1/media/sensitive/');
    expect(signed).toContain('ext=jpg');
    expect(signed).not.toContain('custom-recipe-sensitive-attachments');
    // 报告原件墙里那一份也必须是同一个可访问地址
    expect(overview.attachments[0].url).toContain('/api/v1/media/sensitive/');
  });

  it('★ 档案里员工手填的过敏食物也要带出来（只读结构化会漏）', async () => {
    const { service } = createService({
      allergyRecords: [],
      allergyFoods: '鸡肉、牛肉',
    });

    const overview = await service.getHealthOverview(DOG_ID, {
      includeAnalysis: false,
    });

    expect(overview.dog.allergyFoods).toBe('鸡肉、牛肉');
  });

  it('★ 老数据缺 allergyReports 字段时按空处理（不能把整个档案打挂）', async () => {
    const { service } = createService({ allergyReports: undefined });
    const overview = await service.getHealthOverview(DOG_ID, {
      includeAnalysis: false,
    });

    expect(overview.allergyReports).toEqual([]);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import {
  CustomRecipeConfigService,
  DEFAULT_MULTI_RECIPE_DISCOUNTS,
} from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

/**
 * 定制单 → 狗狗档案 的同步时点（2026-10-19 重做）
 *
 * 老板确认：草稿先放手机本地；付款成功后才写狗狗档案；未付款订单设计器禁止开始。
 *
 * 这组测试锁住三件事：
 *   1. **提交订单不再写档案** —— 只存订单快照；
 *   2. 付款成功后才把文字/报告草稿/疾病/偏好写进档案；
 *   3. 重复回调/重试不会重复建报告、重复写档案。
 */

/** 与 prisma/schema.prisma 的 AllergyRecord 保持一致，改模型时这里也要同步 */
const ALLERGY_RECORD_FIELDS = new Set([
  'id',
  'dogId',
  'allergen',
  'notes',
  'createdAt',
  'updatedAt',
  'attachments',
  'certainty',
  'source',
  'reportId',
  'observedAt',
]);

/** 与 prisma/schema.prisma 的 MedicalRecord 保持一致 */
const MEDICAL_RECORD_FIELDS = new Set([
  'id',
  'dogId',
  'visitDate',
  'chiefComplaint',
  'diagnosis',
  'treatment',
  'medications',
  'status',
  'followUpDate',
  'veterinarian',
  'notes',
  'createdAt',
  'updatedAt',
  'attachments',
]);

describe('CustomRecipeService · 档案同步时点', () => {
  let service: CustomRecipeService;

  const allergyCreate = jest.fn();
  const allergyUpdate = jest.fn();
  const medicalCreate = jest.fn();
  const reportCreate = jest.fn();

  const mockPrismaService = {
    dog: {
      findFirst: jest.fn().mockResolvedValue({ id: 'dog-1', ownerId: 'user-1' }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customRecipeSchedule: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
    customRecipeOrder: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    allergyRecord: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: allergyCreate,
      update: allergyUpdate,
    },
    medicalRecord: {
      findFirst: jest.fn(),
      create: medicalCreate,
    },
    allergyReport: {
      findUnique: jest.fn(),
      create: reportCreate,
    },
    dogDietPreference: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    dogDietPreferenceChange: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        CustomRecipePricingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: { deleteImage: jest.fn() } },
        {
          provide: CustomRecipeConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({
              feeAmount: 300,
              deliveryWorkDays: 3,
              dailyCapacity: 4,
              paymentTimeoutMinutes: 30,
              multiRecipeEnabled: false,
              maxRecipeQuantity: 5,
              multiRecipeDiscounts: DEFAULT_MULTI_RECIPE_DISCOUNTS.map(
                (tier) => ({ ...tier }),
              ),
            }),
          },
        },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    jest.clearAllMocks();

    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrismaService),
    );
    mockPrismaService.customRecipeSchedule.findUnique.mockResolvedValue({
      isAvailable: true,
      bookedCount: 0,
      capacity: 4,
    });
    mockPrismaService.customRecipeSchedule.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrismaService.customRecipeSchedule.createMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue(null);
    mockPrismaService.customRecipeOrder.create.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR1',
      amount: 300,
    });
    mockPrismaService.customRecipeOrder.update.mockResolvedValue({});
    mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({ count: 1 });
    mockPrismaService.allergyRecord.findUnique.mockResolvedValue(null);
    /**
     * 事务内模拟「已经写进去的记录能被后续查询看到」。
     * 付款同步会先写报告/数组记录，再从自由文本补简单过敏原；
     * 如果这里永远返回 null，测试就看不到去重效果。
     */
    const createdAllergyRecords: Array<{
      dogId: string;
      allergen: string;
    }> = [];
    mockPrismaService.allergyRecord.findFirst.mockImplementation(
      async ({ where }: any) => {
        const allergen = String(where?.allergen || '').trim();
        const found = createdAllergyRecords.find(
          (record) =>
            record.dogId === where?.dogId &&
            record.allergen.toLowerCase() === allergen.toLowerCase(),
        );
        return found ? { id: `created-${found.allergen}` } : null;
      },
    );
    mockPrismaService.medicalRecord.findFirst.mockResolvedValue(null);
    mockPrismaService.dog.findUnique.mockResolvedValue({
      allergyFoods: null,
      preferredFoods: null,
      pickyFoods: null,
    });
    mockPrismaService.dog.update.mockResolvedValue({});
    mockPrismaService.allergyReport.findUnique.mockResolvedValue(null);
    allergyCreate.mockImplementation(async ({ data }: any) => {
      createdAllergyRecords.push({
        dogId: data.dogId,
        allergen: data.allergen,
      });
      return {};
    });
    allergyUpdate.mockResolvedValue({});
    medicalCreate.mockResolvedValue({});
    reportCreate.mockResolvedValue({ id: 'report-1' });
  });

  const submit = (overrides: Record<string, unknown> = {}) =>
    service.createOrder({
      customerId: 'user-1',
      dogId: 'dog-1',
      targetGoal: 'MAINTAIN' as any,
      scheduledDate: new Date('2026-11-10'),
      syncToHealthProfile: true,
      allergies: [],
      allergyStatus: 'NO_ALLERGY',
      currentFoodMain: 'DRY',
      changeReasons: ['HEALTHIER'],
      allergyText: null,
      allergyReportDrafts: [],
      medicalConditions: [],
      preferredIngredients: [],
      dislikedIngredients: [],
      attachmentUrls: [],
      ...overrides,
    } as any);

  const paidOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'cr-uuid-1',
    orderId: 'CR1',
    customerId: 'user-1',
    dogId: 'dog-1',
    status: 'PAID',
    syncToHealthProfile: true,
    healthInfoSyncedAt: null,
    allergies: [],
    allergyText: null,
    allergyReportDrafts: [],
    medicalConditions: [],
    preferredIngredients: [],
    dislikedIngredients: [],
    ...overrides,
  });

  const prepareSync = (order: Record<string, unknown>) => {
    mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
      id: order.id,
      orderId: order.orderId,
    });
    mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue(order);
  };

  it('提交订单只存快照，不写狗狗档案', async () => {
    await submit({
      allergyStatus: 'HAS_ALLERGY',
      allergies: ['鸡肉'],
      allergyText: '鸡肉、牛肉',
      allergyReportDrafts: [
        {
          attachments: ['allergy-records/report.jpg'],
          attachmentKeys: ['allergy-records/report.jpg'],
          results: [{ allergen: '鸡肉', level: 'POSITIVE' }],
        },
      ],
    });

    expect(allergyCreate).not.toHaveBeenCalled();
    expect(medicalCreate).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
    expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
    expect(mockPrismaService.customRecipeOrder.update).not.toHaveBeenCalled();

    const data = mockPrismaService.customRecipeOrder.create.mock.calls[0][0].data;
    expect(data.allergyText).toBe('鸡肉、牛肉');
    expect(data.syncToHealthProfile).toBe(true);
    expect(data.allergyReportDrafts).toHaveLength(1);
    expect(data.healthInfoSyncedAt).toBeUndefined();
  });

  it('待付款订单不做档案同步', async () => {
    const order = paidOrder({ status: 'PENDING_PAYMENT' });
    prepareSync(order);

    const result = await service.syncPaidOrderToHealthProfile('CR1');

    expect(result.synced).toBe(false);
    expect(result.reason).toContain('尚未付款');
    expect(reportCreate).not.toHaveBeenCalled();
    expect(allergyCreate).not.toHaveBeenCalled();
    expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
  });

  it('付款后：报告草稿转正式报告 + 过敏文本归档 + 疾病/偏好写入', async () => {
    const order = paidOrder({
      allergyText: '鸡肉、牛肉',
      medicalConditions: ['肠胃敏感'],
      preferredIngredients: ['鸡肉'],
      allergyReportDrafts: [
        {
          attachments: ['https://cos.example/report.jpg'],
          attachmentKeys: ['allergy-records/report.jpg'],
          testDate: '2026-10-01',
          testMethod: 'SERUM',
          ocrText: '鸡肉 阳性',
          summary: '报告摘要',
          results: [
            { allergen: '鸡肉', level: 'POSITIVE' },
            { allergen: '牛肉', level: 'NEGATIVE' },
          ],
        },
      ],
    });
    prepareSync(order);

    const result = await service.syncPaidOrderToHealthProfile('CR1');

    expect(result.synced).toBe(true);
    expect(reportCreate).toHaveBeenCalledTimes(1);
    expect(reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dogId: 'dog-1',
          sourceKey: 'cr-uuid-1:0',
          attachments: ['allergy-records/report.jpg'],
          testMethod: 'SERUM',
        }),
      }),
    );
    /**
     * 阳性写一条；阴性不记成过敏。
     * 文本里的「鸡肉」与报告记录重复，只补「牛肉」—— 共两条。
     */
    expect(allergyCreate).toHaveBeenCalledTimes(2);
    expect(allergyCreate.mock.calls.map(([arg]) => arg.data.allergen)).toEqual([
      '鸡肉',
      '牛肉',
    ]);
    expect(allergyCreate.mock.calls[0][0].data.certainty).toBe('CONFIRMED');
    expect(allergyCreate.mock.calls[0][0].data.source).toBe('REPORT');

    const textRecord = allergyCreate.mock.calls[1][0].data;
    expect(textRecord).toEqual(
      expect.objectContaining({
        dogId: 'dog-1',
        allergen: '牛肉',
        source: 'OWNER',
        certainty: 'SUSPECTED',
        notes: expect.stringMatching(
          /^从定制订单过敏文本同步（\d{4}-\d{2}-\d{2}）$/,
        ),
      }),
    );
    expect(medicalCreate).toHaveBeenCalledTimes(1);
    expect(medicalCreate.mock.calls[0][0].data.diagnosis).toBe('肠胃敏感');
    // 饮食偏好照旧写入；但不再把订单文本写进旧字段 allergyFoods
    expect(mockPrismaService.dog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ preferredFoods: '鸡肉' }),
      }),
    );
    for (const [updateArgs] of mockPrismaService.dog.update.mock.calls) {
      expect(updateArgs.data).not.toHaveProperty('allergyFoods');
    }
    expect(mockPrismaService.customRecipeOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cr-uuid-1', healthInfoSyncedAt: null },
        data: expect.objectContaining({ healthInfoSyncedAt: expect.any(Date) }),
      }),
    );
  });

  it('纯文本 鸡肉、牛肉 建两条过敏记录，不写旧字段 allergyFoods', async () => {
    const order = paidOrder({ allergyText: '鸡肉、牛肉' });
    prepareSync(order);

    const result = await service.syncPaidOrderToHealthProfile('CR1');

    expect(result.synced).toBe(true);
    expect(allergyCreate).toHaveBeenCalledTimes(2);
    const records = allergyCreate.mock.calls.map(([arg]) => arg.data);
    expect(records.map((record) => record.allergen)).toEqual(['鸡肉', '牛肉']);
    for (const record of records) {
      expect(record).toEqual(
        expect.objectContaining({
          dogId: 'dog-1',
          source: 'OWNER',
          certainty: 'SUSPECTED',
          notes: expect.stringMatching(
            /^从定制订单过敏文本同步（\d{4}-\d{2}-\d{2}）$/,
          ),
        }),
      );
      expect(record).not.toHaveProperty('allergyFoods');
    }
    // 没有饮食偏好时，旧文本字段这条写路径不应再碰 dog 表
    expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
  });

  it('简单文本 鸭、猪 也能建档', async () => {
    const order = paidOrder({ allergyText: '鸭、猪' });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    expect(allergyCreate).toHaveBeenCalledTimes(2);
    expect(allergyCreate.mock.calls.map(([arg]) => arg.data.allergen)).toEqual([
      '鸭',
      '猪',
    ]);
  });

  it('中英文逗号/分号/换行都能拆分，并去掉首尾空白', async () => {
    const order = paidOrder({
      allergyText: ' 鸡肉 , 牛肉，鸭;猪；鱼\n虾\r蛋 ',
    });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    expect(allergyCreate.mock.calls.map(([arg]) => arg.data.allergen)).toEqual([
      '鸡肉',
      '牛肉',
      '鸭',
      '猪',
      '鱼',
      '虾',
      '蛋',
    ]);
  });

  it('文本内重复过敏原忽略大小写，只建一条并保留首次写法', async () => {
    const order = paidOrder({ allergyText: 'Chicken、chicken、CHICKEN' });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    expect(allergyCreate).toHaveBeenCalledTimes(1);
    expect(allergyCreate.mock.calls[0][0].data.allergen).toBe('Chicken');
  });

  it.each(['无', '没有', '暂无', '不清楚', '正常吃', '不过敏'])(
    '占位说法「%s」不建档',
    async (allergyText) => {
      const order = paidOrder({ allergyText });
      prepareSync(order);

      await service.syncPaidOrderToHealthProfile('CR1');

      expect(allergyCreate).not.toHaveBeenCalled();
      expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['弱阳性：* 鸡肉'],
    ['对粗粮过敏'],
    ['胡萝卜不消化'],
    ['过敏原检测报告：鸡肉'],
    ['chicken breast'],
    ['a'.repeat(21)],
  ])('报告/句子型文本「%s」不建档', async (allergyText) => {
    const order = paidOrder({ allergyText });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    expect(allergyCreate).not.toHaveBeenCalled();
    expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
  });

  it('档案已有同名单一过敏原时不重复建档', async () => {
    mockPrismaService.allergyRecord.findFirst.mockImplementation(
      async ({ where }: any) =>
        String(where?.allergen || '').trim() === '牛肉'
          ? { id: 'existing-beef' }
          : null,
    );
    const order = paidOrder({ allergyText: '鸡肉、牛肉' });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    expect(allergyCreate).toHaveBeenCalledTimes(1);
    expect(allergyCreate.mock.calls[0][0].data.allergen).toBe('鸡肉');
  });

  it('数组和文本都同步：重复项只建一条，简单文本补进档案', async () => {
    const order = paidOrder({
      allergies: ['鸡肉'],
      allergyText: '鸡肉、牛肉',
    });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    expect(allergyCreate).toHaveBeenCalledTimes(2);
    expect(allergyCreate.mock.calls.map(([arg]) => arg.data.allergen)).toEqual([
      '鸡肉',
      '牛肉',
    ]);
    expect(allergyCreate.mock.calls[0][0].data.notes).toBe(
      '顾客提交定制需求时填写',
    );
    expect(allergyCreate.mock.calls[1][0].data.source).toBe('OWNER');
    expect(allergyCreate.mock.calls[1][0].data.certainty).toBe('SUSPECTED');
  });

  it('同步幂等：已同步过的订单直接返回，不再写', async () => {
    const order = paidOrder({ healthInfoSyncedAt: new Date() });
    prepareSync(order);

    const result = await service.syncPaidOrderToHealthProfile('CR1');

    expect(result.synced).toBe(true);
    expect(reportCreate).not.toHaveBeenCalled();
    expect(allergyCreate).not.toHaveBeenCalled();
    expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
  });

  it('syncToHealthProfile 关掉时不写档案', async () => {
    const order = paidOrder({ syncToHealthProfile: false });
    prepareSync(order);

    const result = await service.syncPaidOrderToHealthProfile('CR1');

    expect(result.synced).toBe(false);
    expect(reportCreate).not.toHaveBeenCalled();
    expect(allergyCreate).not.toHaveBeenCalled();
    expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
  });

  it('同一份报告草稿重试不会重复建报告', async () => {
    const order = paidOrder({
      allergyReportDrafts: [
        {
          attachments: ['https://cos.example/report.jpg'],
          results: [{ allergen: '鸡肉', level: 'POSITIVE' }],
        },
      ],
    });
    prepareSync(order);
    mockPrismaService.allergyReport.findUnique.mockResolvedValue({
      id: 'existing-report',
    });

    const result = await service.syncPaidOrderToHealthProfile('CR1');

    expect(result.synced).toBe(true);
    expect(reportCreate).not.toHaveBeenCalled();
    expect(allergyCreate).not.toHaveBeenCalled();
    // 报告已存在时不再重复建记录；也不再写狗狗旧文本字段
    expect(mockPrismaService.dog.update).not.toHaveBeenCalled();
  });

  it('⚠️ 付款同步只写 AllergyRecord 真实存在的字段', async () => {
    const order = paidOrder({
      allergyReportDrafts: [
        {
          results: [{ allergen: '鸡肉', level: 'POSITIVE' }],
        },
      ],
    });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    const data = allergyCreate.mock.calls[0][0].data;
    const unknown = Object.keys(data).filter(
      (key) => !ALLERGY_RECORD_FIELDS.has(key),
    );
    expect(unknown).toEqual([]);
    expect(data.source).toBe('REPORT');
    expect(data.reportId).toBe('report-1');
  });

  it('⚠️ 疾病记录只写模型里真实存在的字段', async () => {
    const order = paidOrder({ medicalConditions: ['肠胃敏感'] });
    prepareSync(order);

    await service.syncPaidOrderToHealthProfile('CR1');

    const data = medicalCreate.mock.calls[0][0].data;
    const unknown = Object.keys(data).filter(
      (key) => !MEDICAL_RECORD_FIELDS.has(key),
    );
    expect(unknown).toEqual([]);
    expect(data.diagnosis).toBe('肠胃敏感');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
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
    mockPrismaService.allergyRecord.findFirst.mockResolvedValue(null);
    mockPrismaService.allergyRecord.findUnique.mockResolvedValue(null);
    mockPrismaService.medicalRecord.findFirst.mockResolvedValue(null);
    mockPrismaService.dog.findUnique.mockResolvedValue({
      allergyFoods: null,
      preferredFoods: null,
      pickyFoods: null,
    });
    mockPrismaService.dog.update.mockResolvedValue({});
    mockPrismaService.allergyReport.findUnique.mockResolvedValue(null);
    allergyCreate.mockResolvedValue({});
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
          attachments: ['https://cos.example/report.jpg'],
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

  it('付款后：报告草稿转正式报告 + 文本合并 + 疾病/偏好写入', async () => {
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
          attachments: ['https://cos.example/report.jpg'],
          testMethod: 'SERUM',
        }),
      }),
    );
    // 阳性写一条；阴性不记成过敏
    expect(allergyCreate).toHaveBeenCalledTimes(1);
    expect(allergyCreate.mock.calls[0][0].data.allergen).toBe('鸡肉');
    expect(allergyCreate.mock.calls[0][0].data.certainty).toBe('CONFIRMED');
    expect(medicalCreate).toHaveBeenCalledTimes(1);
    expect(medicalCreate.mock.calls[0][0].data.diagnosis).toBe('肠胃敏感');
    expect(mockPrismaService.dog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ allergyFoods: '鸡肉、牛肉' }),
      }),
    );
    expect(mockPrismaService.customRecipeOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cr-uuid-1', healthInfoSyncedAt: null },
        data: expect.objectContaining({ healthInfoSyncedAt: expect.any(Date) }),
      }),
    );
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
    // 报告已存在，但文本仍会合并
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

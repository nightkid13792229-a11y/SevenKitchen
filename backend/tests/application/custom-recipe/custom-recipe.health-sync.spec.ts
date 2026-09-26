import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

/**
 * 定制单 → 狗狗健康档案 的同步（2026-09-27）
 *
 * 背景：这段同步曾经写坏了 —— `AllergyRecord` 只有 `allergen` / `notes`，
 * 代码却写入了 `allergenType` / `severity` / `discoveryDate` / `confirmedBy`
 * 四个**不存在的列**，Prisma 直接抛 `Unknown argument`，
 * **整个下单事务回滚**。而小程序端 `syncToHealthProfile` 恒为 true，
 * 等于"顾客只要填了一个过敏原，就永远提交不了定制单"（实测 500）。
 *
 * 这里用 mock 捕获真实的写入内容，断言**只写模型里真实存在的字段**，
 * 让这类"照着想象写字段名"的错误在跑测试时就被抓住。
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

describe('CustomRecipeService · 同步到狗狗健康档案', () => {
  let service: CustomRecipeService;

  const allergyCreate = jest.fn();
  const medicalCreate = jest.fn();

  const mockPrismaService = {
    customRecipeSchedule: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customRecipeOrder: {
      create: jest.fn(),
      update: jest.fn(),
    },
    allergyRecord: {
      findFirst: jest.fn(),
      create: allergyCreate,
    },
    medicalRecord: {
      findFirst: jest.fn(),
      create: medicalCreate,
    },
    $transaction: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        {
          provide: CustomRecipeConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({
              feeAmount: 300,
              creditAmount: 300,
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
    // 排期已存在且可约
    mockPrismaService.customRecipeSchedule.findUnique.mockResolvedValue({
      isAvailable: true,
      bookedCount: 0,
      capacity: 4,
    });
    mockPrismaService.customRecipeOrder.create.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR1',
      amount: 300,
      creditAmount: 300,
    });
    mockPrismaService.customRecipeOrder.update.mockResolvedValue({});
    mockPrismaService.allergyRecord.findFirst.mockResolvedValue(null);
    mockPrismaService.medicalRecord.findFirst.mockResolvedValue(null);
    allergyCreate.mockResolvedValue({});
    medicalCreate.mockResolvedValue({});
  });

  const submit = (overrides: Record<string, unknown> = {}) =>
    service.createOrder({
      customerId: 'user-1',
      dogId: 'dog-1',
      targetGoal: 'MAINTAIN' as any,
      scheduledDate: new Date('2026-11-10'),
      syncToHealthProfile: true,
      allergies: [],
      medicalConditions: [],
      preferredIngredients: [],
      dislikedIngredients: [],
      attachmentUrls: [],
      ...overrides,
    } as any);

  it('⚠️ 过敏记录只写模型里真实存在的字段', async () => {
    await submit({ allergies: ['鸡肉'] });

    expect(allergyCreate).toHaveBeenCalledTimes(1);
    const data = allergyCreate.mock.calls[0][0].data;
    const unknown = Object.keys(data).filter(
      (key) => !ALLERGY_RECORD_FIELDS.has(key),
    );

    // 写了不存在的列 → Prisma 会抛 Unknown argument → 整个下单事务回滚
    expect(unknown).toEqual([]);
    expect(data.allergen).toBe('鸡肉');
    expect(data.dogId).toBe('dog-1');
  });

  it('⚠️ 疾病记录只写模型里真实存在的字段', async () => {
    await submit({ medicalConditions: ['肠胃敏感'] });

    expect(medicalCreate).toHaveBeenCalledTimes(1);
    const data = medicalCreate.mock.calls[0][0].data;
    const unknown = Object.keys(data).filter(
      (key) => !MEDICAL_RECORD_FIELDS.has(key),
    );

    expect(unknown).toEqual([]);
    expect(data.diagnosis).toBe('肠胃敏感');
  });

  it('不再替顾客臆断严重程度等医学判断', async () => {
    await submit({ allergies: ['鸡肉'] });

    const data = allergyCreate.mock.calls[0][0].data;
    // 模型里没有这些字段，也不该被硬编码进来
    expect(data).not.toHaveProperty('severity');
    expect(data).not.toHaveProperty('allergenType');
    expect(data).not.toHaveProperty('discoveryDate');
    expect(data).not.toHaveProperty('confirmedBy');
    // 来源留痕放在 notes 里
    expect(String(data.notes)).toContain('定制需求');
  });

  it('已存在的过敏原不重复写入', async () => {
    mockPrismaService.allergyRecord.findFirst.mockResolvedValue({
      id: 'existing',
    });

    await submit({ allergies: ['鸡肉'] });

    expect(allergyCreate).not.toHaveBeenCalled();
  });

  it('同一批多个过敏原每个都写一条', async () => {
    await submit({ allergies: ['鸡肉', '牛肉'] });

    expect(allergyCreate).toHaveBeenCalledTimes(2);
    expect(allergyCreate.mock.calls.map((c) => c[0].data.allergen)).toEqual([
      '鸡肉',
      '牛肉',
    ]);
  });

  it('syncToHealthProfile 关掉时完全不碰档案', async () => {
    await submit({ allergies: ['鸡肉'], syncToHealthProfile: false });

    expect(allergyCreate).not.toHaveBeenCalled();
    expect(medicalCreate).not.toHaveBeenCalled();
  });

  it('同步成功后会在订单上留同步时间', async () => {
    await submit({ allergies: ['鸡肉'] });

    expect(mockPrismaService.customRecipeOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          healthInfoSyncedAt: expect.any(Date),
        }),
      }),
    );
  });
});

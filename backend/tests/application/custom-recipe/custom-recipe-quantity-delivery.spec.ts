import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import {
  CustomRecipeConfigService,
  DEFAULT_MULTI_RECIPE_DISCOUNTS,
} from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { TimezoneUtil } from '../../../src/utils/timezone.util';
import { CustomRecipeStatus, TargetGoal } from '@prisma/client';

/**
 * 多份购买 · 交付日期与排期产能（2026-10-21 · 第二阶段地基）
 *
 * 第一阶段只解决了「买 N 份要付多少钱」。这一批解决「N 份要占几天、
 * 要占掉当天多少产能」：
 *   · 交期 = ceil(基础工作日 + (N-1) × 每份工时 / 每日工时)，最少 1 天；
 *   · 排期要找到**剩余产能足够 N 份**的那一天，而不是只找"还有 1 个空位"；
 *   · 占用/释放都按 recipeQuantity，不能让一张 5 份订单只占 1 个名额。
 *
 * 日期固定在上海时区的 2026-10-19（周一），避免测试随真实时间漂移。
 */

jest.mock('../../../src/utils/date-helpers', () => {
  const actual = jest.requireActual('../../../src/utils/date-helpers');
  return {
    ...actual,
    // 假期判断会联网查第三方接口，测试必须钉死
    isPublicHoliday: jest.fn().mockResolvedValue(false),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dateHelpers = require('../../../src/utils/date-helpers');

const dayKey = (date: Date) => TimezoneUtil.toShanghaiDateString(date);

describe('CustomRecipeService · 按份数计算交期与产能', () => {
  let service: CustomRecipeService;
  let config: Record<string, any>;

  const orderCreate = jest.fn();
  const orderFindUnique = jest.fn();
  const orderFindFirst = jest.fn();
  const orderUpdateMany = jest.fn();
  const scheduleFindUnique = jest.fn();
  const scheduleUpdateMany = jest.fn();
  const dogFindFirst = jest.fn();

  /** 每个测试自己往这张表里放「这一天已经占了多少份」 */
  const schedules = new Map<string, any>();

  const mockPrismaService = {
    dog: { findFirst: dogFindFirst },
    customRecipeOrder: {
      create: orderCreate,
      findUnique: orderFindUnique,
      findFirst: orderFindFirst,
      updateMany: orderUpdateMany,
      update: jest.fn(),
    },
    customRecipeSchedule: {
      findUnique: scheduleFindUnique,
      createMany: jest.fn(async ({ data }: any) => {
        for (const row of data || []) {
          if (!schedules.has(dayKey(row.date))) {
            schedules.set(dayKey(row.date), { ...row });
          }
        }
        return { count: (data || []).length };
      }),
      updateMany: scheduleUpdateMany,
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const buildConfig = (overrides: Record<string, unknown> = {}) => ({
    feeAmount: 300,
    deliveryWorkDays: 1,
    dailyCapacity: 5,
    paymentTimeoutMinutes: 30,
    multiRecipeEnabled: true,
    maxRecipeQuantity: 5,
    multiRecipeDiscounts: DEFAULT_MULTI_RECIPE_DISCOUNTS.map((tier) => ({
      ...tier,
    })),
    dailyDesignMinutes: 480,
    minutesPerRecipe: 96,
    scheduleLookaheadDays: 45,
    slotRetryTimes: 5,
    ...overrides,
  });

  const baseDto = () => ({
    customerId: 'user-1',
    dogId: 'dog-1',
    targetGoal: TargetGoal.MAINTAIN,
    allergies: [],
    allergyStatus: 'NO_ALLERGY',
    currentFoodMain: 'DRY',
    changeReasons: ['HEALTHIER'],
    medicalConditions: [],
    preferredIngredients: [],
    dislikedIngredients: [],
    syncToHealthProfile: false,
  });

  const submit = (overrides: Record<string, unknown> = {}) =>
    service.createOrder({ ...baseDto(), ...overrides } as any);

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-19T00:00:00.000Z'));
    jest.clearAllMocks();
    schedules.clear();
    config = buildConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        CustomRecipePricingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        {
          provide: CustomRecipeConfigService,
          useValue: { getConfig: jest.fn(async () => config) },
        },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    dateHelpers.isPublicHoliday.mockResolvedValue(false);

    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrismaService),
    );

    dogFindFirst.mockResolvedValue({ id: 'dog-1', ownerId: 'user-1' });
    orderFindUnique.mockResolvedValue(null);
    orderFindFirst.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202610190001',
    });
    orderUpdateMany.mockResolvedValue({ count: 1 });
    orderCreate.mockImplementation(async ({ data }: any) => ({
      id: 'cr-uuid-1',
      orderId: 'CR202610190001',
      ...data,
    }));

    scheduleFindUnique.mockImplementation(
      async ({ where }: any) => schedules.get(dayKey(where.date)) ?? null,
    );
    scheduleUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------- 1. 工作日公式 ----------

  it('基础 1 天时，1/2/5 份分别需要 1/2/2 个工作日', () => {
    expect(service.calculateDeliveryWorkDays(1, config as any)).toBe(1);
    expect(service.calculateDeliveryWorkDays(2, config as any)).toBe(2);
    expect(service.calculateDeliveryWorkDays(5, config as any)).toBe(2);
  });

  it('基础 3 天时，5 份向上取整为 4 个工作日（3 + 0.8）', () => {
    config.deliveryWorkDays = 3;

    expect(service.calculateDeliveryWorkDays(5, config as any)).toBe(4);
  });

  it('每份工时变大时，份数会拉开工作日差距', () => {
    // 每日 96 分钟 = 每天只能设计 1 份：5 份 = 1 + 4 = 5 个工作日
    config.dailyDesignMinutes = 96;

    expect(service.calculateDeliveryWorkDays(1, config as any)).toBe(1);
    expect(service.calculateDeliveryWorkDays(2, config as any)).toBe(2);
    expect(service.calculateDeliveryWorkDays(5, config as any)).toBe(5);
  });

  // ---------- 2. 按份数找有足够产能的日期 ----------

  it('2 份能塞进当天剩 2 个名额的日子，交期按 2 个工作日算', async () => {
    schedules.set('2026-10-19', {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 3,
      capacity: 5,
    });

    const result = await service.getEstimatedDeliveryDate(2);

    expect(result).toEqual({
      quantity: 2,
      scheduledDate: '2026-10-19',
      estimatedDeliveryDate: '2026-10-21',
      deliveryWorkDays: 2,
    });
  });

  it('3 份塞不进只剩 2 个名额的日子，顺延到下一个有 3 个名额的工作日', async () => {
    schedules.set('2026-10-19', {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 3,
      capacity: 5,
    });

    const result = await service.getEstimatedDeliveryDate(3);

    expect(result.scheduledDate).toBe('2026-10-20');
    expect(result.estimatedDeliveryDate).toBe('2026-10-22');
    expect(result.deliveryWorkDays).toBe(2);
  });

  it('5 份只看剩余产能 >= 5 的整天，不接受"还有 1 个空位"', async () => {
    schedules.set('2026-10-19', {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 1,
      capacity: 5,
    });
    schedules.set('2026-10-20', {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 4,
      capacity: 5,
    });

    const result = await service.getEstimatedDeliveryDate(5);

    expect(result.scheduledDate).toBe('2026-10-21');
    expect(result.estimatedDeliveryDate).toBe('2026-10-23');
  });

  it('交期计算跳过周末', async () => {
    // 周五下单：基础 1 天 -> 下周一交付，不能算成周六
    jest.setSystemTime(new Date('2026-10-23T00:00:00.000Z'));

    const result = await service.getEstimatedDeliveryDate(1);

    expect(result.scheduledDate).toBe('2026-10-23');
    expect(result.estimatedDeliveryDate).toBe('2026-10-26');
  });

  it('排期跳过公众假期', async () => {
    dateHelpers.isPublicHoliday.mockImplementation(
      async (date: Date) => dayKey(date) === '2026-10-19',
    );

    const result = await service.getEstimatedDeliveryDate(1);

    // 周一放假，不能把周一当开工日
    expect(result.scheduledDate).toBe('2026-10-20');
    expect(result.estimatedDeliveryDate).toBe('2026-10-21');
  });

  // ---------- 3. 下单按份数占产能 ----------

  it('3 份订单占 3 个名额，并按 2 个工作日写 estimatedDeliveryDate', async () => {
    schedules.set('2026-10-19', {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 2,
      capacity: 5,
    });

    const order = await submit({ recipeQuantity: 3 });

    expect(dayKey(order.scheduledDate)).toBe('2026-10-19');
    expect(dayKey(order.estimatedDeliveryDate)).toBe('2026-10-21');
    expect(scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: new Date('2026-10-19T00:00:00.000Z'),
          bookedCount: 2,
        }),
        data: { bookedCount: { increment: 3 } },
      }),
    );
  });

  it('当天只剩 2 个名额时不接 3 份订单，改排到下一天', async () => {
    schedules.set('2026-10-19', {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 3,
      capacity: 5,
    });

    const order = await submit({ recipeQuantity: 3 });

    expect(dayKey(order.scheduledDate)).toBe('2026-10-20');
    const booked = scheduleUpdateMany.mock.calls.find(
      (call: any[]) => call[0]?.data?.bookedCount?.increment === 3,
    );
    expect(booked).toBeTruthy();
    expect(booked![0].where.date).toEqual(new Date('2026-10-20T00:00:00.000Z'));
  });

  it('并发抢输（CAS 没抢到）时换下一天，不会超卖也不会多占', async () => {
    schedules.set('2026-10-19', {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 1,
      capacity: 5,
    });
    scheduleUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });

    const order = await submit({ recipeQuantity: 4 });

    expect(dayKey(order.scheduledDate)).toBe('2026-10-20');
    expect(orderCreate).toHaveBeenCalledTimes(1);
    // 两次抢位都按 4 份尝试，第二天的 CAS 才成功
    expect(
      scheduleUpdateMany.mock.calls.filter(
        (call: any[]) => call[0]?.data?.bookedCount?.increment === 4,
      ),
    ).toHaveLength(2);
  });

  // ---------- 4. 取消 / 超时按份数释放 ----------

  it('超时关单按 recipeQuantity 释放名额', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      status: CustomRecipeStatus.PENDING_PAYMENT,
      scheduledDate: new Date('2026-10-19T00:00:00.000Z'),
      recipeQuantity: 3,
      allergyReportDrafts: [],
    });

    const result = await service.cancelOrder('CR202610190001', {
      reason: '支付超时',
    });

    expect(result).toEqual({ cancelled: true });
    expect(scheduleUpdateMany).toHaveBeenCalledWith({
      where: {
        date: new Date('2026-10-19T00:00:00.000Z'),
        bookedCount: { gte: 3 },
      },
      data: { bookedCount: { decrement: 3 } },
    });
  });

  it('顾客取消已付款的 2 份订单时释放 2 个名额', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202610190001',
      customerId: 'user-1',
      status: CustomRecipeStatus.PAID,
      scheduledDate: new Date('2026-10-19T00:00:00.000Z'),
      recipeQuantity: 2,
      allergyReportDrafts: [],
    });

    const result = await service.cancelOrderByCustomer(
      'CR202610190001',
      'user-1',
      jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    );

    expect(result.cancelled).toBe(true);
    expect(scheduleUpdateMany).toHaveBeenCalledWith({
      where: {
        date: new Date('2026-10-19T00:00:00.000Z'),
        bookedCount: { gte: 2 },
      },
      data: { bookedCount: { decrement: 2 } },
    });
  });

  it('退款失败回滚取消时，按 2 份重新占回名额', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202610190001',
      customerId: 'user-1',
      status: CustomRecipeStatus.PAID,
      scheduledDate: new Date('2026-10-19T00:00:00.000Z'),
      recipeQuantity: 2,
      allergyReportDrafts: [],
    });

    await expect(
      service.cancelOrderByCustomer(
        'CR202610190001',
        'user-1',
        jest.fn().mockRejectedValue(new Error('退款通道不可用')),
      ),
    ).rejects.toThrow('退款通道不可用');

    expect(scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bookedCount: { increment: 2 } },
      }),
    );
  });

  it('后台直接把订单改成已取消时，也按份数释放名额', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      status: CustomRecipeStatus.PAID,
      scheduledDate: new Date('2026-10-19T00:00:00.000Z'),
      recipeQuantity: 2,
    });

    await service.updateOrderStatus(
      'CR202610190001',
      CustomRecipeStatus.CANCELLED,
      { reason: '顾客改主意' },
    );

    expect(scheduleUpdateMany).toHaveBeenCalledWith({
      where: {
        date: new Date('2026-10-19T00:00:00.000Z'),
        bookedCount: { gte: 2 },
      },
      data: { bookedCount: { decrement: 2 } },
    });
  });

  it('老订单没有 recipeQuantity 时仍按 1 份释放，不会卡住名额', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      status: CustomRecipeStatus.PENDING_PAYMENT,
      scheduledDate: new Date('2026-10-19T00:00:00.000Z'),
      allergyReportDrafts: [],
    });

    await service.cancelOrder('CR202610190001', { reason: '支付超时' });

    expect(scheduleUpdateMany).toHaveBeenCalledWith({
      where: {
        date: new Date('2026-10-19T00:00:00.000Z'),
        bookedCount: { gte: 1 },
      },
      data: { bookedCount: { decrement: 1 } },
    });
  });
});

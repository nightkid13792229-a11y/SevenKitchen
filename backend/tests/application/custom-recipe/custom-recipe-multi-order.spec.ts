import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import {
  CustomRecipeConfigService,
  DEFAULT_MULTI_RECIPE_DISCOUNTS,
} from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { TargetGoal } from '@prisma/client';

/**
 * 多份定制下单（2026-10-20 · 第一阶段 Task 3）
 *
 * 这里锁死三件「错了就会让顾客付错钱」的事：
 *   · 下单金额必须来自 CustomRecipePricingService.quote()，不能采信前端传的金额；
 *   · 份数、肉类偏好必须在服务端校验（6 份 / 0 份 / 重复肉 / 数量对不上都要拒绝）；
 *   · 价格、折扣、原价、应付必须快照进订单，且快照里不能出现抵扣字段。
 */

jest.mock('../../../src/utils/date-helpers', () => {
  const actual = jest.requireActual('../../../src/utils/date-helpers');
  return {
    ...actual,
    // 假期判断会联网查第三方接口，测试必须钉死，否则会随网络抖动
    isPublicHoliday: jest.fn().mockResolvedValue(false),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dateHelpers = require('../../../src/utils/date-helpers');

describe('CustomRecipeService · 多份下单与价格快照', () => {
  let service: CustomRecipeService;
  let config: Record<string, any>;

  const orderCreate = jest.fn();
  const orderFindUnique = jest.fn();
  const scheduleFindUnique = jest.fn();
  const scheduleUpdateMany = jest.fn();

  const mockPrismaService = {
    dog: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'dog-1', ownerId: 'user-1' }),
    },
    customRecipeOrder: {
      findUnique: orderFindUnique,
      create: orderCreate,
    },
    customRecipeSchedule: {
      findUnique: scheduleFindUnique,
      createMany: jest.fn(),
      updateMany: scheduleUpdateMany,
    },
    $transaction: jest.fn(),
  } as any;

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
    jest.clearAllMocks();

    config = {
      feeAmount: 300,
      deliveryWorkDays: 3,
      dailyCapacity: 5,
      paymentTimeoutMinutes: 30,
      multiRecipeEnabled: true,
      maxRecipeQuantity: 5,
      multiRecipeDiscounts: DEFAULT_MULTI_RECIPE_DISCOUNTS.map((tier) => ({
        ...tier,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        // 用真实的报价服务：金额 828 / 72 这类断言才有意义
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
    // generateUniqueOrderId 会按 orderId 查重；idempotency 也走 findUnique
    orderFindUnique.mockResolvedValue(null);
    scheduleFindUnique.mockResolvedValue({
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 0,
      capacity: 5,
    });
    scheduleUpdateMany.mockResolvedValue({ count: 1 });
    orderCreate.mockImplementation(async ({ data }: any) => ({
      id: 'cr-uuid-1',
      orderId: 'CR202610200001',
      ...data,
    }));
  });

  it('3 份订单按 8% 折扣生成快照，应付 828 且不采信客户端金额', async () => {
    const order = await submit({
      recipeQuantity: 3,
      requestedProteinCodes: ['CHICKEN', 'BEEF', 'SALMON'],
      // 前端传什么金额都不算数：服务端必须重新报价
      amount: 1,
      unitAmount: 1,
      payableAmount: 1,
    });

    expect(order.amount).toBe(828);
    expect(order.recipeQuantity).toBe(3);
    expect(order.requestedProteinCodes).toEqual(['CHICKEN', 'BEEF', 'SALMON']);
    expect(order.unitAmount).toBe(300);
    expect(order.originalAmount).toBe(900);
    expect(order.discountRate).toBe(0.08);
    expect(order.discountAmount).toBe(72);

    // 快照字段集合必须精确：不能混进 credit / deduction 之类抵扣字段
    expect(order.pricingSnapshot).toEqual({
      quantity: 3,
      unitAmount: 300,
      originalAmount: 900,
      discountRate: 0.08,
      discountAmount: 72,
      payableAmount: 828,
    });

    expect(orderCreate).toHaveBeenCalledTimes(1);
    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipeQuantity: 3,
          requestedProteinCodes: ['CHICKEN', 'BEEF', 'SALMON'],
          amount: 828,
          unitAmount: 300,
          originalAmount: 900,
          discountRate: 0.08,
          discountAmount: 72,
        }),
      }),
    );
  });

  it('拒绝 6 份、0 份和非整数份数，且不落订单', async () => {
    await expect(submit({ recipeQuantity: 6 })).rejects.toThrow('份数');
    await expect(submit({ recipeQuantity: 0 })).rejects.toThrow('份数');
    await expect(submit({ recipeQuantity: 1.5 })).rejects.toThrow('份数');

    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('多份开关关闭时拒绝 quantity > 1，但 1 份照常下单', async () => {
    config.multiRecipeEnabled = false;

    await expect(submit({ recipeQuantity: 2 })).rejects.toThrow(
      '多份购买暂未开放',
    );
    expect(orderCreate).not.toHaveBeenCalled();

    // 1 份不受开关影响：金额、份数、折扣都保持老行为
    const order = await submit();
    expect(order.amount).toBe(300);
    expect(order.recipeQuantity).toBe(1);
    expect(order.requestedProteinCodes).toEqual([]);
    expect(order.discountRate).toBe(0);
    expect(order.discountAmount).toBe(0);
    expect(order.pricingSnapshot).toEqual({
      quantity: 1,
      unitAmount: 300,
      originalAmount: 300,
      discountRate: 0,
      discountAmount: 0,
      payableAmount: 300,
    });
  });

  it('拒绝重复、数量不符或为空的肉类偏好，且不落订单', async () => {
    await expect(
      submit({
        recipeQuantity: 2,
        requestedProteinCodes: ['CHICKEN', 'CHICKEN'],
      }),
    ).rejects.toThrow('肉类');

    await expect(
      submit({
        recipeQuantity: 3,
        requestedProteinCodes: ['CHICKEN', 'BEEF'],
      }),
    ).rejects.toThrow('肉类');

    await expect(
      submit({
        recipeQuantity: 2,
        requestedProteinCodes: ['CHICKEN', '   '],
      }),
    ).rejects.toThrow('肉类');

    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('数量与份数一致的肉类偏好允许留空（交给营养师搭配）', async () => {
    const order = await submit({ recipeQuantity: 2 });

    expect(order.amount).toBe(570);
    expect(order.requestedProteinCodes).toEqual([]);
    expect(order.pricingSnapshot).toMatchObject({
      quantity: 2,
      discountRate: 0.05,
      discountAmount: 30,
      payableAmount: 570,
    });
  });
});

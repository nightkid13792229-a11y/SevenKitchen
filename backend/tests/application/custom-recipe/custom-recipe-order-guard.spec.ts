import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { TargetGoal } from '@prisma/client';
import { TimezoneUtil } from '../../../src/utils/timezone.util';

/**
 * 定制单「自动排期 + 名额抢占 + 附件归属」守卫（2026-10-04）
 *
 * 这一批修的三件事，都属于"不测就不知道有没有真的修好"的类型：
 *
 *   ① 老板口径 1：顾客不再选日期，系统排最近的可接单工作日。
 *      原来前端把日期写死成"今天"，后端一回"该日期已约满，请选择其他日期"，
 *      顾客**无处可选**，只能流失。
 *   ② 超卖：原来先读余量、再无条件 +1，并发提交能冲破每日上限。
 *      现在改成 CAS，抢不到就换一天重试。
 *   ③ 越权：附件上传此前不校验订单归属，任何登录顾客都能往别人单子里塞文件。
 */
jest.mock('../../../src/utils/date-helpers', () => {
  const actual = jest.requireActual('../../../src/utils/date-helpers');
  return {
    ...actual,
    // 假期判断要联网查第三方接口，测试里必须钉死，否则测试会随网络抖动
    isPublicHoliday: jest.fn().mockResolvedValue(false),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dateHelpers = require('../../../src/utils/date-helpers');

describe('CustomRecipeService · 自动排期与名额抢占', () => {
  let service: CustomRecipeService;

  const scheduleFindUnique = jest.fn();
  const scheduleCreateMany = jest.fn();
  const scheduleUpdateMany = jest.fn();
  const orderCreate = jest.fn();
  const orderFindUnique = jest.fn();
  const orderFindFirst = jest.fn();

  /** 按日期存一份"排期现状"，让 findUnique 能按天返回不同结果 */
  let scheduleByDay: Record<string, any>;

  const mockPrismaService = {
    dog: {
      findFirst: jest.fn().mockResolvedValue({ id: 'dog-1', ownerId: 'user-1' }),
    },
    customRecipeSchedule: {
      findUnique: scheduleFindUnique,
      createMany: scheduleCreateMany,
      updateMany: scheduleUpdateMany,
    },
    customRecipeOrder: {
      findUnique: orderFindUnique,
      findFirst: orderFindFirst,
      create: orderCreate,
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  } as any;

  const shanghaiToday = () => TimezoneUtil.toShanghaiDateString(new Date());

  const dayKey = (offsetDays: number) => {
    const base = new Date(`${shanghaiToday()}T00:00:00.000Z`);
    const shifted = new Date(base.getTime() + offsetDays * 86400000);
    return TimezoneUtil.toShanghaiDateString(shifted);
  };

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
              creditAmount: 150,
              deliveryWorkDays: 3,
              dailyCapacity: 5,
              paymentTimeoutMinutes: 30,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    jest.clearAllMocks();
    dateHelpers.isPublicHoliday.mockResolvedValue(false);

    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrismaService),
    );

    scheduleByDay = {};
    scheduleFindUnique.mockImplementation(async ({ where }: any) => {
      const key = TimezoneUtil.toShanghaiDateString(where.date);
      return scheduleByDay[key] ?? null;
    });
    scheduleCreateMany.mockImplementation(async ({ data }: any) => {
      /**
       * 真实 Prisma 里 createMany 之后这行就存在了，后续 findUnique 必须能读到，
       * 否则"首次访问某天"的分支永远走不通（mock 要跟真实行为一致）。
       */
      for (const row of data) {
        const key = TimezoneUtil.toShanghaiDateString(row.date);
        if (!scheduleByDay[key]) {
          scheduleByDay[key] = { ...row };
        }
      }
      return { count: data.length };
    });
    // 默认：名额抢得到
    scheduleUpdateMany.mockResolvedValue({ count: 1 });
    orderFindUnique.mockResolvedValue(null); // 订单号不撞号
    orderCreate.mockImplementation(async ({ data }: any) => ({
      id: 'cr-uuid-1',
      orderId: 'CR202610040001',
      ...data,
    }));
  });

  const submit = (overrides: Record<string, unknown> = {}) =>
    service.createOrder({
      customerId: 'user-1',
      dogId: 'dog-1',
      targetGoal: TargetGoal.MAINTAIN,
      allergies: [],
      medicalConditions: [],
      preferredIngredients: [],
      dislikedIngredients: [],
      syncToHealthProfile: false,
      // 顾客（老版本小程序）传来的日期必须**不被采信**
      scheduledDate: new Date('2020-01-01'),
      ...overrides,
    } as any);

  it('当天可约就排当天，且不采信顾客传来的日期', async () => {
    const order = await submit();

    expect(TimezoneUtil.toShanghaiDateString(order.scheduledDate)).toBe(
      shanghaiToday(),
    );
    expect(orderCreate).toHaveBeenCalledTimes(1);
  });

  it('当天已约满就顺延到下一天（顾客不再撞上"请选择其他日期"的死路）', async () => {
    scheduleByDay[dayKey(0)] = {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 5,
      capacity: 5,
    };

    const order = await submit();

    expect(TimezoneUtil.toShanghaiDateString(order.scheduledDate)).toBe(
      dayKey(1),
    );
  });

  it('遇公众假期自动跳过，排到假期之后', async () => {
    dateHelpers.isPublicHoliday.mockImplementation(async (date: Date) => {
      return TimezoneUtil.toShanghaiDateString(date) === dayKey(0);
    });

    const order = await submit();

    expect(TimezoneUtil.toShanghaiDateString(order.scheduledDate)).toBe(
      dayKey(1),
    );
  });

  it('⚠️ 并发抢名额抢输时换一天重试，而不是把订单落到已满的那天', async () => {
    // 第一次 CAS 失败（别人先抢走），第二次成功
    scheduleUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });

    const order = await submit();

    expect(TimezoneUtil.toShanghaiDateString(order.scheduledDate)).toBe(
      dayKey(1),
    );
    expect(orderCreate).toHaveBeenCalledTimes(1);
  });

  it('连续抢不到名额时给出明确错误，而不是静默失败', async () => {
    scheduleUpdateMany.mockResolvedValue({ count: 0 });

    await expect(submit()).rejects.toThrow(ConflictException);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('占位用的条件更新带着读到的 bookedCount 原值（CAS 的关键）', async () => {
    scheduleByDay[dayKey(0)] = {
      isAvailable: true,
      isPublicHoliday: false,
      bookedCount: 2,
      capacity: 5,
    };

    await submit();

    expect(scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookedCount: 2,
          isAvailable: true,
          isPublicHoliday: false,
        }),
        data: { bookedCount: { increment: 1 } },
      }),
    );
  });
});

describe('CustomRecipeService · 一键交付已设计好的食谱', () => {
  let service: CustomRecipeService;

  const orderFindFirst = jest.fn();
  const orderFindUnique = jest.fn();
  const orderUpdate = jest.fn();
  const recipeFindFirst = jest.fn();
  const recipeFindMany = jest.fn();

  const mockPrismaService = {
    customRecipeOrder: {
      findFirst: orderFindFirst,
      findUnique: orderFindUnique,
      update: orderUpdate,
    },
    recipe: {
      findFirst: recipeFindFirst,
      findMany: recipeFindMany,
    },
  } as any;

  const baseOrder = {
    id: 'cr-uuid-1',
    orderId: 'CR202610040001',
    customerId: 'user-1',
    dogId: 'dog-1',
    status: 'PAID',
    recipeId: null,
  };

  const baseRecipe = {
    id: 'recipe-pk-1',
    recipeId: 'CR1759000000000',
    name: '专属鲜食',
    isCustomRecipe: true,
    customerOwnerId: 'user-1',
    customerDogId: 'dog-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        { provide: CustomRecipeConfigService, useValue: { getConfig: jest.fn() } },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    jest.clearAllMocks();

    orderFindFirst.mockResolvedValue({
      id: baseOrder.id,
      orderId: baseOrder.orderId,
    });
    orderFindUnique.mockResolvedValue({ ...baseOrder });
    orderUpdate.mockResolvedValue({});
    recipeFindFirst.mockResolvedValue({ ...baseRecipe });
  });

  it('把设计器做好的食谱交付到订单：订单挂上食谱并转已交付', async () => {
    const result = await service.deliverExistingRecipe(
      'CR202610040001',
      'CR1759000000000',
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cr-uuid-1' },
        data: expect.objectContaining({
          recipeId: 'recipe-pk-1',
          status: 'DELIVERED',
        }),
      }),
    );
    expect(result.recipeBizId).toBe('CR1759000000000');
    expect(result.redelivered).toBe(false);
  });

  it('主键和业务编号都能用来指定食谱', async () => {
    await service.deliverExistingRecipe('CR202610040001', 'recipe-pk-1');

    expect(recipeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ recipeId: 'recipe-pk-1' }, { id: 'recipe-pk-1' }] },
      }),
    );
  });

  it('⚠️ 不能交付别人家狗的食谱（这条隐私边界 2026-09-28 专门修过）', async () => {
    recipeFindFirst.mockResolvedValue({
      ...baseRecipe,
      customerDogId: 'dog-OTHER',
    });

    await expect(
      service.deliverExistingRecipe('CR202610040001', 'CR1759000000000'),
    ).rejects.toThrow('不属于该订单的顾客 / 狗狗');
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('不能交付非定制食谱（防止把公开食谱挂到定制单上）', async () => {
    recipeFindFirst.mockResolvedValue({ ...baseRecipe, isCustomRecipe: false });

    await expect(
      service.deliverExistingRecipe('CR202610040001', 'CR1759000000000'),
    ).rejects.toThrow('不属于该订单的顾客 / 狗狗');
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('待付款的订单不能交付（还没收到钱）', async () => {
    orderFindUnique.mockResolvedValue({
      ...baseOrder,
      status: 'PENDING_PAYMENT',
    });

    await expect(
      service.deliverExistingRecipe('CR202610040001', 'CR1759000000000'),
    ).rejects.toThrow('还没确认收款');
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('已取消的订单不能交付', async () => {
    orderFindUnique.mockResolvedValue({ ...baseOrder, status: 'CANCELLED' });

    await expect(
      service.deliverExistingRecipe('CR202610040001', 'CR1759000000000'),
    ).rejects.toThrow('已取消');
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('口径 4：已交付的订单可以重新交付，并且标明是重交', async () => {
    orderFindUnique.mockResolvedValue({
      ...baseOrder,
      status: 'DELIVERED',
      recipeId: 'recipe-pk-OLD',
    });

    const result = await service.deliverExistingRecipe(
      'CR202610040001',
      'CR1759000000000',
    );

    expect(result.redelivered).toBe(true);
    expect(orderUpdate).toHaveBeenCalled();
  });

  it('候选列表只给"这位顾客 + 这只狗"的定制食谱，并标出当前已挂的那道', async () => {
    orderFindUnique.mockResolvedValue({
      ...baseOrder,
      recipeId: 'recipe-pk-1',
    });
    recipeFindMany.mockResolvedValue([
      {
        id: 'recipe-pk-1',
        recipeId: 'CR1759000000000',
        name: '专属鲜食',
        version: 1,
        updatedAt: new Date('2026-10-04'),
      },
      {
        id: 'recipe-pk-2',
        recipeId: 'CR1759000000001',
        name: '专属鲜食 v2',
        version: 2,
        updatedAt: new Date('2026-10-03'),
      },
    ]);

    const list = await service.listDeliverableRecipes('CR202610040001');

    expect(recipeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isCustomRecipe: true,
          customerOwnerId: 'user-1',
          customerDogId: 'dog-1',
        },
      }),
    );
    expect(list[0].linkedToThisOrder).toBe(true);
    expect(list[1].linkedToThisOrder).toBe(false);
  });
});

describe('CustomRecipeService · 附件归属校验', () => {
  let service: CustomRecipeService;

  const orderFindFirst = jest.fn();
  const orderFindUnique = jest.fn();

  const mockPrismaService = {
    customRecipeOrder: {
      findFirst: orderFindFirst,
      findUnique: orderFindUnique,
    },
    $transaction: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        { provide: CustomRecipeConfigService, useValue: { getConfig: jest.fn() } },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    jest.clearAllMocks();
  });

  it('别人的订单：拒绝上传附件', async () => {
    orderFindFirst.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR1',
    });
    orderFindUnique.mockResolvedValue({ customerId: 'someone-else' });

    await expect(
      service.assertOrderOwnership('user-1', 'CR1'),
    ).rejects.toThrow('无权操作');
  });

  it('订单号不存在：返回业务错误，而不是让外键报 500', async () => {
    orderFindFirst.mockResolvedValue(null);

    await expect(
      service.assertOrderOwnership('user-1', 'CR-NOT-EXIST'),
    ).rejects.toThrow('定制订单不存在');
  });

  it('本人的订单：放行', async () => {
    orderFindFirst.mockResolvedValue({ id: 'cr-uuid-1', orderId: 'CR1' });
    orderFindUnique.mockResolvedValue({ customerId: 'user-1' });

    await expect(
      service.assertOrderOwnership('user-1', 'CR1'),
    ).resolves.toBeUndefined();
  });
});

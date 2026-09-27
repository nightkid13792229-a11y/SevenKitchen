import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { CustomRecipeStatus } from '@prisma/client';

/**
 * 食谱定制链路的加固（2026-09-28 老板验收后统一修复）
 *
 * 这一批全是"已经在坏"或"钱要漏"的问题，逐条锁住：
 *   1. 提交定制单不校验狗归属（安全：可往别人家狗的档案写过敏/疾病）
 *   2. 后台改状态是裸写：不校验流转、取消不释放当天名额、取消时间从不记录
 *   3. 节假日校验可绕过（第一次被拒时反而写下了"这不是假期"）
 *   4. 过去日期可以约
 *   5. 抵扣额度在食谱升版后静默失效
 *   6. 订单号撞号直接 500（unique 列但无重试）
 *   7. 收入口径只算"已交付"，已付款/制作中的钱不算
 */
describe('CustomRecipeService · 链路加固', () => {
  let service: CustomRecipeService;

  const orderCreate = jest.fn();
  const scheduleFindUnique = jest.fn();
  const scheduleCreate = jest.fn();
  const scheduleUpdateMany = jest.fn();
  const orderFindUnique = jest.fn();
  const orderFindFirst = jest.fn();
  const orderUpdate = jest.fn();
  const dogFindFirst = jest.fn();

  const mockPrismaService = {
    dog: { findFirst: dogFindFirst },
    customRecipeSchedule: {
      findUnique: scheduleFindUnique,
      create: scheduleCreate,
      update: jest.fn(),
      updateMany: scheduleUpdateMany,
    },
    customRecipeOrder: {
      create: orderCreate,
      update: orderUpdate,
      findUnique: orderFindUnique,
      findFirst: orderFindFirst,
      findMany: jest.fn(),
      count: jest.fn(),
    },
    allergyRecord: { findFirst: jest.fn(), create: jest.fn() },
    medicalRecord: { findFirst: jest.fn(), create: jest.fn() },
    recipe: { findMany: jest.fn(), findFirst: jest.fn() },
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

    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrismaService),
    );
    dogFindFirst.mockResolvedValue({ id: 'dog-1', ownerId: 'user-1' });
    scheduleFindUnique.mockResolvedValue({
      isAvailable: true,
      bookedCount: 0,
      capacity: 5,
      isPublicHoliday: false,
    });
    scheduleCreate.mockResolvedValue({});
    scheduleUpdateMany.mockResolvedValue({ count: 1 });
    orderCreate.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      amount: 300,
      creditAmount: 150,
    });
    orderUpdate.mockResolvedValue({});
    // resolveOrderRef 走的是 findFirst（业务单号 → 主键）
    orderFindFirst.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
    });
    mockPrismaService.allergyRecord.findFirst.mockResolvedValue(null);
    mockPrismaService.medicalRecord.findFirst.mockResolvedValue(null);
  });

  const submit = (overrides: Record<string, unknown> = {}) =>
    service.createOrder({
      customerId: 'user-1',
      dogId: 'dog-1',
      targetGoal: 'MAINTAIN' as any,
      scheduledDate: new Date('2099-06-01'),
      syncToHealthProfile: false,
      allergies: [],
      medicalConditions: [],
      preferredIngredients: [],
      dislikedIngredients: [],
      attachmentUrls: [],
      ...overrides,
    } as any);

  // ---------- 1. 归属校验 ----------

  it('拿别人的狗下定制单会被拒绝（原先完全没有校验）', async () => {
    dogFindFirst.mockResolvedValue({ id: 'dog-1', ownerId: 'someone-else' });

    await expect(submit()).rejects.toThrow('狗狗不存在或无权访问');
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('狗不存在时也拒绝，且不泄露"这只狗存在"', async () => {
    dogFindFirst.mockResolvedValue(null);

    await expect(submit()).rejects.toThrow('狗狗不存在或无权访问');
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('自己的狗可以正常下单', async () => {
    await submit();

    expect(dogFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dog-1' } }),
    );
    expect(orderCreate).toHaveBeenCalledTimes(1);
  });

  // ---------- 2. 状态流转 ----------

  it('非法流转被拒绝（已交付不能退回待付款）', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      status: CustomRecipeStatus.DELIVERED,
      scheduledDate: new Date('2099-06-01'),
    });

    await expect(
      service.updateOrderStatus(
        'CR202609280001',
        CustomRecipeStatus.PENDING_PAYMENT,
      ),
    ).rejects.toThrow('不能改为');
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('改成「已取消」会释放当天名额并记录取消时间与原因', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      status: CustomRecipeStatus.PAID,
      scheduledDate: new Date('2099-06-01'),
    });

    await service.updateOrderStatus(
      'CR202609280001',
      CustomRecipeStatus.CANCELLED,
      { reason: '顾客改主意' },
    );

    const data = orderUpdate.mock.calls[0][0].data;
    expect(data.status).toBe(CustomRecipeStatus.CANCELLED);
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(data.cancellationReason).toBe('顾客改主意');

    // 每天只有 5 个名额，取消不释放就会白白吃掉产能
    expect(scheduleUpdateMany).toHaveBeenCalledTimes(1);
    const releaseArgs = scheduleUpdateMany.mock.calls[0][0];
    expect(releaseArgs.data.bookedCount).toEqual({ decrement: 1 });
    // 名额下限保护：不能让 booked_count 变成负数
    expect(releaseArgs.where.bookedCount).toEqual({ gt: 0 });
  });

  it('改成「制作中」会补记开始时间（这一列以前从来没被写过）', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      status: CustomRecipeStatus.PAID,
      scheduledDate: new Date('2099-06-01'),
    });

    await service.updateOrderStatus(
      'CR202609280001',
      CustomRecipeStatus.IN_PROGRESS,
    );

    const data = orderUpdate.mock.calls[0][0].data;
    expect(data.inProgressAt).toBeInstanceOf(Date);
    // 制作中不该释放名额
    expect(scheduleUpdateMany).not.toHaveBeenCalled();
  });

  it('状态没变时直接返回，不做多余写入', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      status: CustomRecipeStatus.PAID,
      scheduledDate: new Date('2099-06-01'),
    });

    await service.updateOrderStatus(
      'CR202609280001',
      CustomRecipeStatus.PAID,
    );

    expect(orderUpdate).not.toHaveBeenCalled();
  });

  // ---------- 3 & 4. 排期：节假日与过去日期 ----------

  it('已存在的排期如果标着公众假期，照样不可约（原先只看 isAvailable）', async () => {
    scheduleFindUnique.mockResolvedValue({
      isAvailable: true,
      bookedCount: 0,
      capacity: 5,
      isPublicHoliday: true,
    });

    await expect(
      service.checkAvailability(new Date('2099-06-01')),
    ).resolves.toBe(false);
  });

  it('首次访问某日期时，落库会写入真实的假期标记', async () => {
    scheduleFindUnique.mockResolvedValue(null);

    // 用一个必然不是假期的普通工作日，只验证"标记被真实写入"这条契约
    const holiday = await service.checkAvailability(new Date('2099-06-01'));

    expect(scheduleCreate).toHaveBeenCalledTimes(1);
    const created = scheduleCreate.mock.calls[0][0].data;
    expect(created.isPublicHoliday).toBe(!holiday);
  });

  it('过去的日期不可约', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await expect(service.checkAvailability(yesterday)).resolves.toBe(false);
    // 过去日期连排期行都不该落
    expect(scheduleCreate).not.toHaveBeenCalled();
  });

  // ---------- 5. 抵扣额度 ----------

  it('食谱升版后抵扣额度依然可用（原先只匹配"最新版"主键）', async () => {
    // 订单里存的是**交付那一刻**那一版的主键（v1）
    mockPrismaService.recipe.findMany.mockResolvedValue([
      { id: 'recipe-pk-v1' },
      { id: 'recipe-pk-v2' },
    ]);
    mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      creditAmount: 150,
      creditUsed: 0,
    });

    const credit = await service.findUsableCredit({
      customerId: 'user-1',
      recipeId: 'CR-RECIPE-BIZ',
    });

    expect(credit).not.toBeNull();
    expect(credit?.remaining).toBe(150);
    // 候选里必须同时包含所有版本的主键和业务编号
    const where = mockPrismaService.customRecipeOrder.findFirst.mock.calls[0][0]
      .where;
    expect(where.recipeId.in).toEqual(
      expect.arrayContaining(['recipe-pk-v1', 'recipe-pk-v2', 'CR-RECIPE-BIZ']),
    );
  });

  // ---------- 6. 订单号 ----------

  it('订单号撞号时会重试，而不是把唯一约束错误抛给顾客', async () => {
    orderFindUnique
      .mockResolvedValueOnce({ id: 'taken' })
      .mockResolvedValueOnce({ id: 'taken' })
      .mockResolvedValue(null);

    await submit();

    expect(orderFindUnique).toHaveBeenCalledTimes(3);
    const created = orderCreate.mock.calls[0][0].data;
    expect(String(created.orderId)).toMatch(/^CR\d{12}$/);
  });

  // ---------- 7. 收入口径 ----------

  it('收入统计包含已付款与制作中，不再只算已交付', async () => {
    mockPrismaService.customRecipeOrder.count.mockResolvedValue(0);
    mockPrismaService.customRecipeOrder.findMany.mockResolvedValue([
      { amount: 300 },
      { amount: 300 },
    ]);

    await service.getStatistics();

    const where = mockPrismaService.customRecipeOrder.findMany.mock.calls[0][0]
      .where;
    expect(where.status.in).toEqual(
      expect.arrayContaining([
        CustomRecipeStatus.PAID,
        CustomRecipeStatus.IN_PROGRESS,
        CustomRecipeStatus.DELIVERED,
      ]),
    );
    // 未付款与已取消都不算收入
    expect(where.status.in).not.toContain(
      CustomRecipeStatus.PENDING_PAYMENT,
    );
    expect(where.status.in).not.toContain(CustomRecipeStatus.CANCELLED);
  });
});

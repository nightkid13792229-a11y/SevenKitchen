import { CustomRecipeStatus } from '@prisma/client';
import { decideAutoComplete } from '../../../src/domain/custom-recipe/custom-recipe.state';
import { CustomRecipeSchedulerService } from '../../../src/application/scheduler/custom-recipe-scheduler.service';
import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 自动完成 · 测试（2026-10-16，批次 4.1）
 *
 * ## 这组测试守的是"别在半夜批量改错状态"
 *
 * 定时任务的错**很难事后发现**：顾客不会因为订单被提前完成来投诉，
 * 他只会觉得"我还没确认怎么就完成了"。所以这里把边界**穷举**：
 * 没设闹钟、没到点、刚到点、已完成、已取消、待付款……
 */

describe('decideAutoComplete · 边界穷举', () => {
  const now = new Date('2026-10-20T12:00:00+08:00');

  it('到点且仍在等确认 → 该完成', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.DELIVERED,
      autoCompleteAt: new Date('2026-10-19T10:00:00+08:00'), // 昨天
      now,
    });
    expect(result.shouldComplete).toBe(true);
  });

  it('★ 差一秒都不完成（不能提前把顾客的单关掉）', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.DELIVERED,
      autoCompleteAt: new Date(now.getTime() + 1000),
      now,
    });
    expect(result.shouldComplete).toBe(false);
    expect(result.reason).toContain('还没到点');
  });

  it('刚好到点算到点（允许等于）', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.DELIVERED,
      autoCompleteAt: new Date(now.getTime()),
      now,
    });
    expect(result.shouldComplete).toBe(true);
  });

  it('★ 已经完成了不再"自动完成"一次（会覆盖 completedAt）', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.COMPLETED,
      autoCompleteAt: new Date('2026-10-19T10:00:00+08:00'),
      now,
    });
    expect(result.shouldComplete).toBe(false);
    expect(result.reason).toContain('已完成');
  });

  it('已取消的不动它', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.CANCELLED,
      autoCompleteAt: new Date('2026-10-19T10:00:00+08:00'),
      now,
    });
    expect(result.shouldComplete).toBe(false);
  });

  it('还没交付的没有"确认"可言', () => {
    for (const status of [
      CustomRecipeStatus.PENDING_PAYMENT,
      CustomRecipeStatus.PAID,
      CustomRecipeStatus.IN_PROGRESS,
    ]) {
      expect(
        decideAutoComplete({
          status,
          autoCompleteAt: new Date('2026-10-19T10:00:00+08:00'),
          now,
        }).shouldComplete,
      ).toBe(false);
    }
  });

  it('★ 没设闹钟就不完成（历史订单、或配置成"不自动完成"）', () => {
    for (const empty of [null, undefined]) {
      const result = decideAutoComplete({
        status: CustomRecipeStatus.DELIVERED,
        autoCompleteAt: empty,
        now,
      });
      expect(result.shouldComplete).toBe(false);
      expect(result.reason).toContain('没有设自动完成时间');
    }
  });

  it('每个"不完成"都给出人能看懂的原因（日志要答得出为什么没做）', () => {
    const cases = [
      { status: CustomRecipeStatus.COMPLETED, autoCompleteAt: null },
      { status: CustomRecipeStatus.CANCELLED, autoCompleteAt: new Date() },
      { status: CustomRecipeStatus.PAID, autoCompleteAt: new Date() },
    ];
    for (const c of cases) {
      const result = decideAutoComplete({ ...c, now });
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.shouldComplete).toBe(false);
    }
  });
});

describe('CustomRecipeSchedulerService · 批量处理', () => {
  function createScheduler(options: {
    candidates?: unknown[];
    confirmImpl?: (input: { orderIdOrId: string }) => Promise<{
      confirmed: boolean;
      alreadyConfirmed: boolean;
    }>;
  }) {
    const prisma = {
      customRecipeOrder: {
        findMany: jest.fn().mockResolvedValue(options.candidates ?? []),
      },
    };
    /**
     * ⚠️ 自定义实现也要包一层 `jest.fn` ——
     * 直接放一个普通函数进来就没有 `.mock`，断言调用参数时会炸。
     * （我第一版就是这么写的，测试红了才发现。）
     */
    const confirmReceipt = jest.fn(
      options.confirmImpl ??
        (async () => ({ confirmed: true, alreadyConfirmed: false })),
    );
    const deliveryService = { confirmReceipt };
    const service = new CustomRecipeSchedulerService(
      prisma as unknown as PrismaService,
      deliveryService as unknown as CustomRecipeDeliveryService,
    );
    return { service, prisma, deliveryService };
  }

  const due = (
    id: string,
    autoCompleteAt = new Date('2026-10-19T10:00:00+08:00'),
  ) => ({
    id: `pk-${id}`,
    orderId: id,
    status: CustomRecipeStatus.DELIVERED,
    autoCompleteAt,
  });

  it('到点的单会被完成，并标记渠道为 AUTO', async () => {
    const calls: string[] = [];
    const { service, deliveryService } = createScheduler({
      candidates: [due('CR1')],
      confirmImpl: async (input) => {
        calls.push(input.orderIdOrId);
        return { confirmed: true, alreadyConfirmed: false };
      },
    });

    const result = await service.autoCompleteDueOrders({
      now: new Date('2026-10-20T12:00:00+08:00'),
    });

    expect(result).toEqual({ scanned: 1, completed: 1, failed: 0 });
    expect(calls).toEqual(['CR1']);
    const arg = (deliveryService.confirmReceipt as jest.Mock).mock.calls[0][0];
    // 渠道标 AUTO，与顾客主动确认区分开
    expect(arg.channel).toBe('AUTO');
  });

  it('★ 顾客刚好自己确认过了：不算错、也不重复完成', async () => {
    const { service } = createScheduler({
      candidates: [due('CR1')],
      confirmImpl: async () => ({ confirmed: true, alreadyConfirmed: true }),
    });

    const result = await service.autoCompleteDueOrders({
      now: new Date('2026-10-20T12:00:00+08:00'),
    });

    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('★ 单条失败不影响其它单（一张单有问题不该让整批都不完成）', async () => {
    let index = 0;
    const { service } = createScheduler({
      candidates: [due('CR1'), due('CR2'), due('CR3')],
      confirmImpl: async () => {
        index += 1;
        if (index === 2) throw new Error('数据库连接超时');
        return { confirmed: true, alreadyConfirmed: false };
      },
    });

    const result = await service.autoCompleteDueOrders({
      now: new Date('2026-10-20T12:00:00+08:00'),
    });

    expect(result.scanned).toBe(3);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('只捞设了闹钟且状态是"已交付"的单（数据库层第一道网）', async () => {
    const { service, prisma } = createScheduler({ candidates: [] });

    await service.autoCompleteDueOrders({
      now: new Date('2026-10-20T12:00:00+08:00'),
    });

    const where = (prisma.customRecipeOrder.findMany as jest.Mock).mock
      .calls[0][0].where;
    expect(where.status).toBe(CustomRecipeStatus.DELIVERED);
    expect(where.autoCompleteAt).toEqual({
      not: null,
      lte: new Date('2026-10-20T12:00:00+08:00'),
    });
  });

  it('★ 领域层是第二道网：状态在扫描与处理之间被改掉时不再完成', async () => {
    const confirm = jest.fn();
    const { service } = createScheduler({
      // 数据库捞出来时是 DELIVERED，但处理前顾客点了确认
      candidates: [
        { ...due('CR1'), status: CustomRecipeStatus.COMPLETED },
      ],
      confirmImpl: confirm,
    });

    const result = await service.autoCompleteDueOrders({
      now: new Date('2026-10-20T12:00:00+08:00'),
    });

    expect(result.completed).toBe(0);
    // 一次写库都没有 —— 不能覆盖 completedAt（那是售后窗口的起算点）
    expect(confirm).not.toHaveBeenCalled();
  });

  it('分批：一次最多处理 batchSize 单（免得积压时一口气打几百条通知）', async () => {
    const { service, prisma } = createScheduler({ candidates: [] });

    await service.autoCompleteDueOrders({
      now: new Date('2026-10-20T12:00:00+08:00'),
      batchSize: 7,
    });

    expect((prisma.customRecipeOrder.findMany as jest.Mock).mock.calls[0][0].take).toBe(7);
  });

  it('没有到点的单时不报错、也不写库', async () => {
    const confirm = jest.fn();
    const { service } = createScheduler({ candidates: [], confirmImpl: confirm });

    const result = await service.autoCompleteDueOrders({});

    expect(result).toEqual({ scanned: 0, completed: 0, failed: 0 });
    expect(confirm).not.toHaveBeenCalled();
  });
});

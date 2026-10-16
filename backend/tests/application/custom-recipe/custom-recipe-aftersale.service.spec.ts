import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { CustomRecipeAftersaleService } from '../../../src/application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PlatformOptionsService } from '../../../src/application/platform-options/platform-options.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 定制售后 · 服务测试（2026-10-16，批次 2.5）
 *
 * ## 这组测试守着什么
 *
 * 售后是**顾客不满意的最后一道出口**。这里算错，顾客会觉得"提了也没用"：
 *
 *   ① **窗口**：交付后超过配置天数不许**新提**（但已提的照常处理到底）
 *   ② **去重**：同一条售后不许重复提（顾客提完没看到变化会再提一次，
 *      后台就会冒出两条一模一样的待办）
 *   ③ **归属**：别人的订单连"有没有售后"都不该知道
 */

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-pk-1',
    orderId: 'CR202610160001',
    customerId: 'customer-1',
    status: CustomRecipeStatus.COMPLETED,
    deliveredAt: new Date('2026-10-10T10:00:00+08:00'),
    ...overrides,
  };
}

function buildAftersale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aftersale-1',
    orderId: 'order-pk-1',
    deliveryId: 'delivery-1',
    type: 'ADJUST_RECIPE',
    status: 'PENDING',
    description: '吃了之后有点软便',
    photos: [],
    createdAt: new Date('2026-10-15T10:00:00+08:00'),
    acceptedAt: null,
    resolvedAt: null,
    handleNote: null,
    rejectReason: null,
    ...overrides,
  };
}

function createService(options: {
  order?: unknown;
  delivery?: unknown;
  openAftersale?: unknown;
  rows?: unknown[];
  windowDays?: number;
} = {}) {
  const prisma = {
    customRecipeOrder: {
      findFirst: jest.fn().mockResolvedValue(options.order ?? buildOrder()),
    },
    customRecipeDelivery: {
      findFirst: jest.fn().mockResolvedValue(
        'delivery' in options
          ? options.delivery
          : { id: 'delivery-1', deliveredAt: new Date('2026-10-10T10:00:00+08:00') },
      ),
    },
    customRecipeAftersale: {
      findFirst: jest.fn().mockResolvedValue(options.openAftersale ?? null),
      findMany: jest.fn().mockResolvedValue(options.rows ?? []),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'aftersale-new',
        status: 'PENDING',
        ...data,
      })),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const configService = {
    getConfig: jest.fn().mockResolvedValue({
      aftersaleWindowDays: options.windowDays ?? 30,
    }),
  };

  const platformOptions = {
    listSet: jest.fn().mockResolvedValue([
      { code: 'QUESTION', label: '问个问题' },
      { code: 'ADJUST_RECIPE', label: '调整食谱' },
      { code: 'OTHER', label: '其他意见' },
    ]),
  };

  const service = new CustomRecipeAftersaleService(
    prisma as unknown as PrismaService,
    configService as unknown as CustomRecipeConfigService,
    platformOptions as unknown as PlatformOptionsService,
  );

  return { service, prisma, configService, platformOptions };
}

describe('CustomRecipeAftersaleService · 提交售后', () => {
  it('正常提交：类型中文来自选项字典，状态是待受理', async () => {
    const { service } = createService();

    const result = await service.create({
      orderIdOrId: 'CR202610160001',
      customerId: 'customer-1',
      type: 'ADJUST_RECIPE',
      description: '吃了之后有点软便',
      now: new Date('2026-10-15T10:00:00+08:00'),
    });

    expect(result.status).toBe('PENDING');
    expect(result.statusLabel).toBe('待受理');
    // ⚠️ 中文来自字典，不是这里写死的
    expect(result.typeLabel).toBe('调整食谱');
  });

  it('★ 归属校验：别人的单不能提售后', async () => {
    const { service } = createService();

    await expect(
      service.create({
        orderIdOrId: 'CR202610160001',
        customerId: 'customer-别人',
        type: 'QUESTION',
        description: '随便问问',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('★ 还没交付不能提售后', async () => {
    const { service } = createService({ delivery: null });

    await expect(
      service.create({
        orderIdOrId: 'CR202610160001',
        customerId: 'customer-1',
        type: 'QUESTION',
        description: '随便问问',
      }),
    ).rejects.toThrow(/还没有交付/);
  });

  it('已取消的单不能提售后', async () => {
    const { service } = createService({
      order: buildOrder({ status: CustomRecipeStatus.CANCELLED }),
    });

    await expect(
      service.create({
        orderIdOrId: 'CR202610160001',
        customerId: 'customer-1',
        type: 'QUESTION',
        description: '随便问问',
      }),
    ).rejects.toThrow(/已取消/);
  });

  describe('★ 售后窗口（从交付时间起算）', () => {
    it('窗口内可以提', async () => {
      const { service } = createService({ windowDays: 30 });

      await expect(
        service.create({
          orderIdOrId: 'CR202610160001',
          customerId: 'customer-1',
          type: 'QUESTION',
          description: '窗口内',
          // 交付 2026-10-10，此刻 10-15，才 5 天
          now: new Date('2026-10-15T10:00:00+08:00'),
        }),
      ).resolves.toBeDefined();
    });

    it('超过窗口时拒绝，并写明窗口天数（顾客知道该找谁）', async () => {
      const { service } = createService({ windowDays: 30 });

      await expect(
        service.create({
          orderIdOrId: 'CR202610160001',
          customerId: 'customer-1',
          type: 'QUESTION',
          description: '太晚了',
          // 交付 10-10，此刻 12-01，超过 30 天
          now: new Date('2026-12-01T10:00:00+08:00'),
        }),
      ).rejects.toThrow(/超过售后受理期（交付后 30 天内）/);
    });

    it('窗口为 0 表示不限期', async () => {
      const { service } = createService({ windowDays: 0 });

      await expect(
        service.create({
          orderIdOrId: 'CR202610160001',
          customerId: 'customer-1',
          type: 'QUESTION',
          description: '不限期',
          now: new Date('2030-01-01T10:00:00+08:00'),
        }),
      ).resolves.toBeDefined();
    });
  });

  it('★ 同一条售后不许重复提（顾客没看到变化会再提一次）', async () => {
    const { service } = createService({
      openAftersale: { id: 'aftersale-existing' },
    });

    await expect(
      service.create({
        orderIdOrId: 'CR202610160001',
        customerId: 'customer-1',
        type: 'QUESTION',
        description: '再提一次',
      }),
    ).rejects.toThrow(/正在处理中/);
  });

  it('说明不能是空白（后台收到一条空描述没法处理）', async () => {
    const { service } = createService();

    await expect(
      service.create({
        orderIdOrId: 'CR202610160001',
        customerId: 'customer-1',
        type: 'QUESTION',
        description: '   ',
      }),
    ).rejects.toThrow(/具体/);
  });

  it('订单不存在时报 404，不是 500', async () => {
    const { service, prisma } = createService();
    (prisma.customRecipeOrder.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.create({
        orderIdOrId: 'CR-没有',
        customerId: 'customer-1',
        type: 'QUESTION',
        description: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CustomRecipeAftersaleService · 顾客查看', () => {
  it('★ 返回的是能直接渲染的形态：中文、进度、能不能撤回都算好', async () => {
    const { service } = createService({
      rows: [buildAftersale({ status: 'PENDING' })],
    });

    const list = await service.listForCustomer('CR202610160001', 'customer-1');

    expect(list[0].statusLabel).toBe('待受理');
    expect(list[0].typeLabel).toBe('调整食谱');
    // 还没人受理 → 顾客可以撤回
    expect(list[0].canCancel).toBe(true);
    // 进度时间轴也一起给
    expect(list[0].progress.timeline).toHaveLength(3);
    expect(list[0].progress.current).toBe('SUBMITTED');
  });

  it('★ 已在处理时不能撤回（客服已经在忙了，抽走会白忙一轮）', async () => {
    const { service } = createService({
      rows: [buildAftersale({ status: 'PROCESSING', acceptedAt: new Date() })],
    });

    const list = await service.listForCustomer('CR202610160001', 'customer-1');

    expect(list[0].canCancel).toBe(false);
    expect(list[0].progress.current).toBe('ACCEPTED');
  });

  it('处理完的单：进度走到底、不能撤回', async () => {
    const { service } = createService({
      rows: [
        buildAftersale({
          status: 'RESOLVED',
          acceptedAt: new Date('2026-10-15T12:00:00+08:00'),
          resolvedAt: new Date('2026-10-16T12:00:00+08:00'),
        }),
      ],
    });

    const list = await service.listForCustomer('CR202610160001', 'customer-1');

    expect(list[0].statusLabel).toBe('已解决');
    expect(list[0].canCancel).toBe(false);
    expect(list[0].progress.current).toBe('RESOLVED');
  });

  it('被驳回时进度节点改叫「未受理 / 已结束」（不让顾客以为在等处理）', async () => {
    const { service } = createService({
      rows: [
        buildAftersale({
          status: 'REJECTED',
          acceptedAt: new Date('2026-10-15T12:00:00+08:00'),
          resolvedAt: new Date('2026-10-15T13:00:00+08:00'),
          rejectReason: '这不属于食谱问题，建议先看医生',
        }),
      ],
    });

    const list = await service.listForCustomer('CR202610160001', 'customer-1');

    expect(list[0].statusLabel).toBe('未受理');
    expect(list[0].rejectReason).toContain('建议先看医生');
    expect(list[0].progress.timeline.map((s) => s.label)).toEqual([
      '已提交',
      '未受理',
      '已结束',
    ]);
  });

  it('归属校验：别人的单看不了', async () => {
    const { service } = createService();

    await expect(
      service.listForCustomer('CR202610160001', 'customer-别人'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('CustomRecipeAftersaleService · 顾客撤回', () => {
  function createForCancel(row: unknown) {
    const prisma = {
      customRecipeAftersale: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new CustomRecipeAftersaleService(
      prisma as unknown as PrismaService,
      { getConfig: jest.fn() } as unknown as CustomRecipeConfigService,
      { listSet: jest.fn() } as unknown as PlatformOptionsService,
    );
    return { service, prisma };
  }

  it('待受理时可以撤回', async () => {
    const { service, prisma } = createForCancel({
      id: 'a1',
      status: 'PENDING',
      order: { customerId: 'customer-1' },
    });

    const result = await service.cancel({ aftersaleId: 'a1', customerId: 'customer-1' });

    expect(result.cancelled).toBe(true);
    const updateArg = (prisma.customRecipeAftersale.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArg.data.status).toBe('REJECTED');
    expect(updateArg.data.rejectReason).toBe('顾客自行撤回');
  });

  it('★ 已经在处理时不能撤回，并告诉顾客该怎么做', async () => {
    const { service } = createForCancel({
      id: 'a1',
      status: 'PROCESSING',
      order: { customerId: 'customer-1' },
    });

    await expect(
      service.cancel({ aftersaleId: 'a1', customerId: 'customer-1' }),
    ).rejects.toThrow(/已经在处理/);
  });

  it('处理完的不能撤回', async () => {
    const { service } = createForCancel({
      id: 'a1',
      status: 'RESOLVED',
      order: { customerId: 'customer-1' },
    });

    await expect(
      service.cancel({ aftersaleId: 'a1', customerId: 'customer-1' }),
    ).rejects.toThrow(/不需要撤回/);
  });

  it('不是自己的撤回不了', async () => {
    const { service } = createForCancel({
      id: 'a1',
      status: 'PENDING',
      order: { customerId: 'customer-别人' },
    });

    await expect(
      service.cancel({ aftersaleId: 'a1', customerId: 'customer-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

describe('CustomRecipeAftersaleService · 后台处理', () => {
  function createForStaff(options: {
    rows?: unknown[];
    row?: unknown;
  } = {}) {
    const prisma = {
      customRecipeAftersale: {
        findMany: jest.fn().mockResolvedValue(options.rows ?? []),
        findUnique: jest.fn().mockResolvedValue(options.row ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new CustomRecipeAftersaleService(
      prisma as unknown as PrismaService,
      { getConfig: jest.fn() } as unknown as CustomRecipeConfigService,
      {
        listSet: jest
          .fn()
          .mockResolvedValue([{ code: 'ADJUST_RECIPE', label: '调整食谱' }]),
      } as unknown as PlatformOptionsService,
    );
    return { service, prisma };
  }

  describe('★ 待办排序：等太久的排前面，"调整食谱"比"问个问题"急', () => {
    it('等得久的排在前面', async () => {
      const now = new Date('2026-10-16T12:00:00+08:00');
      const { service } = createForStaff({
        rows: [
          {
            id: 'a-new',
            orderId: 'o1',
            type: 'QUESTION',
            status: 'PENDING',
            description: 'x',
            photos: [],
            createdAt: new Date('2026-10-16T11:00:00+08:00'), // 等了 1 小时
            acceptedAt: null,
            resolvedAt: null,
            order: { orderId: 'CR1', customerId: 'c1', status: 'COMPLETED', dog: { name: '豆豆' }, customer: { nickname: '张三', phone: '138' } },
          },
          {
            id: 'a-old',
            orderId: 'o2',
            type: 'QUESTION',
            status: 'PENDING',
            description: 'y',
            photos: [],
            createdAt: new Date('2026-10-14T12:00:00+08:00'), // 等了两天
            acceptedAt: null,
            resolvedAt: null,
            order: { orderId: 'CR2', customerId: 'c2', status: 'COMPLETED', dog: { name: '旺财' }, customer: { nickname: '李四', phone: '139' } },
          },
        ],
      });

      const list = await service.listForStaff({ now });

      expect(list.map((item) => item.id)).toEqual(['a-old', 'a-new']);
      // 等了多久也要给出来，客服一眼看出哪条催得急
      expect(list[0].hoursWaiting).toBeGreaterThan(40);
    });

    it('★ 同等时长下，"调整食谱"比"问个问题"急（狗可能正在吃不对的饭）', async () => {
      const now = new Date('2026-10-16T12:00:00+08:00');
      const sameTime = new Date('2026-10-16T10:00:00+08:00');
      const { service } = createForStaff({
        rows: [
          {
            id: 'a-question',
            orderId: 'o1',
            type: 'QUESTION',
            status: 'PENDING',
            description: 'x',
            photos: [],
            createdAt: sameTime,
            acceptedAt: null,
            resolvedAt: null,
            order: { orderId: 'CR1', customerId: 'c1', status: 'COMPLETED', dog: null, customer: null },
          },
          {
            id: 'a-adjust',
            orderId: 'o2',
            type: 'ADJUST_RECIPE',
            status: 'PENDING',
            description: 'y',
            photos: [],
            createdAt: sameTime,
            acceptedAt: null,
            resolvedAt: null,
            order: { orderId: 'CR2', customerId: 'c2', status: 'COMPLETED', dog: null, customer: null },
          },
        ],
      });

      const list = await service.listForStaff({ now });

      expect(list.map((item) => item.id)).toEqual(['a-adjust', 'a-question']);
    });

    it('★ "催得急"由后端判定（前端原来自己判 status，那是业务判断）', async () => {
      const now = new Date('2026-10-16T12:00:00+08:00');
      const { service } = createForStaff({
        rows: [
          {
            id: 'a-fresh',
            orderId: 'o1',
            type: 'QUESTION',
            status: 'PENDING',
            description: 'x',
            photos: [],
            createdAt: new Date('2026-10-16T11:00:00+08:00'), // 1 小时
            acceptedAt: null,
            resolvedAt: null,
            order: { orderId: 'CR1', customerId: 'c1', status: 'COMPLETED', dog: null, customer: null },
          },
          {
            id: 'a-stale',
            orderId: 'o2',
            type: 'QUESTION',
            status: 'PENDING',
            description: 'y',
            photos: [],
            createdAt: new Date('2026-10-15T11:00:00+08:00'), // 25 小时
            acceptedAt: null,
            resolvedAt: null,
            order: { orderId: 'CR2', customerId: 'c2', status: 'COMPLETED', dog: null, customer: null },
          },
          {
            id: 'a-accepted',
            orderId: 'o3',
            type: 'QUESTION',
            status: 'ACCEPTED',
            description: 'z',
            photos: [],
            createdAt: new Date('2026-10-10T11:00:00+08:00'), // 很久了，但已受理
            acceptedAt: now,
            resolvedAt: null,
            order: { orderId: 'CR3', customerId: 'c3', status: 'COMPLETED', dog: null, customer: null },
          },
        ],
      });

      const list = await service.listForStaff({ now });
      const byId = Object.fromEntries(list.map((item) => [item.id, item]));

      // 25 小时且还没人受理 → 催得急
      expect(byId['a-stale'].isUrgent).toBe(true);
      // 才 1 小时 → 不急
      expect(byId['a-fresh'].isUrgent).toBe(false);
      // 已经受理了 → 不急（有人在处理了，标红只会干扰）
      expect(byId['a-accepted'].isUrgent).toBe(false);
    });

    it('默认只列未处理完的（客服要看"还有几件事没做"）', async () => {
      const { service, prisma } = createForStaff({ rows: [] });

      await service.listForStaff();

      const where = (prisma.customRecipeAftersale.findMany as jest.Mock).mock
        .calls[0][0].where;
      expect(where.status).toEqual({ in: ['PENDING', 'ACCEPTED', 'PROCESSING'] });
    });

    it('明确要看已关闭的时才带上它们', async () => {
      const { service, prisma } = createForStaff({ rows: [] });

      await service.listForStaff({ includeClosed: true });

      const where = (prisma.customRecipeAftersale.findMany as jest.Mock).mock
        .calls[0][0].where;
      expect(where.status).toBeUndefined();
    });

    it('★ 每条都带上"现在能做什么"，前端照着渲染', async () => {
      const { service } = createForStaff({
        rows: [
          {
            id: 'a1',
            orderId: 'o1',
            type: 'QUESTION',
            status: 'PENDING',
            description: 'x',
            photos: [],
            createdAt: new Date(),
            acceptedAt: null,
            resolvedAt: null,
            order: { orderId: 'CR1', customerId: 'c1', status: 'COMPLETED', dog: null, customer: null },
          },
        ],
      });

      const list = await service.listForStaff();

      const codes = list[0].actions.map((a: { code: string }) => a.code);
      expect(codes).toContain('ACCEPT');
      expect(codes).toContain('REJECT');
      // 待受理时还不能"处理完成"（得先受理）
      expect(codes).not.toContain('RESOLVE');
    });
  });

  describe('流转校验', () => {
    it('待受理 → 已受理', async () => {
      const { service, prisma } = createForStaff({
        row: { id: 'a1', status: 'PENDING' },
      });

      await service.accept({ aftersaleId: 'a1', handlerId: 'staff-1' });

      const arg = (prisma.customRecipeAftersale.update as jest.Mock).mock.calls[0][0];
      expect(arg.data.status).toBe('ACCEPTED');
      expect(arg.data.handlerId).toBe('staff-1');
      // 受理时间要记下来 —— 顾客的进度时间轴靠它
      expect(arg.data.acceptedAt).toBeInstanceOf(Date);
    });

    it('★ 已解决的不能再受理（终态不可回转）', async () => {
      const { service } = createForStaff({
        row: { id: 'a1', status: 'RESOLVED' },
      });

      await expect(
        service.accept({ aftersaleId: 'a1', handlerId: 'staff-1' }),
      ).rejects.toThrow(/不能改成/);
    });

    it('★ 处理说明必填 —— 顾客看到"已处理"却不知道处理了什么，等于没处理', async () => {
      const { service } = createForStaff({
        row: { id: 'a1', status: 'ACCEPTED' },
      });

      await expect(
        service.resolve({
          aftersaleId: 'a1',
          handlerId: 'staff-1',
          handleNote: '   ',
        }),
      ).rejects.toThrow(/请写一句给顾客的处理说明/);
    });

    it('★ 不受理的原因必填（顾客要知道为什么）', async () => {
      const { service } = createForStaff({
        row: { id: 'a1', status: 'PENDING' },
      });

      await expect(
        service.reject({ aftersaleId: 'a1', handlerId: 'staff-1', reason: '' }),
      ).rejects.toThrow(/请写明不受理的原因/);
    });

    it('处理完成时把说明与关联的新交付版本一起存下来', async () => {
      const { service, prisma } = createForStaff({
        row: { id: 'a1', status: 'PROCESSING' },
      });

      await service.resolve({
        aftersaleId: 'a1',
        handlerId: 'staff-1',
        handleNote: '已把鸡胸肉换成火鸡胸，重新交付了一版',
        linkedDeliveryId: 'delivery-2',
      });

      const arg = (prisma.customRecipeAftersale.update as jest.Mock).mock.calls[0][0];
      expect(arg.data.status).toBe('RESOLVED');
      expect(arg.data.handleNote).toContain('火鸡胸');
      expect(arg.data.linkedDeliveryId).toBe('delivery-2');
      expect(arg.data.resolvedAt).toBeInstanceOf(Date);
    });

    it('售后单不存在时报 404', async () => {
      const { service } = createForStaff({ row: null });

      await expect(
        service.accept({ aftersaleId: '不存在', handlerId: 's1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
});

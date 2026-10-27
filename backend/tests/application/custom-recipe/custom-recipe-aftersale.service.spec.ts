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

/** 多份订单的最新交付批次（create 只看 id / deliveredAt / items.id） */
function buildBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-10T10:00:00+08:00'),
    items: [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }],
    ...overrides,
  };
}

function createService(options: {
  order?: unknown;
  delivery?: unknown;
  openAftersale?: unknown;
  rows?: unknown[];
  windowDays?: number;
  freeRevisionCount?: number;
  /** 多份订单：最新批次（含 items）；不传 = 老的单份交付 */
  batch?: unknown;
  /** 批次明细（用于把 deliveryItemIds 翻成名字） */
  batchItems?: unknown[];
  /** 「订单设计」槽位数量；0 = 老订单（没有可回改的草稿） */
  designSlotCount?: number;
} = {}) {
  const prisma = {
    customRecipeOrder: {
      findFirst: jest.fn().mockResolvedValue(options.order ?? buildOrder()),
      /**
       * 2026-10-18：售后处理完成时要发一条站内消息（需求 2.9），
       * 其中要按 id 查订单拿 customerId / orderId。
       */
      findUnique: jest.fn().mockResolvedValue({
        customerId: 'customer-1',
        orderId: 'CR202610180001',
      }),
    },
    customRecipeDelivery: {
      findFirst: jest.fn().mockResolvedValue(
        'delivery' in options
          ? options.delivery
          : { id: 'delivery-1', deliveredAt: new Date('2026-10-10T10:00:00+08:00') },
      ),
      /** 代客发起要按交付记录反查 recipeId（老订单路径） */
      findUnique: jest.fn().mockResolvedValue({ recipeId: 'recipe-1' }),
    },
    /**
     * 2026-10-21 多份售后：create 先看有没有交付批次。
     * 默认 null = 老订单，走原来的单份交付路径。
     */
    customRecipeDeliveryBatch: {
      findFirst: jest.fn().mockResolvedValue(options.batch ?? null),
      /** 代客发起没指定份数时，按最新批次补齐 deliveryItemIds */
      findUnique: jest.fn().mockImplementation(async () => ({
        items: ((options.batch as any)?.items ?? []).map((item: any) => ({
          id: item.id,
        })),
      })),
    },
    customRecipeDeliveryItem: {
      findMany: jest.fn().mockResolvedValue(options.batchItems ?? []),
      /** 代客发起要把交付明细翻成写稿用的 recipeId（2026-10-27） */
      findUnique: jest.fn().mockResolvedValue({
        id: 'item-1',
        recipeId: 'recipe-1',
      }),
    },
    /** 代客发起前要确认这份交付后面有可回改的设计槽位 */
    orderRecipeDesign: {
      count: jest.fn().mockResolvedValue(options.designSlotCount ?? 1),
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
      freeRevisionCount: options.freeRevisionCount ?? 2,
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

describe('CustomRecipeAftersaleService · 多份批次售后（2026-10-21）', () => {
  const baseInput = {
    orderIdOrId: 'CR202610160001',
    customerId: 'customer-1',
    type: 'ADJUST_RECIPE',
    description: '整体说明：两份都不太适应',
    now: new Date('2026-10-15T10:00:00+08:00'),
  };

  it('★ 勾选 2 份 + 各自说明：存批次 / 明细 id / 逐份说明，deliveryId 保持 null', async () => {
    const { service, prisma } = createService({ batch: buildBatch() });

    const result = await service.create({
      ...baseInput,
      deliveryItemIds: ['item-1', 'item-2'],
      recipeRequests: [
        { deliveryItemId: 'item-1', description: '  鸡肉南瓜太油  ' },
        { deliveryItemId: 'item-2', description: '鸭肉西兰花吃完软便' },
      ],
    });

    const data = (prisma.customRecipeAftersale.create as jest.Mock).mock
      .calls[0][0].data;

    // 多份订单的交付在批次表里 —— 售后也必须指向批次，而不是老的单份交付
    expect(data.deliveryBatchId).toBe('batch-1');
    expect(data.deliveryId).toBeNull();
    expect(data.deliveryItemIds).toEqual(['item-1', 'item-2']);
    expect(data.recipeRequests).toEqual([
      { deliveryItemId: 'item-1', description: '鸡肉南瓜太油', photos: [] },
      { deliveryItemId: 'item-2', description: '鸭肉西兰花吃完软便', photos: [] },
    ]);
    // 共用说明仍按老字段保存（老页面 / 后台详情还在读它）
    expect(data.description).toBe('整体说明：两份都不太适应');

    expect(result.deliveryBatchId).toBe('batch-1');
    expect(result.deliveryItemIds).toEqual(['item-1', 'item-2']);
    expect(result.recipeRequests).toHaveLength(2);

    // 有批次时不该再去看老的单份交付表
    expect(prisma.customRecipeDelivery.findFirst).not.toHaveBeenCalled();
  });

  it('★ 每份带自己的附件：逐份存，顶层存并集', async () => {
    const { service, prisma } = createService({ batch: buildBatch() });

    await service.create({
      ...baseInput,
      deliveryItemIds: ['item-1', 'item-2'],
      photos: ['https://cdn.example.com/common.jpg'],
      recipeRequests: [
        {
          deliveryItemId: 'item-1',
          description: '鸡肉南瓜太油',
          photos: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/a2.jpg'],
        },
        {
          deliveryItemId: 'item-2',
          description: '鸭肉西兰花吃完软便',
          photos: ['https://cdn.example.com/b.jpg'],
        },
      ],
    });

    const data = (prisma.customRecipeAftersale.create as jest.Mock).mock
      .calls[0][0].data;

    expect(data.recipeRequests).toEqual([
      {
        deliveryItemId: 'item-1',
        description: '鸡肉南瓜太油',
        photos: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/a2.jpg'],
      },
      {
        deliveryItemId: 'item-2',
        description: '鸭肉西兰花吃完软便',
        photos: ['https://cdn.example.com/b.jpg'],
      },
    ]);
    expect(new Set(data.photos)).toEqual(
      new Set([
        'https://cdn.example.com/common.jpg',
        'https://cdn.example.com/a.jpg',
        'https://cdn.example.com/a2.jpg',
        'https://cdn.example.com/b.jpg',
      ]),
    );
  });

  it('只传逐份说明、不传「涉及食谱」：说明里提到的几份就是选中范围', async () => {
    const { service, prisma } = createService({ batch: buildBatch() });

    await service.create({
      ...baseInput,
      recipeRequests: [
        { deliveryItemId: 'item-2', description: '这一份想换肉' },
      ],
    });

    const data = (prisma.customRecipeAftersale.create as jest.Mock).mock
      .calls[0][0].data;
    expect(data.deliveryItemIds).toEqual(['item-2']);
  });

  it('★ 别人的多份订单：归属校验先挡住，连批次都不查', async () => {
    const { service, prisma } = createService({ batch: buildBatch() });

    await expect(
      service.create({
        ...baseInput,
        customerId: 'customer-别人',
        deliveryItemIds: ['item-1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.customRecipeDeliveryBatch.findFirst).not.toHaveBeenCalled();
  });

  it('★ 传了空的选择：报错，而不是悄悄当成整单售后', async () => {
    const { service } = createService({ batch: buildBatch() });

    await expect(
      service.create({ ...baseInput, deliveryItemIds: [] }),
    ).rejects.toThrow(/至少选择一份/);
  });

  it('★ 选了不属于这批的明细（别的订单 / 旧批次）：拒绝', async () => {
    const { service, prisma } = createService({ batch: buildBatch() });

    await expect(
      service.create({
        ...baseInput,
        deliveryItemIds: ['item-other-order'],
      }),
    ).rejects.toThrow(/不在本次交付/);

    expect(prisma.customRecipeAftersale.create).not.toHaveBeenCalled();
  });

  it('★ 逐份说明指向没勾选的那份：拒绝（避免后台看到互相矛盾的选择）', async () => {
    const { service } = createService({ batch: buildBatch() });

    await expect(
      service.create({
        ...baseInput,
        deliveryItemIds: ['item-1'],
        recipeRequests: [
          { deliveryItemId: 'item-2', description: '这一份也想改' },
        ],
      }),
    ).rejects.toThrow(/不在本次选中的范围/);
  });

  it('★ 逐份说明不能为空（每份都要说清想改什么）', async () => {
    const { service } = createService({ batch: buildBatch() });

    await expect(
      service.create({
        ...baseInput,
        deliveryItemIds: ['item-1'],
        recipeRequests: [{ deliveryItemId: 'item-1', description: '   ' }],
      }),
    ).rejects.toThrow(/每一份食谱说明要调整什么/);
  });

  it('逐份说明必须指明是哪一份', async () => {
    const { service } = createService({ batch: buildBatch() });

    await expect(
      service.create({
        ...baseInput,
        recipeRequests: [{ description: '忘了选哪一份' }],
      }),
    ).rejects.toThrow(/指明针对哪一份/);
  });

  describe('★ 窗口仍从交付时间起算，但批次订单看批次时间', () => {
    it('订单上的 deliveredAt 很旧、批次是新的：仍可提', async () => {
      const { service } = createService({
        batch: buildBatch({
          deliveredAt: new Date('2026-10-10T10:00:00+08:00'),
        }),
        order: buildOrder({ deliveredAt: new Date('2026-09-01T10:00:00+08:00') }),
        windowDays: 30,
      });

      await expect(
        service.create({ ...baseInput, deliveryItemIds: ['item-1'] }),
      ).resolves.toBeDefined();
    });

    it('批次已经超过窗口：拒绝（即使订单上的时间很新）', async () => {
      const { service } = createService({
        batch: buildBatch({
          deliveredAt: new Date('2026-09-01T10:00:00+08:00'),
        }),
        order: buildOrder({ deliveredAt: new Date('2026-10-10T10:00:00+08:00') }),
        windowDays: 30,
      });

      await expect(
        service.create({ ...baseInput, deliveryItemIds: ['item-1'] }),
      ).rejects.toThrow(/超过售后受理期/);
    });
  });

  it('★ 一次提交只占 1 次免费调整：勾了 2 份也是 1 条售后单', async () => {
    const { service, prisma } = createService({
      batch: buildBatch(),
      rows: [{ status: 'RESOLVED' }],
      freeRevisionCount: 2,
    });

    await service.create({
      ...baseInput,
      deliveryItemIds: ['item-1', 'item-2'],
    });

    // 只写一条售后单（不是一份一条）
    expect(prisma.customRecipeAftersale.create).toHaveBeenCalledTimes(1);

    // 配额按售后单条数算：提过 1 次 → 还剩 1 次，与勾了几份无关
    const quota = await service.getQuota('CR202610160001', 'customer-1');
    expect(quota.usedCount).toBe(1);
    expect(quota.freeRevisionsLeft).toBe(1);
  });

  it('次数用完时照旧拒绝（勾几份都不能绕过配额）', async () => {
    const { service } = createService({
      batch: buildBatch(),
      rows: [{ status: 'RESOLVED' }],
      freeRevisionCount: 1,
    });

    await expect(
      service.create({
        ...baseInput,
        deliveryItemIds: ['item-1', 'item-2'],
      }),
    ).rejects.toThrow(/免费调整次数已用完/);
  });

  it('★ 老订单（没有批次）行为不变：仍写 deliveryId，新字段为空', async () => {
    const { service, prisma } = createService();

    await service.create(baseInput);

    const data = (prisma.customRecipeAftersale.create as jest.Mock).mock
      .calls[0][0].data;
    expect(data.deliveryId).toBe('delivery-1');
    expect(data.deliveryBatchId).toBeNull();
    expect(data.deliveryItemIds).toEqual([]);
    expect(data.recipeRequests).toBeUndefined();
  });

  it('老订单传了批次明细：明确拒绝，不静默丢掉顾客的选择', async () => {
    const { service } = createService();

    await expect(
      service.create({ ...baseInput, deliveryItemIds: ['item-1'] }),
    ).rejects.toThrow(/不是多份交付/);
  });
});

describe('CustomRecipeAftersaleService · 响应带出「涉及哪几份」', () => {
  const batchAftersale = (overrides: Record<string, unknown> = {}) =>
    buildAftersale({
      deliveryId: null,
      deliveryBatchId: 'batch-1',
      deliveryItemIds: ['item-1', 'item-2'],
      recipeRequests: [
        { deliveryItemId: 'item-1', description: '太油了' },
        { deliveryItemId: 'item-2', description: '想换成鸭肉' },
      ],
      ...overrides,
    });

  const batchItems = () => [
    { id: 'item-1', recipe: { recipeId: 'CR1759100000001', name: '鸡肉南瓜' } },
    { id: 'item-2', recipe: { recipeId: 'CR1759100000002', name: '鸭肉西兰花' } },
  ];

  it('★ 顾客侧状态：已交付 / 已撤销，不把撤回显示成未受理', async () => {
    const resolved = await (async () => {
      const { service } = createService({
        rows: [batchAftersale({ status: 'RESOLVED', handleNote: '已调整' })],
        batchItems: batchItems(),
      });
      return service.listForCustomer('CR202610160001', 'customer-1');
    })();

    const withdrawn = await (async () => {
      const { service } = createService({
        rows: [
          batchAftersale({
            status: 'REJECTED',
            rejectReason: '顾客自行撤回',
          }),
        ],
        batchItems: batchItems(),
      });
      return service.listForCustomer('CR202610160001', 'customer-1');
    })();

    expect(resolved[0].customerStatusLabel).toBe('已交付');
    expect(withdrawn[0].customerStatusLabel).toBe('已撤销');
  });

  it('★ 顾客侧：批次 id / 明细 id / 食谱名字 / 逐份说明都返回（可直接渲染）', async () => {
    const { service } = createService({
      rows: [batchAftersale()],
      batchItems: batchItems(),
    });

    const list = await service.listForCustomer(
      'CR202610160001',
      'customer-1',
    );

    expect(list[0].deliveryBatchId).toBe('batch-1');
    expect(list[0].deliveryItemIds).toEqual(['item-1', 'item-2']);
    expect(list[0].items).toEqual([
      {
        deliveryItemId: 'item-1',
        recipeId: 'CR1759100000001',
        recipeName: '鸡肉南瓜',
      },
      {
        deliveryItemId: 'item-2',
        recipeId: 'CR1759100000002',
        recipeName: '鸭肉西兰花',
      },
    ]);
    expect(list[0].recipeRequests).toEqual([
      { deliveryItemId: 'item-1', description: '太油了', photos: [] },
      { deliveryItemId: 'item-2', description: '想换成鸭肉', photos: [] },
    ]);
  });

  it('★ 后台待办：同样带出涉事食谱，客服不用自己去库里翻 id', async () => {
    const { service } = (() => {
      const prisma = {
        customRecipeDeliveryItem: {
          findMany: jest.fn().mockResolvedValue(batchItems()),
        },
        customRecipeAftersale: {
          findMany: jest.fn().mockResolvedValue([
            {
              ...batchAftersale(),
              order: {
                orderId: 'CR202610160001',
                customerId: 'customer-1',
                status: 'COMPLETED',
                dog: { name: '豆豆' },
                customer: { nickname: '张三', phone: '138' },
              },
            },
          ]),
        },
        customRecipeOrder: { findUnique: jest.fn() },
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
    })();

    const list = await service.listForStaff();

    expect(list[0].deliveryBatchId).toBe('batch-1');
    expect(list[0].deliveryItemIds).toEqual(['item-1', 'item-2']);
    expect(list[0].items.map((item: any) => item.recipeName)).toEqual([
      '鸡肉南瓜',
      '鸭肉西兰花',
    ]);
    expect(list[0].recipeRequests).toHaveLength(2);
  });

  it('老订单：新字段是空数组 / null，字段本身仍然存在（前端不用判 undefined）', async () => {
    const { service, prisma } = createService({
      rows: [buildAftersale()],
    });
    (prisma.customRecipeDeliveryItem.findMany as jest.Mock).mockClear();

    const list = await service.listForCustomer(
      'CR202610160001',
      'customer-1',
    );

    expect(list[0].deliveryBatchId).toBeNull();
    expect(list[0].deliveryItemIds).toEqual([]);
    expect(list[0].items).toEqual([]);
    expect(list[0].recipeRequests).toEqual([]);
    // 没选任何明细时不该白查一次明细表
    expect(prisma.customRecipeDeliveryItem.findMany).not.toHaveBeenCalled();
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
    /** 把 deliveryItemIds 翻成食谱名字（多份售后） */
    batchItems?: unknown[];
  } = {}) {
    const prisma = {
      customRecipeDeliveryItem: {
        findMany: jest.fn().mockResolvedValue(options.batchItems ?? []),
      },
      customRecipeAftersale: {
        findMany: jest.fn().mockResolvedValue(options.rows ?? []),
        findUnique: jest.fn().mockResolvedValue(options.row ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
      /**
       * 2026-10-18：`resolve` 之后要发一条站内消息（需求 2.9），
       * 先按 id 查订单拿 customerId / orderId。
       */
      customRecipeOrder: {
        findUnique: jest.fn().mockResolvedValue({
          customerId: 'customer-1',
          orderId: 'CR202610180001',
        }),
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

/**
 * 代客发起调整（2026-10-27）
 *
 * ## 守的是什么
 *
 * 顾客不满意但不会/不方便在小程序提单时，老板必须能自己把改好的食谱交回去。
 * 这条链路是「员工开一张调整单 → 售后页改稿 → 重新交付」，所以这里守住三件事：
 *   ① 只有**已交付**的订单能发起；
 *   ② 员工发起**不占顾客免费次数、不看售后窗口**（商家行为不该扣顾客权益）；
 *   ③ 建单前就要确认后面有可回改的设计草稿，否则会留下一条永远处理不完的死单。
 */
describe('CustomRecipeAftersaleService · 代客发起调整（2026-10-27）', () => {
  const baseInput = {
    orderIdOrId: 'CR202610160001',
    operatorId: 'staff-1',
    description: '体重掉了，把兔肉换成鸭胸重做一版',
  };

  it('★ 已交付订单：员工可直接发起，创建即受理、来源标为商家', async () => {
    const { service, prisma } = createService({
      order: buildOrder({ status: CustomRecipeStatus.DELIVERED }),
    });

    const result = await service.createByStaff(baseInput);

    expect(result.status).toBe('ACCEPTED');
    expect(result.source).toBe('STAFF');
    expect(result.deliveryItemIds).toEqual([]);

    const arg = (prisma.customRecipeAftersale.create as jest.Mock).mock
      .calls[0][0];
    expect(arg.data.source).toBe('STAFF');
    expect(arg.data.status).toBe('ACCEPTED');
    expect(arg.data.type).toBe('ADJUST_RECIPE');
    expect(arg.data.handlerId).toBe('staff-1');
    expect(arg.data.acceptedAt).toBeInstanceOf(Date);
    expect(arg.data.description).toContain('鸭胸');
  });

  it('★ 不看售后窗口、不占免费次数：连窗口配置都不读', async () => {
    const { service, configService } = createService({
      order: buildOrder({ status: CustomRecipeStatus.COMPLETED }),
      windowDays: 0,
      freeRevisionCount: 0,
    });

    await expect(service.createByStaff(baseInput)).resolves.toBeDefined();

    // 顾客那条路径会读配置取窗口天数；员工这条不该碰
    expect(configService.getConfig).not.toHaveBeenCalled();
  });

  it('未交付的订单不能发起（未交付直接在设计器里改）', async () => {
    const { service } = createService({
      order: buildOrder({ status: CustomRecipeStatus.IN_PROGRESS }),
    });

    await expect(service.createByStaff(baseInput)).rejects.toThrow(
      /只有已经交付的订单/,
    );
  });

  it('已取消的订单不能发起', async () => {
    const { service } = createService({
      order: buildOrder({ status: CustomRecipeStatus.CANCELLED }),
    });

    await expect(service.createByStaff(baseInput)).rejects.toThrow(/已取消/);
  });

  it('说明必填 —— 顾客会看到这句话', async () => {
    const { service } = createService();

    await expect(
      service.createByStaff({ ...baseInput, description: '   ' }),
    ).rejects.toThrow(/请写一句这次要调整什么/);
  });

  it('★ 已有进行中的调整时复用那一条，不重复建单（重复点击不报错）', async () => {
    const { service, prisma } = createService({
      openAftersale: {
        id: 'aftersale-open',
        status: 'ACCEPTED',
        source: 'CUSTOMER',
        deliveryBatchId: 'batch-1',
        deliveryItemIds: ['item-1'],
        deliveryId: null,
      },
    });

    const result = await service.createByStaff(baseInput);

    expect(result.id).toBe('aftersale-open');
    expect(result.resumed).toBe(true);
    // 不能再插一条
    expect(prisma.customRecipeAftersale.create).not.toHaveBeenCalled();
  });

  it('复用顾客还没受理的那条时顺手受理（否则改稿会用不了）', async () => {
    const { service, prisma } = createService({
      openAftersale: {
        id: 'aftersale-pending',
        status: 'PENDING',
        source: 'CUSTOMER',
        deliveryBatchId: 'batch-1',
        deliveryItemIds: ['item-1'],
        deliveryId: null,
      },
    });

    const result = await service.createByStaff(baseInput);

    expect(result.status).toBe('ACCEPTED');
    const arg = (prisma.customRecipeAftersale.update as jest.Mock).mock
      .calls[0][0];
    expect(arg.data.status).toBe('ACCEPTED');
    expect(arg.data.handlerId).toBe('staff-1');
  });

  it('★ 老订单（没有订单设计槽位）：拒绝建单，并指路「重新交付」', async () => {
    const { service } = createService({ designSlotCount: 0 });

    await expect(service.createByStaff(baseInput)).rejects.toThrow(
      /没有可回改的设计草稿/,
    );
  });

  it('多份订单不指定份数时：落到最新批次的全部份', async () => {
    const { service, prisma } = createService({
      order: buildOrder({ status: CustomRecipeStatus.DELIVERED }),
      batch: buildBatch(),
    });

    const result = await service.createByStaff(baseInput);

    expect(result.deliveryItemIds).toEqual(['item-1', 'item-2', 'item-3']);
    const arg = (prisma.customRecipeAftersale.create as jest.Mock).mock
      .calls[0][0];
    expect(arg.data.deliveryBatchId).toBe('batch-1');
  });
});

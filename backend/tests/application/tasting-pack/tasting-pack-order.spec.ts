/**
 * 试吃装（现货）订单 · 域层与下单链路测试
 *
 * 现货复用鲜食的订单表与状态机，最大的风险是"被当成鲜食单误处理"。
 * 这个文件把几条**必须区分开**的规则钉死：
 *   ① 现货付款即可发货，不必经过采购/生产/急冻
 *   ② 现货不做"重做"，只做退款/补发
 *   ③ 下单要先占库存，占不到不许下单；订单创建失败要把库存还回去
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Order } from '../../../src/domain/order/order.entity';
import {
  AftersaleType,
  OrderStatus,
  OrderType,
} from '../../../src/domain/order/enums';
import { OrderItem } from '../../../src/domain/order/order-item.entity';
import { OrderService } from '../../../src/application/order/order.service';

function buildOrder(
  status: OrderStatus,
  type: OrderType,
  items: OrderItem[] = [{} as any],
): Order {
  const u = undefined;
  return new Order(
    'order-1',
    'customer-1',
    status,
    type,
    new Date(),
    null,
    null,
    0,
    0,
    0,
    items,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
    u,
  );
}

function buildPackItem(
  overrides: { dailyIntakeG?: number | null } = {},
): OrderItem {
  const dailyIntakeG =
    'dailyIntakeG' in overrides ? (overrides.dailyIntakeG as any) : null;
  return new OrderItem(
    'item-1',
    'order-1',
    null, // 现货不绑狗狗
    { id: 'pack-1', name: '五种口味尝鲜装', items: [] } as any,
    800,
    10,
    80,
    null,
    dailyIntakeG,
    null,
    null,
    null,
    [{ packageSpecG: 80, packageCount: 10 }],
    null,
    null,
    null,
    'pack-1',
  );
}

describe('现货订单 · 状态流转', () => {
  it('已付款的现货订单可以直接发货（不需要先经过采购/生产/急冻）', () => {
    const order = buildOrder(OrderStatus.PAID, OrderType.TASTING_PACK);
    order.markAsShipped('SF123', 'SF');
    expect(order.status).toBe(OrderStatus.SHIPPED);
  });

  it('鲜食订单仍然必须先急冻才能发货（原有规则没被放宽）', () => {
    const order = buildOrder(OrderStatus.PAID, OrderType.FRESH_FOOD);
    expect(() => order.markAsShipped('SF123', 'SF')).toThrow(
      'Cannot mark order as shipped',
    );
  });

  it('现货订单也要校验运单号与快递公司', () => {
    const order = buildOrder(OrderStatus.PAID, OrderType.TASTING_PACK);
    expect(() => order.markAsShipped('', 'SF')).toThrow('Tracking number');
    expect(() => order.markAsShipped('SF123', '')).toThrow('Carrier code');
  });

  it('现货订单不能跳过付款直接发货', () => {
    const pending = buildOrder(
      OrderStatus.PENDING_PAYMENT,
      OrderType.TASTING_PACK,
    );
    expect(() => pending.markAsShipped('SF123', 'SF')).toThrow();
  });
});

describe('现货订单 · 售后口径', () => {
  it('现货不支持"重做"，并提示正确做法', () => {
    const order = buildOrder(OrderStatus.SHIPPED, OrderType.TASTING_PACK);
    expect(() =>
      order.applyForAftersale(AftersaleType.REMAKE, '想重做'),
    ).toThrow('不支持重做');
    expect(() =>
      order.applyForAftersale(AftersaleType.REMAKE, '想重做'),
    ).toThrow('联系客服补发');
  });

  it('现货支持退款与投诉', () => {
    const refund = buildOrder(OrderStatus.SHIPPED, OrderType.TASTING_PACK);
    expect(() =>
      refund.applyForAftersale(AftersaleType.REFUND, '破损'),
    ).not.toThrow();

    const complaint = buildOrder(OrderStatus.PAID, OrderType.TASTING_PACK);
    expect(() =>
      complaint.applyForAftersale(AftersaleType.COMPLAINT, '建议'),
    ).not.toThrow();
  });

  it('鲜食仍然可以重做（原有能力没被砍掉）', () => {
    const fresh = buildOrder(OrderStatus.SHIPPED, OrderType.FRESH_FOOD);
    expect(() =>
      fresh.applyForAftersale(AftersaleType.REMAKE, '做错了'),
    ).not.toThrow();
  });
});

describe('售后结案 · 原单不能永远停在"售后中"', () => {
  it('售后中的订单可以由派生单送达后直接结案（AFTERSALE → COMPLETED）', () => {
    const order = buildOrder(OrderStatus.AFTERSALE, OrderType.TASTING_PACK);
    order.aftersaleType = AftersaleType.RESHIP;

    order.markAftersaleSettled();

    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(order.aftersaleType).toBe(AftersaleType.RESOLVED);
    expect(order.completedAt).toBeInstanceOf(Date);
  });

  it('重复结案是幂等的，不会报错也不会改坏数据', () => {
    const order = buildOrder(OrderStatus.AFTERSALE, OrderType.TASTING_PACK);
    order.markAftersaleSettled();
    const firstCompletedAt = order.completedAt;

    expect(() => order.markAftersaleSettled()).not.toThrow();
    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(order.completedAt).toBe(firstCompletedAt);
  });

  it('非售后中的订单不能用"售后结案"这条路蒙混过关', () => {
    const paid = buildOrder(OrderStatus.PAID, OrderType.TASTING_PACK);
    expect(() => paid.markAftersaleSettled()).toThrow('must be in AFTERSALE');
  });
});

describe('现货订单明细', () => {
  it('现货明细的"每日饭量"可以为空（不塞假数据）', () => {
    const item = buildPackItem();
    expect(item.dailyIntakeG).toBeNull();
    expect(item.tastingPackId).toBe('pack-1');
    expect(item.dogId).toBeNull();
  });

  it('鲜食明细仍然要求饭量为正数', () => {
    expect(() => buildPackItem({ dailyIntakeG: 0 })).toThrow();
  });
});

/**
 * 下单链路：用最小 mock 验证"先占库存、失败要还"这个顺序
 */
describe('现货下单 · 库存占用与回滚', () => {
  function buildOrderService(params: {
    packItems?: any[];
    reserveImpl?: () => Promise<any>;
    saveImpl?: () => Promise<any>;
  }) {
    const snapshot = {
      id: 'snap-1',
      requestParams: {
        kind: 'TASTING_PACK',
        tastingPackId: 'pack-1',
        sets: 2,
        addressId: null,
      },
      pricingResult: {
        amountProduct: 140,
        amountShipping: 30,
        amountTotal: 170,
        costBreakdown: {
          costIngredients: 60,
          costPackaging: 10,
          costLabor: 6,
          costOverhead: 2,
          totalProductCost: 78,
        },
      },
      belongsToCustomer: () => true,
      canBeUsed: () => true,
      used: false,
      isExpired: () => false,
    };

    const stockService = {
      reserveForOrder:
        params.reserveImpl ?? jest.fn().mockResolvedValue({ sets: 2 }),
      releaseForOrder: jest.fn().mockResolvedValue({ released: 2 }),
    };
    const packService = {
      assertPurchasable: jest.fn().mockResolvedValue({
        pack: {
          id: 'pack-1',
          code: 'TPABC',
          name: '尝鲜装',
          bagsPerRecipe: 2,
          packSpecG: 80,
          items: params.packItems ?? [
            { recipeId: 'r1', recipeSnapshot: { name: '菜一' } },
            { recipeId: 'r2', recipeSnapshot: { name: '菜二' } },
          ],
        },
      }),
    };

    const orderRepository = {
      save: params.saveImpl ?? jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };

    const service = new OrderService(
      orderRepository as any,
      { append: jest.fn() } as any, // statusHistory
      {} as any, // recipeRepository
      {} as any, // ingredientRepository
      {} as any, // dogRepository
      {} as any, // pricingService
      {} as any, // globalConfigService
      { calculateShippingFeePreview: jest.fn() } as any,
      {} as any, // orderSourcePlanService
      { findById: jest.fn().mockResolvedValue(null) } as any, // addressRepository
      {
        findById: jest.fn().mockResolvedValue(snapshot),
        markAsUsed: jest.fn().mockResolvedValue(undefined),
        create: jest.fn(),
        deleteExpired: jest.fn(),
      } as any,
      {} as any, // prisma
      undefined, // searchGovernanceService
      undefined, // shippingNotificationService
      packService as any,
      stockService as any,
    );

    return { service, stockService, orderRepository, packService };
  }

  it('下单先占库存；占用失败直接抛出，不产生订单', async () => {
    const { service, stockService, orderRepository } = buildOrderService({
      reserveImpl: jest
        .fn()
        .mockRejectedValue(new ConflictException('试吃装库存不足，还差 2 套')),
    });

    await expect(
      service.createOrderDraft({
        customerId: 'customer-1',
        type: OrderType.TASTING_PACK,
        snapshotId: 'snap-1',
      } as any),
    ).rejects.toThrow('库存不足');

    expect(stockService.reserveForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ tastingPackId: 'pack-1', sets: 2 }),
    );
    // 没占到货就不该落单
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('订单落库失败要把已占用的库存还回去', async () => {
    const { service, stockService } = buildOrderService({
      saveImpl: jest.fn().mockRejectedValue(new Error('数据库写入失败')),
    });

    await expect(
      service.createOrderDraft({
        customerId: 'customer-1',
        type: OrderType.TASTING_PACK,
        snapshotId: 'snap-1',
      } as any),
    ).rejects.toThrow('数据库写入失败');

    expect(stockService.releaseForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: expect.any(String) }),
    );
  });

  it('成功下单时订单类型、制作日期与明细都对', async () => {
    const { service, orderRepository } = buildOrderService({});

    const order = await service.createOrderDraft({
      customerId: 'customer-1',
      type: OrderType.TASTING_PACK,
      snapshotId: 'snap-1',
    } as any);

    expect(order.type).toBe(OrderType.TASTING_PACK);
    expect(order.targetProductionDate).toBeNull();
    expect(order.items).toHaveLength(1);
    expect(order.items[0].tastingPackId).toBe('pack-1');
    expect(order.items[0].dailyIntakeG).toBeNull();
    // 2 道菜 × 2 袋 × 2 套 = 8 袋，每袋 80g
    expect(order.items[0].packageCount).toBe(8);
    expect(order.items[0].quantityG).toBe(640);
    expect(orderRepository.save).toHaveBeenCalled();
  });

  it('快照缺少商品或套数时明确报错，不去猜', async () => {
    const { service, stockService } = buildOrderService({});
    const broken = new OrderService(
      {
        findById: jest.fn(),
        save: jest.fn(),
      } as any,
      { append: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        findById: jest.fn().mockResolvedValue({
          requestParams: { kind: 'TASTING_PACK' },
          pricingResult: {},
          belongsToCustomer: () => true,
          canBeUsed: () => true,
          used: false,
          isExpired: () => false,
        }),
        markAsUsed: jest.fn(),
        create: jest.fn(),
        deleteExpired: jest.fn(),
      } as any,
      {} as any,
      undefined,
      undefined,
      { assertPurchasable: jest.fn() } as any,
      stockService as any,
    );

    await expect(
      broken.createOrderDraft({
        customerId: 'customer-1',
        type: OrderType.TASTING_PACK,
        snapshotId: 'snap-1',
      } as any),
    ).rejects.toThrow(BadRequestException);
    void service;
  });
});

describe('现货订单 · 误操作防护', () => {
  it('把现货单拉去"开始生产"会被拦住', async () => {
    const order = buildOrder(OrderStatus.PAID, OrderType.TASTING_PACK);
    const orderRepository = {
      findById: jest.fn().mockResolvedValue(order),
      save: jest.fn(),
    };
    const service = new OrderService(
      orderRepository as any,
      { append: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    await expect(service.startProduction('order-1', 'admin')).rejects.toThrow(
      '现货商品，不需要开始生产',
    );
    expect(orderRepository.save).not.toHaveBeenCalled();
  });
});

/**
 * 一键补发：现货出问题时不收款再寄一份
 *
 * 这里钉死的是「补发」与「重做」的分工：
 *   重做 → 走采购、排产、生产；补发 → 直接从成品库存取货，因此必须扣库存。
 * 以及几条不能松的口子：库存不够不许补、一单只能补一次、鲜食不能用补发。
 */
describe('现货订单 · 一键补发', () => {
  const PACK_SNAPSHOT = {
    id: 'pack-1',
    kind: 'TASTING_PACK',
    version: 1,
    name: '五种口味尝鲜装',
    production_loss_rate: 1,
    energy_density_kcal_per_kg: 0,
    nutrition_standard: '',
    items: [],
    tastingPackCode: 'TPABC',
    bagsPerRecipe: 2,
    packSpecG: 80,
    dishes: [
      { recipeId: 'r1', name: '菜一', coverImageUrl: null },
      { recipeId: 'r2', name: '菜二', coverImageUrl: null },
    ],
    capturedAt: new Date('2026-09-26T00:00:00Z').toISOString(),
  };

  /** 2 道菜 × 2 袋 = 每套 4 袋，每袋 80g */
  function buildTastingPackOrder(params: {
    status: OrderStatus;
    sets: number;
    type?: OrderType;
    orderNo?: string;
  }): Order {
    const totalPacks = 4 * params.sets;
    const item = new OrderItem(
      'item-original',
      'order-original',
      null,
      PACK_SNAPSHOT as any,
      totalPacks * 80,
      totalPacks,
      80,
      null,
      null,
      null,
      null,
      null,
      [{ packageSpecG: 80, packageCount: totalPacks }],
      null,
      null,
      null,
      params.type === OrderType.FRESH_FOOD ? null : 'pack-1',
    );
    const order = new Order(
      'order-original',
      'customer-1',
      params.status,
      params.type ?? OrderType.TASTING_PACK,
      new Date(),
      null,
      null,
      170 * params.sets,
      0,
      170 * params.sets,
      [item],
    );
    order.orderNo = params.orderNo ?? 'SK20260926-001';
    order.shippingAddressSnapshot = { recipientName: '张三' } as any;
    return order;
  }

  function buildReshipService(params: {
    original: Order;
    existingReship?: { id: string; orderNo: string } | null;
    reserveImpl?: jest.Mock;
    failSave?: boolean;
  }) {
    const orderRepository = {
      findById: jest.fn().mockResolvedValue(params.original),
      save: jest.fn(async (order: Order) => {
        if (params.failSave) throw new Error('数据库写入失败');
        return order;
      }),
    };
    const stockService = {
      reserveForOrder:
        params.reserveImpl ??
        jest.fn().mockResolvedValue({
          packId: 'pack-1',
          sets: 1,
          allocations: [{ batchId: 'b1', batchNo: 'TP-001', sets: 1 }],
          weightedUnitCost: 12.5,
        }),
      releaseForOrder: jest.fn().mockResolvedValue({ released: 1 }),
    };
    const prisma = {
      order: {
        findFirst: jest
          .fn()
          .mockResolvedValue(params.existingReship ?? null),
      },
    };

    const service = new OrderService(
      orderRepository as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, // recipeRepository
      {} as any, // ingredientRepository
      {} as any, // dogRepository
      {} as any, // pricingService
      {} as any, // globalConfigService
      {} as any, // shippingService
      {} as any, // orderSourcePlanService
      {} as any, // addressRepository
      {} as any, // pricingSnapshotRepository
      prisma as any,
      undefined, // searchGovernanceService
      undefined, // shippingNotificationService
      undefined, // tastingPackService
      stockService as any,
    );

    return { service, orderRepository, stockService, prisma };
  }

  it('补发会建一张 0 元现货单，并扣掉成品库存', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 2,
    });
    const { service, orderRepository, stockService } = buildReshipService({
      original,
    });

    const reship = await service.createReshipOrderFrom(
      'order-original',
      'admin-1',
      { reason: '到货化冻' },
    );

    // 0 元、已付款、现货，直接进入待发货
    expect(reship.type).toBe(OrderType.TASTING_PACK);
    expect(reship.status).toBe(OrderStatus.PAID);
    expect(reship.amountTotal).toBe(0);
    expect(reship.paymentStatus).toBe('SUCCESS');
    expect(reship.paymentMethod).toBe('RESHIP');
    expect(reship.reshipFromOrderId).toBe('order-original');
    expect(reship.targetProductionDate).toBeNull();
    expect(reship.adminRemark).toContain('试吃装补发单');
    expect(reship.adminRemark).toContain('到货化冻');
    // 补发单是可追踪的真实订单，不是内部影子单
    expect(reship.shippingAddressSnapshot).toEqual({ recipientName: '张三' });

    // 默认按原单套数全额补发：2 套 × 4 袋 × 80g
    expect(reship.items).toHaveLength(1);
    expect(reship.items[0].tastingPackId).toBe('pack-1');
    expect(reship.items[0].packageCount).toBe(8);
    expect(reship.items[0].quantityG).toBe(640);
    // 快照原样复制：顾客看到的还是当时买到的那一套菜
    expect((reship.items[0].recipeSnapshot as any).dishes).toHaveLength(2);

    // 现货补发必须真的从库里取货
    expect(stockService.reserveForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tastingPackId: 'pack-1',
        sets: 2,
        orderId: reship.id,
      }),
    );

    // 补发单落库后原单不动（已完成单不需要被改成"售后中"）
    expect(original.status).toBe(OrderStatus.COMPLETED);
    expect(original.aftersaleType).toBeUndefined();
    expect(orderRepository.save).toHaveBeenCalledWith(reship);
  });

  it('可以只补一部分（买 2 套坏了 1 套）', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 2,
    });
    const { service, stockService } = buildReshipService({
      original,
      reserveImpl: jest.fn().mockResolvedValue({
        packId: 'pack-1',
        sets: 1,
        allocations: [],
        weightedUnitCost: 12.5,
      }),
    });

    const reship = await service.createReshipOrderFrom(
      'order-original',
      'admin-1',
      { sets: 1 },
    );

    expect(stockService.reserveForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ sets: 1 }),
    );
    expect(reship.items[0].packageCount).toBe(4);
    expect(reship.items[0].quantityG).toBe(320);
  });

  it('补发套数不能超过原单套数', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 1,
    });
    const { service, stockService } = buildReshipService({ original });

    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1', { sets: 3 }),
    ).rejects.toThrow('不能超过原单套数');
    expect(stockService.reserveForOrder).not.toHaveBeenCalled();
  });

  it('库存不够时直接失败，既不扣库存也不产生补发单', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 2,
    });
    const { service, orderRepository, stockService } = buildReshipService({
      original,
      reserveImpl: jest
        .fn()
        .mockRejectedValue(new ConflictException('试吃装库存不足，还差 2 套')),
    });

    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1'),
    ).rejects.toThrow('库存不足');
    expect(orderRepository.save).not.toHaveBeenCalled();
    // 都没占到货，就不该有"退回"这个动作
    expect(stockService.releaseForOrder).not.toHaveBeenCalled();
  });

  it('补发单落库失败要把已占用的库存还回去', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 1,
    });
    const { service, stockService } = buildReshipService({
      original,
      failSave: true,
    });

    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1'),
    ).rejects.toThrow('数据库写入失败');
    expect(stockService.releaseForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ note: expect.stringContaining('库存退回') }),
    );
  });

  it('同一张原单只能补发一次', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 1,
    });
    const { service, stockService } = buildReshipService({
      original,
      existingReship: { id: 'reship-1', orderNo: 'SK20260926-099' },
    });

    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1'),
    ).rejects.toThrow('已补发过');
    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1'),
    ).rejects.toThrow('SK20260926-099');
    // 拦在扣库存之前，不会白扣一套
    expect(stockService.reserveForOrder).not.toHaveBeenCalled();
  });

  it('取消过的补发单不算"已补发"：原单可以重新补发', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 1,
    });
    const { service, prisma } = buildReshipService({ original });

    await service.createReshipOrderFrom('order-original', 'admin-1');

    // 查重时必须把已取消的补发单排除掉 —— 取消了代表没寄出去，
    // 否则一次误操作取消就会把这张原单永久锁死
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reshipFromOrderId: 'order-original',
          status: { not: OrderStatus.CANCELLED },
        }),
      }),
    );
  });

  it('两位客服同时点补发时，数据库唯一约束兜住并给出可读提示', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.COMPLETED,
      sets: 1,
    });
    const { service, stockService } = buildReshipService({ original });
    // 并发场景：查重时两边都没查到，落库那一刻才撞上唯一约束
    const p2002 = new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.19.2' },
    );
    (service as any).orderRepository.save = jest
      .fn()
      .mockRejectedValue(p2002);

    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1'),
    ).rejects.toThrow('刚刚已被补发过');
    // 冲突出在"落库"这一步，已经占用的库存必须还回去
    expect(stockService.releaseForOrder).toHaveBeenCalled();
  });

  it('鲜食订单不能用补发，提示改用重做', async () => {
    const fresh = buildTastingPackOrder({
      status: OrderStatus.AFTERSALE,
      sets: 1,
      type: OrderType.FRESH_FOOD,
    });
    const { service, stockService } = buildReshipService({ original: fresh });

    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1'),
    ).rejects.toThrow('鲜食订单请使用「安排重做」');
    expect(stockService.reserveForOrder).not.toHaveBeenCalled();
  });

  it('已取消的订单不能补发', async () => {
    const cancelled = buildTastingPackOrder({
      status: OrderStatus.CANCELLED,
      sets: 1,
    });
    const { service } = buildReshipService({ original: cancelled });

    await expect(
      service.createReshipOrderFrom('order-original', 'admin-1'),
    ).rejects.toThrow('已取消的订单不能补发');
  });

  it('原单在售后中时，补发即它的处理结果：标记 RESHIP 并等补发送达后结案', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.AFTERSALE,
      sets: 1,
    });
    original.aftersaleType = AftersaleType.COMPLAINT;
    original.aftersaleReason = '有异味';
    const { service } = buildReshipService({ original });

    await service.createReshipOrderFrom('order-original', 'admin-1', {
      reason: '有一袋变质',
    });

    // 保持 AFTERSALE（顾客看到"处理中"），但处理方式已经明确是补发
    expect(original.status).toBe(OrderStatus.AFTERSALE);
    expect(original.aftersaleType).toBe(AftersaleType.RESHIP);
    expect(original.aftersaleReason).toBe('有一袋变质');
  });

  it('补发送达后，售后中的原单自动结案', async () => {
    const original = buildTastingPackOrder({
      status: OrderStatus.AFTERSALE,
      sets: 1,
    });
    original.aftersaleType = AftersaleType.RESHIP;

    // 补发单是另一张订单，id 必须与原单不同（否则根本区分不出谁是谁）
    const reship = buildTastingPackOrder({
      status: OrderStatus.SHIPPED,
      sets: 1,
      orderNo: 'SK20260926-100',
    });
    (reship as any).id = 'order-reship';
    reship.reshipFromOrderId = original.id;

    const orderRepository = {
      findById: jest.fn(async (id: string) =>
        id === original.id ? original : reship,
      ),
      save: jest.fn(async (order: Order) => order),
    };
    const service = new OrderService(
      orderRepository as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    await service.completeOrder(reship.id, 'admin', 'admin-1');

    expect(reship.status).toBe(OrderStatus.COMPLETED);
    expect(original.status).toBe(OrderStatus.COMPLETED);
  });
});

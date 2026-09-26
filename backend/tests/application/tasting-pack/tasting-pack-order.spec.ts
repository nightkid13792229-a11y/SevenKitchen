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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { OrderService } from '../../src/application/order/order.service';
import { StaffCustomerServiceController } from '../../src/interfaces/controllers/staff-customer-service.controller';
import { Order, OrderStatus, OrderType } from '../../src/domain/order';

const backend = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf-8');

/**
 * 代客下单一步收款（Task 10）
 *
 * 老板的口径：员工在代客下单页填完实收金额、点「创建订单」，
 * 这单当场就算收了钱 —— 不该再回到订单详情点一次「确认收款」，
 * 更不该把线下微信/支付宝的收款记成笼统的 `OFFLINE`。
 */
describe('代客下单一步收款', () => {
  it('控制器默认视为已收款，只有显式 false 才跳过', () => {
    const controller = backend(
      'src/interfaces/controllers/staff-customer-service.controller.ts',
    );

    expect(controller).toContain('confirmOfflinePayment');
    expect(controller).toMatch(/collected\s*!==\s*false/);
  });

  it('确认收款支持指定线下渠道，缺省 OFFLINE_WECHAT', () => {
    const orderService = backend('src/application/order/order.service.ts');

    expect(orderService).toMatch(/channel\s*[:=][^;]*OFFLINE_WECHAT/s);
    expect(orderService).toContain('OFFLINE_PAYMENT_CHANNELS');
  });

  it('渠道在落库之前校验，非法直接拒绝', () => {
    const controller = backend(
      'src/interfaces/controllers/staff-customer-service.controller.ts',
    );

    expect(controller).toContain('isOfflinePaymentMethod');
    const validateAt = controller.indexOf('normalizeOfflinePaymentChannel(');
    const createAt = controller.indexOf('createOrderDraft(');
    expect(validateAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(createAt);
  });

  describe('confirmOfflinePayment 行为', () => {
    const createService = (order: Order) => {
      const orderRepository = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn(async (saved: Order) => saved),
      };
      const statusHistoryRepository = {
        append: jest.fn().mockResolvedValue(undefined),
      };
      // 这个方法只用到订单仓储与状态历史仓库，其余依赖用空对象即可。
      const service = new OrderService(
        orderRepository as any,
        statusHistoryRepository as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      return { service, orderRepository, statusHistoryRepository };
    };

    const pendingOrder = () =>
      Order.fromPrismaData({
        id: 'order-1',
        customerId: 'customer-1',
        status: OrderStatus.PENDING_PAYMENT,
        type: OrderType.FRESH_FOOD,
        createdAt: new Date('2026-11-19T02:00:00.000Z'),
        targetProductionDate: null,
        originalTargetProductionDate: null,
        amountProduct: 699,
        amountShipping: 0,
        amountTotal: 699,
        totalAmount: 699,
      });

    it('写入指定渠道并把订单标记为已付款', async () => {
      const { service, orderRepository, statusHistoryRepository } =
        createService(pendingOrder());

      const saved = await service.confirmOfflinePayment(
        'order-1',
        'u1',
        699,
        'OFFLINE_ALIPAY',
      );

      expect(saved.paymentMethod).toBe('OFFLINE_ALIPAY');
      expect(saved.paidAt).toBeInstanceOf(Date);
      expect(saved.status).toBe(OrderStatus.PAID);
      expect(orderRepository.save).toHaveBeenCalledTimes(1);
      expect(statusHistoryRepository.append).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PAID,
        'admin',
        'u1',
        expect.objectContaining({ paymentMethod: 'OFFLINE_ALIPAY' }),
      );
    });

    it('不传渠道时按线下微信收款落库', async () => {
      const { service } = createService(pendingOrder());

      const saved = await service.confirmOfflinePayment('order-1', 'u1', 699);

      expect(saved.paymentMethod).toBe('OFFLINE_WECHAT');
      expect(saved.paidAt).toBeInstanceOf(Date);
    });

    it('渠道传 null 也按缺省线下微信落库', async () => {
      const { service } = createService(pendingOrder());

      const saved = await service.confirmOfflinePayment(
        'order-1',
        'u1',
        699,
        null as any,
      );

      expect(saved.paymentMethod).toBe('OFFLINE_WECHAT');
      expect(saved.paidAt).toBeInstanceOf(Date);
    });

    it('拒绝枚举之外的渠道，且不落库', async () => {
      const { service, orderRepository } = createService(pendingOrder());

      await expect(
        service.confirmOfflinePayment(
          'order-1',
          'u1',
          699,
          'WECHAT_PAY' as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(orderRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('代客下单控制器', () => {
    const createController = () => {
      const prisma = {
        dog: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'dog-1', ownerId: 'customer-1' }),
        },
        address: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'address-1', userId: 'customer-1' }),
        },
        order: { findUnique: jest.fn() },
        orderOperationLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const orderService = {
        createOrderDraft: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'INIT',
          amountTotal: 699,
          adminRemark: null,
        }),
        confirmOrder: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'PENDING_PAYMENT',
        }),
        updateOrderAmount: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', amountTotal: 699 }),
        updateAdminRemark: jest.fn(),
        confirmOfflinePayment: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'PAID',
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: new Date(),
        }),
        getOrderById: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'PENDING_PAYMENT',
          amountTotal: 699,
        }),
      };
      const controller = new StaffCustomerServiceController(
        prisma as any,
        orderService as any,
        { createAddress: jest.fn() } as any,
      );
      return { controller, prisma, orderService };
    };

    const assistedPayload = (overrides: Record<string, unknown> = {}) => ({
      customerId: 'customer-1',
      dogId: 'dog-1',
      addressId: 'address-1',
      items: [{ recipeId: 'recipe-1', quantityG: 1000 }],
      ...overrides,
    });

    const staff = { userId: 'staff-1', role: 'STAFF' } as any;

    it('非法渠道在建单之前返回 400，一次写入都没有', async () => {
      const { controller, prisma, orderService } = createController();

      const result = await (controller as any).createAssistedOrder(
        assistedPayload({ paymentChannel: 'CASH' }),
        staff,
      );

      expect(result.code).toBe(400);
      expect(orderService.createOrderDraft).not.toHaveBeenCalled();
      expect(orderService.confirmOrder).not.toHaveBeenCalled();
      expect(orderService.updateOrderAmount).not.toHaveBeenCalled();
      expect(orderService.confirmOfflinePayment).not.toHaveBeenCalled();
      expect(prisma.orderOperationLog.create).not.toHaveBeenCalled();
    });

    it('collected:false 返回库里的最新状态，而不是建单时的 INIT', async () => {
      const { controller, orderService } = createController();

      const result = await (controller as any).createAssistedOrder(
        assistedPayload({ collected: false }),
        staff,
      );

      expect(result.code).toBe(0);
      expect(orderService.confirmOfflinePayment).not.toHaveBeenCalled();
      expect(orderService.getOrderById).toHaveBeenCalledWith('order-1');
      expect(result.data.status).toBe('PENDING_PAYMENT');
    });

    it.each(['OFFLINE_ALIPAY', 'OTHER'])(
      '%s 已付单允许客服改价（不能被当成线上支付）',
      async (paymentMethod) => {
        const { controller, prisma, orderService } = createController();
        prisma.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: 'PAID',
          paymentStatus: 'SUCCESS',
          paidAt: new Date('2026-11-19T02:00:00.000Z'),
          amountTotal: 699,
          paymentMethod,
          adminRemark: null,
        });

        const result = await (controller as any).updateUnpaidOrderAmount(
          'order-1',
          { amount: 650, reason: '老客户抹零' },
          staff,
        );

        expect(result.code).toBe(0);
        expect(orderService.updateOrderAmount).toHaveBeenCalledWith(
          'order-1',
          650,
        );
      },
    );
  });
});

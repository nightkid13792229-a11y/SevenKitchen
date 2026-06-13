import { OrderSchedulerService } from '../../../src/application/scheduler/order-scheduler.service';
import { OrderStatus } from '../../../src/domain';

describe('OrderSchedulerService', () => {
  const fixedNow = new Date('2026-06-05T12:00:00.000Z');

  const buildService = ({
    order,
    shippedAt,
    wechatStatus,
    wechatStatusError,
  }: {
    order: any;
    shippedAt: Date;
    wechatStatus?: any;
    wechatStatusError?: Error;
  }) => {
    const orderRepository = {
      findByStatus: jest.fn().mockResolvedValue([order]),
    };
    const statusHistoryRepository = {
      findByOrderId: jest.fn().mockResolvedValue([
        {
          toStatus: OrderStatus.SHIPPED,
          timestamp: shippedAt,
        },
      ]),
    };
    const orderService = {
      completeOrder: jest.fn().mockResolvedValue(undefined),
      cancelOrder: jest.fn(),
    };
    const platformConfigService = {
      getPaymentConfig: jest.fn(),
    };
    const shippingFulfillmentService = {
      queryWechatShippingOrderStatus: wechatStatusError
        ? jest.fn().mockRejectedValue(wechatStatusError)
        : jest.fn().mockResolvedValue(wechatStatus),
    };

    const service = new OrderSchedulerService(
      orderRepository as any,
      statusHistoryRepository as any,
      orderService as any,
      platformConfigService as any,
      shippingFulfillmentService as any,
    );

    return {
      service,
      orderService,
      shippingFulfillmentService,
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-completes a WeChat Pay order when WeChat state is 3', async () => {
    const { service, orderService, shippingFulfillmentService } = buildService({
      order: { id: 'wechat-order-1', paymentMethod: 'WECHAT_PAY' },
      shippedAt: new Date('2026-05-26T12:00:00.000Z'),
      wechatStatus: {
        orderState: 3,
        orderStateLabel: 'USER_CONFIRMED_RECEIPT',
      },
    });

    await service.handleAutoCompleteOrders();

    expect(
      shippingFulfillmentService.queryWechatShippingOrderStatus,
    ).toHaveBeenCalledWith('wechat-order-1');
    expect(orderService.completeOrder).toHaveBeenCalledWith(
      'wechat-order-1',
      'system',
      null,
      {
        autoCompleted: true,
        daysSinceShipped: 10,
        wechatOrderState: 3,
        wechatOrderStateLabel: 'USER_CONFIRMED_RECEIPT',
      },
    );
  });

  it('does not auto-complete a WeChat Pay order when WeChat state is 2', async () => {
    const { service, orderService } = buildService({
      order: { id: 'wechat-order-2', paymentMethod: 'WECHAT_PAY' },
      shippedAt: new Date('2026-05-26T12:00:00.000Z'),
      wechatStatus: {
        orderState: 2,
        orderStateLabel: 'IN_TRANSIT',
      },
    });

    await service.handleAutoCompleteOrders();

    expect(orderService.completeOrder).not.toHaveBeenCalled();
  });

  it('treats legacy WECHAT orders as WeChat online payments before auto-completing', async () => {
    const { service, orderService, shippingFulfillmentService } = buildService({
      order: { id: 'legacy-wechat-order', paymentMethod: 'WECHAT' },
      shippedAt: new Date('2026-05-26T12:00:00.000Z'),
      wechatStatus: {
        orderState: 2,
        orderStateLabel: 'IN_TRANSIT',
      },
    });

    await service.handleAutoCompleteOrders();

    expect(
      shippingFulfillmentService.queryWechatShippingOrderStatus,
    ).toHaveBeenCalledWith('legacy-wechat-order');
    expect(orderService.completeOrder).not.toHaveBeenCalled();
  });

  it('does not throw or auto-complete when WeChat status query fails', async () => {
    const { service, orderService } = buildService({
      order: { id: 'wechat-order-3', paymentMethod: 'WECHAT_PAY' },
      shippedAt: new Date('2026-05-26T12:00:00.000Z'),
      wechatStatusError: new Error('WeChat unavailable'),
    });

    await expect(service.handleAutoCompleteOrders()).resolves.toBeUndefined();
    expect(orderService.completeOrder).not.toHaveBeenCalled();
  });

  it('auto-completes a non-WeChat order after 10 days without querying WeChat', async () => {
    const { service, orderService, shippingFulfillmentService } = buildService({
      order: { id: 'order-1', paymentMethod: 'OFFLINE' },
      shippedAt: new Date('2026-05-26T12:00:00.000Z'),
    });

    await service.handleAutoCompleteOrders();

    expect(
      shippingFulfillmentService.queryWechatShippingOrderStatus,
    ).not.toHaveBeenCalled();
    expect(orderService.completeOrder).toHaveBeenCalledWith(
      'order-1',
      'system',
      null,
      {
        autoCompleted: true,
        daysSinceShipped: 10,
      },
    );
  });

  it('continues processing later shipped orders when one completion fails', async () => {
    const orderRepository = {
      findByStatus: jest.fn().mockResolvedValue([
        { id: 'order-fails', paymentMethod: 'OFFLINE' },
        { id: 'order-completes', paymentMethod: 'OFFLINE' },
      ]),
    };
    const statusHistoryRepository = {
      findByOrderId: jest.fn().mockResolvedValue([
        {
          toStatus: OrderStatus.SHIPPED,
          timestamp: new Date('2026-05-26T12:00:00.000Z'),
        },
      ]),
    };
    const orderService = {
      completeOrder: jest
        .fn()
        .mockRejectedValueOnce(new Error('completion failed'))
        .mockResolvedValueOnce(undefined),
      cancelOrder: jest.fn(),
    };
    const platformConfigService = {
      getPaymentConfig: jest.fn(),
    };
    const shippingFulfillmentService = {
      queryWechatShippingOrderStatus: jest.fn(),
    };
    const service = new OrderSchedulerService(
      orderRepository as any,
      statusHistoryRepository as any,
      orderService as any,
      platformConfigService as any,
      shippingFulfillmentService as any,
    );

    await expect(service.handleAutoCompleteOrders()).resolves.toBeUndefined();

    expect(orderService.completeOrder).toHaveBeenCalledTimes(2);
    expect(orderService.completeOrder).toHaveBeenNthCalledWith(
      1,
      'order-fails',
      'system',
      null,
      {
        autoCompleted: true,
        daysSinceShipped: 10,
      },
    );
    expect(orderService.completeOrder).toHaveBeenNthCalledWith(
      2,
      'order-completes',
      'system',
      null,
      {
        autoCompleted: true,
        daysSinceShipped: 10,
      },
    );
  });

  it('does not auto-complete an order shipped 9 days ago', async () => {
    const { service, orderService, shippingFulfillmentService } = buildService({
      order: { id: 'order-2', paymentMethod: 'WECHAT_PAY' },
      shippedAt: new Date('2026-05-27T12:00:00.000Z'),
    });

    await service.handleAutoCompleteOrders();

    expect(
      shippingFulfillmentService.queryWechatShippingOrderStatus,
    ).not.toHaveBeenCalled();
    expect(orderService.completeOrder).not.toHaveBeenCalled();
  });
});

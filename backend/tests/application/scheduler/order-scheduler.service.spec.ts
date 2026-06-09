import { OrderSchedulerService } from '../../../src/application/scheduler/order-scheduler.service';
import { OrderStatus } from '../../../src/domain';

describe('OrderSchedulerService', () => {
  const fixedNow = new Date('2026-06-05T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-completes shipped orders using the status history timestamp', async () => {
    const orderRepository = {
      findByStatus: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
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
      completeOrder: jest.fn().mockResolvedValue(undefined),
    };
    const platformConfigService = {
      getPaymentConfig: jest.fn(),
    };

    const service = new OrderSchedulerService(
      orderRepository as any,
      statusHistoryRepository as any,
      orderService as any,
      platformConfigService as any,
    );

    await service.handleAutoCompleteOrders();

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
});

/**
 * Shipping Fulfillment Service Unit Tests
 * Phase 8.14: Production Shipment / Fulfillment MVP
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ShippingFulfillmentService } from 'src/shipping-fulfillment.service';
import { ORDER_REPOSITORY, ORDER_STATUS_HISTORY_REPOSITORY } from 'src/order/order.service';
import type { OrderRepository } from 'src/domain/order/order.repository';
import type { OrderStatusHistoryRepository } from 'src/domain/order/order-status-history.repository';
import { Order, OrderItem } from 'src/domain/order';
import { OrderStatus, OrderType } from 'src/domain';
import type { RecipeSnapshot } from 'src/domain/recipe/types';
import { WechatShippingUploadService } from 'src/application/shipping/wechat-shipping-upload.service';
import { ShippingNotificationService } from 'src/application/shipping/shipping-notification.service';

describe('ShippingFulfillmentService - Phase 8.14', () => {
  let service: ShippingFulfillmentService;
  let orderRepository: jest.Mocked<OrderRepository>;

  const mockOrderRepository: jest.Mocked<OrderRepository> = {
    findById: jest.fn(),
    findByCustomerId: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
  };

  const mockStatusHistoryRepository: jest.Mocked<OrderStatusHistoryRepository> = {
    append: jest.fn(),
    findByOrderId: jest.fn(),
  };
  const mockWechatShippingUploadService = {
    uploadForOrder: jest.fn().mockResolvedValue({
      success: true,
      skipped: true,
      message: 'Skipped in unit test',
    }),
    listPendingUploads: jest.fn().mockResolvedValue([]),
    reportPendingSpecialOrders: jest.fn().mockResolvedValue({
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    }),
    reportSpecialOrderForOrder: jest.fn().mockResolvedValue({
      success: true,
      skipped: true,
      message: 'Skipped in unit test',
    }),
    queryShippingOrderStatus: jest.fn(),
  };
  const mockShippingNotificationService = {
    sendForOrder: jest.fn().mockResolvedValue({
      success: true,
      skipped: false,
      message: '发货订阅通知已发送',
    }),
  };

  beforeEach(async () => {
    mockOrderRepository.findById.mockReset();
    mockOrderRepository.findByCustomerId.mockReset();
    mockOrderRepository.findByStatus.mockReset();
    mockOrderRepository.save.mockReset();
    mockStatusHistoryRepository.append.mockReset();
    mockStatusHistoryRepository.findByOrderId.mockReset();
    mockWechatShippingUploadService.uploadForOrder.mockClear();
    mockWechatShippingUploadService.listPendingUploads.mockClear();
    mockWechatShippingUploadService.reportPendingSpecialOrders.mockClear();
    mockWechatShippingUploadService.reportSpecialOrderForOrder.mockClear();
    mockShippingNotificationService.sendForOrder.mockClear();
    mockWechatShippingUploadService.queryShippingOrderStatus.mockReset();

    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingFulfillmentService,
        {
          provide: ORDER_REPOSITORY,
          useValue: mockOrderRepository,
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: mockStatusHistoryRepository,
        },
        {
          provide: WechatShippingUploadService,
          useValue: mockWechatShippingUploadService,
        },
        {
          provide: ShippingNotificationService,
          useValue: mockShippingNotificationService,
        },
      ],
    }).compile();

    service = module.get<ShippingFulfillmentService>(
      ShippingFulfillmentService,
    );
    orderRepository = module.get(ORDER_REPOSITORY);

  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockRecipeSnapshot = (id: string): RecipeSnapshot => {
    return {
      id,
      version: 1,
      name: 'Test Recipe',
      production_loss_rate: 1.07,
      energy_density_kcal_per_kg: 1450,
      nutrition_standard: 'FEDIAF_2021',
      items: [],
    };
  };

  const createMockOrder = (
    id: string,
    status: OrderStatus,
    trackingNumber?: string | null,
    carrierCode?: string | null,
    shippedAt?: Date | null,
  ): Order => {
    const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
    const orderItem = new OrderItem(
      'item-1',
      id,
      'dog-1',
      recipeSnapshot,
      1400,
      14,
      100,
      null,
      310.34,
    );
    const order = new Order(
      id,
      'customer-1',
      status,
      OrderType.FRESH_FOOD,
      new Date('2025-01-01T00:00:00Z'),
      null,
      null,
      250.0,
      0.0,
      250.0,
      [orderItem],
    );
    order.trackingNumber = trackingNumber ?? null;
    order.carrierCode = carrierCode ?? null;
    order.shippedAt = shippedAt ?? null;
    return order;
  };

  describe('listOrdersReadyForShipment', () => {
    it('should return only orders with FREEZING status', async () => {
      // Arrange
      const readyOrder1 = createMockOrder('order-1', OrderStatus.FREEZING);
      const readyOrder2 = createMockOrder('order-2', OrderStatus.FREEZING);
      orderRepository.findByStatus.mockResolvedValue([readyOrder1, readyOrder2]);

      // Act
      const result = await service.listOrdersReadyForShipment();

      // Assert
      expect(orderRepository.findByStatus).toHaveBeenCalledWith(
        OrderStatus.FREEZING,
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('order-1');
      expect(result[0].status).toBe(OrderStatus.FREEZING);
      expect(result[1].id).toBe('order-2');
      expect(result[1].status).toBe(OrderStatus.FREEZING);
    });

    it('should return empty array when no orders are ready', async () => {
      // Arrange
      orderRepository.findByStatus.mockResolvedValue([]);

      // Act
      const result = await service.listOrdersReadyForShipment();

      // Assert
      expect(result).toHaveLength(0);
    });

    it('should include tracking fields in response', async () => {
      // Arrange
      const shippedOrder = createMockOrder(
        'order-1',
        OrderStatus.FREEZING,
        'SF1234567890',
        'SF',
        new Date('2025-12-17T10:00:00Z'),
      );
      orderRepository.findByStatus.mockResolvedValue([shippedOrder]);

      // Act
      const result = await service.listOrdersReadyForShipment();

      // Assert
      expect(result[0].trackingNumber).toBe('SF1234567890');
      expect(result[0].carrierCode).toBe('SF');
      expect(result[0].shippedAt).toBe('2025-12-17T10:00:00.000Z');
    });

    it('should map order items correctly', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      orderRepository.findByStatus.mockResolvedValue([order]);

      // Act
      const result = await service.listOrdersReadyForShipment();

      // Assert
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].id).toBe('item-1');
      expect(result[0].items[0].recipeSnapshotId).toBe('recipe-1');
      expect(result[0].items[0].quantityG).toBe(1400);
    });
  });

  describe('markOrderAsShipped', () => {
    it('should successfully mark order as shipped with tracking info', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      const shippedOrder = createMockOrder(
        'order-1',
        OrderStatus.SHIPPED,
        'SF1234567890',
        'SF',
        new Date(),
      );
      orderRepository.findById
        .mockResolvedValueOnce(order) // First call: get order to mark as shipped
        .mockResolvedValueOnce(shippedOrder); // Second call: reload after save
      orderRepository.save.mockResolvedValue(shippedOrder);

      // Act
      const result = await service.markOrderAsShipped('order-1', {
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
      });

      // Assert
      expect(orderRepository.findById).toHaveBeenCalledWith('order-1');
      expect(orderRepository.save).toHaveBeenCalled();
      expect(result.order.status).toBe(OrderStatus.SHIPPED);
      expect(result.order.trackingNumber).toBe('SF1234567890');
      expect(result.order.carrierCode).toBe('SF');
      expect(result.order.shippedAt).toBeInstanceOf(Date);
      expect(result.wechatShippingUpload.success).toBe(true);
    });

    it('should trigger the customer shipping subscription notification after successful shipment', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      const shippedOrder = createMockOrder(
        'order-1',
        OrderStatus.SHIPPED,
        'SF1234567890',
        'SF',
        new Date(),
      );
      orderRepository.findById
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce(shippedOrder);
      orderRepository.save.mockResolvedValue(shippedOrder);

      // Act
      await service.markOrderAsShipped('order-1', {
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
      });

      // Assert
      expect(mockShippingNotificationService.sendForOrder).toHaveBeenCalledWith(
        'order-1',
      );
    });

    it('should throw NotFoundException when order not found', async () => {
      // Arrange
      orderRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.markOrderAsShipped('non-existent', {
          trackingNumber: 'SF1234567890',
          carrierCode: 'SF',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when order is not FREEZING', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.PAID);
      orderRepository.findById.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.markOrderAsShipped('order-1', {
          trackingNumber: 'SF1234567890',
          carrierCode: 'SF',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when trackingNumber is missing', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      orderRepository.findById.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.markOrderAsShipped('order-1', {
          trackingNumber: '',
          carrierCode: 'SF',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when carrierCode is missing', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      orderRepository.findById.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.markOrderAsShipped('order-1', {
          trackingNumber: 'SF1234567890',
          carrierCode: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should trim trackingNumber and carrierCode', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      orderRepository.findById.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue(order);

      // Act
      const result = await service.markOrderAsShipped('order-1', {
        trackingNumber: '  SF1234567890  ',
        carrierCode: '  SF  ',
      });

      // Assert
      expect(result.order.trackingNumber).toBe('SF1234567890');
      expect(result.order.carrierCode).toBe('SF');
    });

    it('should fail gracefully when order is already SHIPPED (idempotency)', async () => {
      // Arrange
      const shippedOrder = createMockOrder(
        'order-1',
        OrderStatus.SHIPPED,
        'SF1234567890',
        'SF',
        new Date(),
      );
      orderRepository.findById.mockResolvedValue(shippedOrder);

      // Act & Assert
      await expect(
        service.markOrderAsShipped('order-1', {
          trackingNumber: 'SF9876543210',
          carrierCode: 'SF',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('should set shippedAt timestamp when marking as shipped', async () => {
      // Arrange
      const beforeTime = new Date();
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      const shippedOrder = createMockOrder(
        'order-1',
        OrderStatus.SHIPPED,
        'SF1234567890',
        'SF',
        new Date(),
      );
      orderRepository.findById
        .mockResolvedValueOnce(order) // First call: get order to mark as shipped
        .mockResolvedValueOnce(shippedOrder); // Second call: reload after save
      orderRepository.save.mockResolvedValue(shippedOrder);
      
      // Act
      const result = await service.markOrderAsShipped('order-1', {
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
      });
      
      const afterTime = new Date();

      // Assert
      expect(result.order.shippedAt).toBeInstanceOf(Date);
      // Allow small timing variance (100ms)
      expect(result.order.shippedAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 100);
      expect(result.order.shippedAt!.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 100);
    });

    it('should persist and reload shipping fields correctly', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.FREEZING);
      const shippedOrder = createMockOrder(
        'order-1',
        OrderStatus.SHIPPED,
        'SF1234567890',
        'SF',
        new Date('2025-12-17T10:30:00Z'),
      );
      orderRepository.findById
        .mockResolvedValueOnce(order) // First call: get order to mark as shipped
        .mockResolvedValueOnce(shippedOrder); // Second call: reload after save
      orderRepository.save.mockResolvedValue(shippedOrder);

      // Act
      const result = await service.markOrderAsShipped('order-1', {
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
      });

      // Assert: Verify that reloaded order contains shipping fields
      expect(orderRepository.findById).toHaveBeenCalledWith('order-1');
      expect(orderRepository.save).toHaveBeenCalled();
      expect(result.order.trackingNumber).toBe('SF1234567890');
      expect(result.order.carrierCode).toBe('SF');
      expect(result.order.shippedAt).toBeInstanceOf(Date);
      // Verify that save was called with order containing shipping fields
      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      expect(savedOrder.trackingNumber).toBe('SF1234567890');
      expect(savedOrder.carrierCode).toBe('SF');
      expect(savedOrder.shippedAt).toBeInstanceOf(Date);
    });
  });

  describe('queryWechatShippingOrderStatus', () => {
    it('should delegate to WechatShippingUploadService and return status details', async () => {
      mockWechatShippingUploadService.queryShippingOrderStatus.mockResolvedValue({
        success: true,
        message: '微信发货订单状态已查询',
        orderState: 3,
        orderStateLabel: '确认收货',
        inComplaint: false,
      });

      const result = await service.queryWechatShippingOrderStatus('order-1');

      expect(
        mockWechatShippingUploadService.queryShippingOrderStatus,
      ).toHaveBeenCalledWith('order-1');
      expect(result.orderState).toBe(3);
      expect(result.orderStateLabel).toBe('确认收货');
    });
  });
});

describe('WechatShippingUploadService queryShippingOrderStatus', () => {
  let service: WechatShippingUploadService;
  let mockPrisma: {
    order: { findUnique: jest.Mock };
    paymentConfig: { upsert: jest.Mock };
  };
  let mockWechatService: {
    getShippingOrder: jest.Mock;
  };

  const mockOrder = (
    overrides: Partial<{
      id: string;
      paymentMethod: string;
      paymentStatus: string;
      transactionId: string | null;
    }> = {},
  ) => ({
    id: 'order-1',
    paymentMethod: 'WECHAT_PAY',
    paymentStatus: 'SUCCESS',
    transactionId: '4200000000000000001',
    ...overrides,
  });

  beforeEach(() => {
    mockPrisma = {
      order: {
        findUnique: jest.fn(),
      },
      paymentConfig: {
        upsert: jest.fn(),
      },
    };
    mockWechatService = {
      getShippingOrder: jest.fn(),
    };
    service = new WechatShippingUploadService(
      mockPrisma as any,
      mockWechatService as any,
    );
  });

  it('maps successful WeChat status response queried by transaction id', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder());
    mockPrisma.paymentConfig.upsert.mockResolvedValue({
      appId: 'wx-app-id',
      mchId: '1900000001',
    });
    mockWechatService.getShippingOrder.mockResolvedValue({
      errcode: 0,
      errmsg: 'ok',
      order: {
        order_state: 3,
        in_complaint: false,
      },
    });

    const result = await service.queryShippingOrderStatus('order-1');

    expect(mockWechatService.getShippingOrder).toHaveBeenCalledWith(
      {
        transactionId: '4200000000000000001',
        merchantId: '1900000001',
      },
      'wx-app-id',
    );
    expect(result).toMatchObject({
      success: true,
      orderState: 3,
      orderStateLabel: '确认收货',
      inComplaint: false,
    });
  });

  it('treats legacy WECHAT payment method as an online WeChat order', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(
      mockOrder({ paymentMethod: 'WECHAT' }),
    );
    mockPrisma.paymentConfig.upsert.mockResolvedValue({
      appId: 'wx-app-id',
      mchId: '1900000001',
    });
    mockWechatService.getShippingOrder.mockResolvedValue({
      errcode: 0,
      errmsg: 'ok',
      order: {
        order_state: 3,
      },
    });

    const result = await service.queryShippingOrderStatus('order-1');

    expect(mockWechatService.getShippingOrder).toHaveBeenCalledWith(
      {
        transactionId: '4200000000000000001',
        merchantId: '1900000001',
      },
      'wx-app-id',
    );
    expect(result).toMatchObject({
      success: true,
      orderState: 3,
    });
  });

  it('falls back to merchant trade number when transaction id is missing', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(
      mockOrder({
        id: 'order-with-dashes-1',
        transactionId: null,
      }),
    );
    mockPrisma.paymentConfig.upsert.mockResolvedValue({
      appId: 'wx-app-id',
      mchId: '1900000001',
    });
    mockWechatService.getShippingOrder.mockResolvedValue({
      errcode: 0,
      errmsg: 'ok',
      order: {
        order_state: 3,
      },
    });

    await service.queryShippingOrderStatus('order-with-dashes-1');

    expect(mockWechatService.getShippingOrder).toHaveBeenCalledWith(
      {
        merchantId: '1900000001',
        merchantTradeNo: 'orderwithdashes1',
      },
      'wx-app-id',
    );
  });

  it('fails clearly when WeChat status response is missing order state', async () => {
    const response = {
      errcode: 0,
      errmsg: 'ok',
      order: {},
    };
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder());
    mockPrisma.paymentConfig.upsert.mockResolvedValue({
      appId: 'wx-app-id',
      mchId: '1900000001',
    });
    mockWechatService.getShippingOrder.mockResolvedValue(response);

    const result = await service.queryShippingOrderStatus('order-1');

    expect(result).toEqual({
      success: false,
      skipped: false,
      message: '微信发货订单状态响应缺少订单状态',
      response,
    });
  });

  it('skips non-WeChat payment without querying WeChat', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(
      mockOrder({ paymentMethod: 'ALIPAY' }),
    );

    const result = await service.queryShippingOrderStatus('order-1');

    expect(result).toMatchObject({
      success: true,
      skipped: true,
    });
    expect(mockWechatService.getShippingOrder).not.toHaveBeenCalled();
  });

  it('skips unpaid WeChat order without querying WeChat', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(
      mockOrder({ paymentStatus: 'PENDING' }),
    );

    const result = await service.queryShippingOrderStatus('order-1');

    expect(result).toMatchObject({
      success: true,
      skipped: true,
    });
    expect(mockWechatService.getShippingOrder).not.toHaveBeenCalled();
  });

  it('returns skipped failure when merchant id is missing', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder());
    mockPrisma.paymentConfig.upsert.mockResolvedValue({
      appId: 'wx-app-id',
      mchId: null,
    });

    const result = await service.queryShippingOrderStatus('order-1');

    expect(result).toMatchObject({
      success: false,
      skipped: true,
      message: '后台支付配置缺少微信支付商户号，无法查询微信发货订单状态',
    });
    expect(mockWechatService.getShippingOrder).not.toHaveBeenCalled();
  });
});

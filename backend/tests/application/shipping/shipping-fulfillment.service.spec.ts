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

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<ShippingFulfillmentService>(
      ShippingFulfillmentService,
    );
    orderRepository = module.get(ORDER_REPOSITORY);

    jest.clearAllMocks();
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
      recipeSnapshot,
      1400,
      14,
      100,
      null,
      310.34,
    );
    return new Order(
      id,
      'customer-1',
      status,
      OrderType.FRESH_FOOD,
      null,
      250.0,
      0.0,
      250.0,
      [orderItem],
      undefined,
      undefined,
      undefined,
      undefined,
      trackingNumber,
      carrierCode,
      shippedAt,
    );
  };

  describe('listOrdersReadyForShipment', () => {
    it('should return only orders with READY_FOR_SHIPMENT status', async () => {
      // Arrange
      const readyOrder1 = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
      const readyOrder2 = createMockOrder('order-2', OrderStatus.READY_FOR_SHIPMENT);
      orderRepository.findByStatus.mockResolvedValue([readyOrder1, readyOrder2]);

      // Act
      const result = await service.listOrdersReadyForShipment();

      // Assert
      expect(orderRepository.findByStatus).toHaveBeenCalledWith(
        OrderStatus.READY_FOR_SHIPMENT,
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('order-1');
      expect(result[0].status).toBe(OrderStatus.READY_FOR_SHIPMENT);
      expect(result[1].id).toBe('order-2');
      expect(result[1].status).toBe(OrderStatus.READY_FOR_SHIPMENT);
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
        OrderStatus.READY_FOR_SHIPMENT,
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
      const order = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
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
      const order = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
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
      expect(orderRepository.findById).toHaveBeenCalledTimes(2); // Once to get, once to reload
      expect(orderRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(OrderStatus.SHIPPED);
      expect(result.trackingNumber).toBe('SF1234567890');
      expect(result.carrierCode).toBe('SF');
      expect(result.shippedAt).toBeInstanceOf(Date);
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

    it('should throw BadRequestException when order is not READY_FOR_SHIPMENT', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.IN_PRODUCTION);
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
      const order = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
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
      const order = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
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
      const order = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
      orderRepository.findById.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue(order);

      // Act
      const result = await service.markOrderAsShipped('order-1', {
        trackingNumber: '  SF1234567890  ',
        carrierCode: '  SF  ',
      });

      // Assert
      expect(result.trackingNumber).toBe('SF1234567890');
      expect(result.carrierCode).toBe('SF');
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
      const order = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
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
      expect(result.shippedAt).toBeInstanceOf(Date);
      // Allow small timing variance (100ms)
      expect(result.shippedAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 100);
      expect(result.shippedAt!.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 100);
    });

    it('should persist and reload shipping fields correctly', async () => {
      // Arrange
      const order = createMockOrder('order-1', OrderStatus.READY_FOR_SHIPMENT);
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
      expect(orderRepository.findById).toHaveBeenCalledTimes(2);
      expect(orderRepository.save).toHaveBeenCalled();
      expect(result.trackingNumber).toBe('SF1234567890');
      expect(result.carrierCode).toBe('SF');
      expect(result.shippedAt).toBeInstanceOf(Date);
      // Verify that save was called with order containing shipping fields
      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      expect(savedOrder.trackingNumber).toBe('SF1234567890');
      expect(savedOrder.carrierCode).toBe('SF');
      expect(savedOrder.shippedAt).toBeInstanceOf(Date);
    });
  });
});


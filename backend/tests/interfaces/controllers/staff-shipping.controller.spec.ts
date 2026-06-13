/**
 * Staff Shipping Controller Unit Tests
 * Phase 8.14: Production Shipment / Fulfillment MVP
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StaffShippingController } from 'src/staff-shipping.controller';
import { ShippingFulfillmentService } from 'src/application/shipping/shipping-fulfillment.service';
import { OrderStatus } from 'src/domain';
import { AuthGuard } from 'src/interfaces/auth/auth.guard';
import { StaffGuard } from 'src/interfaces/guards/role.guard';

describe('StaffShippingController - Phase 8.14', () => {
  let controller: StaffShippingController;
  let shippingFulfillmentService: jest.Mocked<ShippingFulfillmentService>;

  const mockShippingFulfillmentService: jest.Mocked<ShippingFulfillmentService> = {
    listOrdersReadyForShipment: jest.fn(),
    markOrderAsShipped: jest.fn(),
    queryWechatShippingOrderStatus: jest.fn(),
  } as any;

  beforeEach(async () => {
    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffShippingController],
      providers: [
        {
          provide: ShippingFulfillmentService,
          useValue: mockShippingFulfillmentService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<StaffShippingController>(
      StaffShippingController,
    );
    shippingFulfillmentService = module.get(ShippingFulfillmentService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /staff/shipping/orders', () => {
    it('should return list of orders ready for shipment', async () => {
      // Arrange
      const mockOrders = [
        {
          id: 'order-1',
          customerId: 'customer-1',
          status: OrderStatus.READY_FOR_SHIPMENT,
          amountTotal: 250.0,
          addressId: 'address-1',
          trackingNumber: null,
          carrierCode: null,
          shippedAt: null,
          items: [
            {
              id: 'item-1',
              recipeSnapshotId: 'recipe-1',
              quantityG: 1400,
            },
          ],
        },
      ];
      shippingFulfillmentService.listOrdersReadyForShipment.mockResolvedValue(
        mockOrders as any,
      );

      // Act
      const result = await controller.listOrdersReadyForShipment();

      // Assert
      expect(result.code).toBe(0);
      expect(result.data).toEqual(mockOrders);
      expect(
        shippingFulfillmentService.listOrdersReadyForShipment,
      ).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no orders are ready', async () => {
      // Arrange
      shippingFulfillmentService.listOrdersReadyForShipment.mockResolvedValue(
        [],
      );

      // Act
      const result = await controller.listOrdersReadyForShipment();

      // Assert
      expect(result.code).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('POST /staff/shipping/orders/:orderId/ship', () => {
    it('should return 200 and mark order as shipped successfully', async () => {
      // Arrange
      const mockOrder = {
        id: 'order-1',
        status: OrderStatus.SHIPPED,
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
        shippedAt: new Date('2025-12-17T10:00:00Z'),
      };
      shippingFulfillmentService.markOrderAsShipped.mockResolvedValue(
        {
          order: mockOrder,
          wechatShippingUpload: {
            success: true,
            skipped: true,
            message: 'Skipped in unit test',
          },
        } as any,
      );

      // Act
      const result = await controller.markOrderAsShipped('order-1', {
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
      });

      // Assert
      expect(result.code).toBe(0);
      expect(result.data).toEqual({
        id: 'order-1',
        status: OrderStatus.SHIPPED,
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
        shippedAt: '2025-12-17T10:00:00.000Z',
        wechatShippingUpload: {
          success: true,
          skipped: true,
          message: 'Skipped in unit test',
        },
      });
      expect(shippingFulfillmentService.markOrderAsShipped).toHaveBeenCalledWith(
        'order-1',
        {
          trackingNumber: 'SF1234567890',
          carrierCode: 'SF',
        },
        'staff',
        null,
      );
    });

    it('should return 404 when order not found', async () => {
      // Arrange
      shippingFulfillmentService.markOrderAsShipped.mockRejectedValue(
        new NotFoundException('Order not found: order-999'),
      );

      // Act & Assert
      await expect(
        controller.markOrderAsShipped('order-999', {
          trackingNumber: 'SF1234567890',
          carrierCode: 'SF',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 400 when order is not in READY_FOR_SHIPMENT status', async () => {
      // Arrange
      shippingFulfillmentService.markOrderAsShipped.mockRejectedValue(
        new BadRequestException(
          'Cannot mark order as shipped from status: IN_PRODUCTION. Order must be in READY_FOR_SHIPMENT status.',
        ),
      );

      // Act & Assert
      await expect(
        controller.markOrderAsShipped('order-1', {
          trackingNumber: 'SF1234567890',
          carrierCode: 'SF',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 when trackingNumber is missing', async () => {
      // Arrange
      shippingFulfillmentService.markOrderAsShipped.mockRejectedValue(
        new BadRequestException('Tracking number is required'),
      );

      // Act & Assert
      await expect(
        controller.markOrderAsShipped('order-1', {
          trackingNumber: '',
          carrierCode: 'SF',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 when carrierCode is missing', async () => {
      // Arrange
      shippingFulfillmentService.markOrderAsShipped.mockRejectedValue(
        new BadRequestException('Carrier code is required'),
      );

      // Act & Assert
      await expect(
        controller.markOrderAsShipped('order-1', {
          trackingNumber: 'SF1234567890',
          carrierCode: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate request body structure', async () => {
      // Arrange
      const mockOrder = {
        id: 'order-1',
        status: OrderStatus.SHIPPED,
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
        shippedAt: new Date(),
      };
      shippingFulfillmentService.markOrderAsShipped.mockResolvedValue(
        {
          order: mockOrder,
          wechatShippingUpload: {
            success: true,
            skipped: true,
            message: 'Skipped in unit test',
          },
        } as any,
      );

      // Act
      const result = await controller.markOrderAsShipped('order-1', {
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
      });

      // Assert
      expect(result.code).toBe(0);
      expect(result.data).toHaveProperty('trackingNumber');
      expect(result.data).toHaveProperty('carrierCode');
      expect(result.data).toHaveProperty('shippedAt');
    });
  });

  describe('GET /staff/shipping/orders/:orderId/wechat-shipping-status', () => {
    it('should keep the diagnostic endpoint staff-guarded', () => {
      const source = readFileSync(
        resolve(
          process.cwd(),
          'src/interfaces/controllers/staff-shipping.controller.ts',
        ),
        'utf8',
      );

      expect(source).toMatch(
        /@Get\('orders\/:orderId\/wechat-shipping-status'\)\s+@UseGuards\(AuthGuard, StaffGuard\)/,
      );
    });

    it('should return WeChat shipping order status', async () => {
      // Arrange
      const mockResult = {
        success: true,
        skipped: false,
        message: '微信订单状态：确认收货',
        orderState: 3 as const,
        orderStateLabel: '确认收货',
        inComplaint: false,
        response: {
          order_state: 3,
          order_state_desc: '确认收货',
        },
      };
      shippingFulfillmentService.queryWechatShippingOrderStatus.mockResolvedValue(
        mockResult,
      );

      // Act
      const result =
        await controller.getWechatShippingOrderStatus('order-1');

      // Assert
      expect(result.code).toBe(0);
      expect(result.data).toEqual(mockResult);
      expect(
        shippingFulfillmentService.queryWechatShippingOrderStatus,
      ).toHaveBeenCalledWith('order-1');
      expect(
        shippingFulfillmentService.queryWechatShippingOrderStatus,
      ).toHaveBeenCalledTimes(1);
    });
  });
});

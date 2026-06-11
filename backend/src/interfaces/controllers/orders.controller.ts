/**
 * Orders Controller
 * Handles order related endpoints
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { OrderService } from '../../application/order/order.service';
import { WechatPaymentService } from '../../application/payment/wechat-payment.service';
import { RecipeService } from '../../application/recipe/recipe.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { Inject } from '@nestjs/common';
import { ORDER_REPOSITORY } from '../../application/order/order.service.tokens';
import { DOG_REPOSITORY } from '../../application/dog/dog.service';
import { PRODUCTION_BATCH_REPOSITORY } from '../../application/production/production.service';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import { Order, OrderItem } from '../../domain/order';
import { OrderStatus } from '../../domain';
import {
  InvalidStateTransitionError,
  ValidationError,
} from '../../domain/common/errors';
import { CreateOrderDto } from '../dto/orders/create-order.dto';
import {
  OrderDto,
  OrderItemDto,
  OrderSummaryDto,
} from '../dto/orders/order-response.dto';
import { CancelOrderDto } from '../dto/orders/cancel-order.dto';
import { CreateAftersaleDto } from '../dto/orders/create-aftersale.dto';
import { ResolveAftersaleDto } from '../dto/orders/resolve-aftersale.dto';
import { PaymentDto } from '../dto/orders/payment-response.dto';
import {
  PricingPreviewRequestDto,
  PricingPreviewResponseDto,
  PricingBreakdownResponseDto,
} from '../dto/orders/pricing-preview.dto';
import { SharePhotosResponseDto } from '../dto/orders/share-photos.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { AuthGuard, CurrentUser } from '../auth';
import { StaffGuard } from '../guards/role.guard';
import type { RequestUser } from '../auth';
import { resolveOrderProductionPhotos } from './order-production-photos';
import {
  ShippingNotificationService,
  type ShippingNotificationChoice,
} from '../../application/shipping/shipping-notification.service';

@ApiTags('Orders')
@Controller('api/v1/orders')
export class OrdersController {
  constructor(
    private readonly orderService: OrderService,
    private readonly wechatPaymentService: WechatPaymentService,
    private readonly recipeService: RecipeService,
    private readonly prisma: PrismaService,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    @Inject(PRODUCTION_BATCH_REPOSITORY)
    private readonly productionRepository: ProductionBatchRepository,
    private readonly shippingNotificationService: ShippingNotificationService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create order draft' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({
    status: 201,
    description: 'Order draft created successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const customerId = user.customerId;

      // Validate: at least one of snapshotId, cartItemIds, or (dogId + items) must be provided
      if (
        !createOrderDto.snapshotId &&
        !createOrderDto.cartItemIds &&
        (!createOrderDto.dogId || !createOrderDto.items)
      ) {
        return ApiResponseDto.error(
          400,
          'Either snapshotId, cartItemIds, or (dogId + items) must be provided',
        );
      }

      const order = await this.orderService.createOrderDraft({
        customerId,
        dogId: createOrderDto.dogId,
        type: createOrderDto.type,
        ingredientSourcePlan: createOrderDto.ingredientSourcePlan,
        targetProductionDate: createOrderDto.targetProductionDate
          ? new Date(createOrderDto.targetProductionDate)
          : null,
        items: createOrderDto.items,
        cartItemIds: createOrderDto.cartItemIds,
        snapshotId: createOrderDto.snapshotId,
        addressId: createOrderDto.addressId,
      });

      const response = await this.mapOrderToDto(order);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Confirm order (submit for payment)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order confirmed, status: PENDING_PAYMENT',
    type: OrderDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 400, description: 'Invalid state transition' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async confirmOrder(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.confirmOrder(
        id,
        'customer', // Phase 8.18: Actor attribution
        user.customerId, // Phase 8.18: Actor ID
      );
      const response = await this.mapOrderToDto(order);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof InvalidStateTransitionError) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Process payment (mock)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment processed, status: PAID',
    type: OrderDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 400, description: 'Invalid state transition' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async payOrder(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.processPayment(
        id,
        'WECHAT', // Default payment method
        'customer', // Phase 8.18: Actor attribution
        user.customerId, // Phase 8.18: Actor ID
      );
      const response = await this.mapOrderToDto(order);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof InvalidStateTransitionError) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post(':id/wechat-pay')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create WeChat JSAPI payment params' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async createWechatPayment(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const payment = await this.wechatPaymentService.createJsapiPayment(
        id,
        user.customerId,
      );
      return ApiResponseDto.success(payment);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Get(':orderId/shipping-notification/preference')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get customer shipping notification preference' })
  @ApiSecurity('X-Customer-Id')
  async getShippingNotificationPreference(
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const preference =
        await this.shippingNotificationService.getCustomerPreference(
          orderId,
          user.customerId,
        );
      return ApiResponseDto.success(preference);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Post(':orderId/shipping-notification/subscription')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Record customer shipping notification choice' })
  @ApiSecurity('X-Customer-Id')
  async recordShippingNotificationSubscription(
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: { choice: ShippingNotificationChoice },
  ) {
    const choice = body.choice;
    if (choice !== 'ACCEPTED' && choice !== 'REJECTED') {
      return ApiResponseDto.error(400, 'Invalid subscription choice');
    }

    try {
      const result = await this.shippingNotificationService.recordCustomerChoice(
        orderId,
        user.customerId,
        choice,
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Get(':orderId/shipping-notice')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get customer shipping notice and cooking tips' })
  @ApiSecurity('X-Customer-Id')
  async getShippingNotice(
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const notice =
        await this.shippingNotificationService.getCustomerShippingNotice(
          orderId,
          user.customerId,
        );
      return ApiResponseDto.success(notice);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Get(':id/payment')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get payment transaction details (Phase 8.17)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment transaction details',
    type: PaymentDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async getPaymentDetails(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<PaymentDto> | ApiResponseDto<null>> {
    const order = await this.orderService.getOrderById(id);
    if (!order) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    // Permission check: STAFF and ADMIN can view all orders, CUSTOMER can only view their own
    const isStaffOrAdmin = user.role === 'STAFF' || user.role === 'ADMIN';
    if (!isStaffOrAdmin && order.customerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    const payment: PaymentDto = {
      paymentMethod: order.paymentMethod ?? null,
      transactionId: order.transactionId ?? null,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      paymentStatus: order.paymentStatus ?? null,
    };

    return ApiResponseDto.success(payment);
  }

  @Get(':id/history')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get order status history (Phase 8.18)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order status history',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromStatus: { type: 'string' },
          toStatus: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          actor: {
            type: 'string',
            enum: ['customer', 'staff', 'admin', 'system'],
          },
          actorId: { type: 'string', nullable: true },
          metadata: { type: 'object', nullable: true },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async getOrderHistory(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any[]> | ApiResponseDto<null>> {
    const order = await this.orderService.getOrderById(id);
    if (!order) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    // Permission check: STAFF and ADMIN can view all orders, CUSTOMER can only view their own
    const isStaffOrAdmin = user.role === 'STAFF' || user.role === 'ADMIN';
    if (!isStaffOrAdmin && order.customerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    const history = await this.orderService.getOrderStatusHistory(id);
    const historyDto = history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      timestamp: h.timestamp.toISOString(),
      actor: h.actor,
      actorId: h.actorId,
      metadata: h.metadata,
    }));

    return ApiResponseDto.success(historyDto);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List orders for current customer' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Order summary list',
    type: [OrderSummaryDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async listOrders(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderSummaryDto[]>> {
    const customerId = user.customerId;

    const orders = await this.orderService.listOrdersByCustomerId(customerId);
    const summaries = await Promise.all(
      orders.map((order) => this.mapOrderToSummaryDto(order)),
    );
    return ApiResponseDto.success(summaries);
  }

  @Get(':id/financial-summary')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get customer-facing order financial summary' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async getOrderFinancialSummary(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    const order = await this.orderService.getOrderById(id);
    if (!order) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    const isStaffOrAdmin = user.role === 'STAFF' || user.role === 'ADMIN';
    if (!isStaffOrAdmin && order.customerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    const summary = await this.orderService.getOrderFinancialSummary(id);
    const visibleAdjustments = (summary.adjustments ?? []).filter(
      (adjustment) => adjustment.visibleToCustomer,
    );
    const customerAdjustmentSummary = this.summarizeCustomerAdjustments(
      visibleAdjustments,
      summary.amountTotal,
    );

    return ApiResponseDto.success({
      orderId: summary.orderId,
      settlementStatus: summary.settlementStatus,
      shortageAdjustmentAmount: summary.shortageAdjustmentAmount,
      requiresCustomerPayment:
        customerAdjustmentSummary.pendingExtraPaymentAmount > 0,
      refundStatus: summary.refundStatus,
      adjustmentSummary: customerAdjustmentSummary,
      adjustments: visibleAdjustments.map((adjustment) => ({
        id: adjustment.id,
        sourceType: adjustment.sourceType,
        adjustmentType: adjustment.adjustmentType,
        amount: adjustment.amount,
        reason: adjustment.reason,
        status: adjustment.status,
        requiresCustomerPayment: adjustment.requiresCustomerPayment,
        visibleToCustomer: adjustment.visibleToCustomer,
        settledAt: adjustment.settledAt,
        createdAt: adjustment.createdAt,
      })),
      latestSettlement: summary.latestSettlement
        ? {
            plannedOutputG: summary.latestSettlement.plannedOutputG,
            actualOutputG: summary.latestSettlement.actualOutputG,
            shortageG: summary.latestSettlement.shortageG,
            settledAt: summary.latestSettlement.settledAt,
          }
        : null,
    });
  }

  private summarizeCustomerAdjustments(
    adjustments: Array<{ amount: number; status: string }>,
    baseAmount: number,
  ) {
    const activeAdjustments = adjustments.filter(
      (adjustment) => adjustment.status !== 'CANCELLED',
    );
    const sum = (
      predicate: (adjustment: { amount: number; status: string }) => boolean,
    ) =>
      Number(
        activeAdjustments
          .reduce(
            (total, adjustment) =>
              predicate(adjustment)
                ? total + Math.abs(Number(adjustment.amount || 0))
                : total,
            0,
          )
          .toFixed(2),
      );
    const netAdjustmentAmount = Number(
      activeAdjustments
        .reduce((total, adjustment) => total + Number(adjustment.amount || 0), 0)
        .toFixed(2),
    );

    return {
      totalIncreaseAmount: sum((adjustment) => adjustment.amount > 0),
      totalDecreaseAmount: sum((adjustment) => adjustment.amount < 0),
      pendingExtraPaymentAmount: sum(
        (adjustment) =>
          adjustment.status === 'PENDING' && adjustment.amount > 0,
      ),
      pendingRefundAmount: sum(
        (adjustment) =>
          adjustment.status === 'PENDING' && adjustment.amount < 0,
      ),
      settledExtraPaymentAmount: sum(
        (adjustment) =>
          adjustment.status === 'SETTLED' && adjustment.amount > 0,
      ),
      settledRefundAmount: sum(
        (adjustment) =>
          adjustment.status === 'SETTLED' && adjustment.amount < 0,
      ),
      netAdjustmentAmount,
      netRevenue: Number(
        (Number(baseAmount || 0) + netAdjustmentAmount).toFixed(2),
      ),
    };
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get order detail' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order detail',
    type: OrderDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async getOrder(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    const order = await this.orderService.getOrderById(this.normalizeOrderId(id));
    if (!order) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    // Permission check: STAFF and ADMIN can view all orders, CUSTOMER can only view their own
    const isStaffOrAdmin = user.role === 'STAFF' || user.role === 'ADMIN';
    if (!isStaffOrAdmin && order.customerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    const response = await this.mapOrderToDto(order);
    return ApiResponseDto.success(response);
  }

  private normalizeOrderId(id: string) {
    const normalized = String(id || '').trim();
    if (/^[0-9a-f]{32}$/i.test(normalized)) {
      return normalized.replace(
        /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
        '$1-$2-$3-$4-$5',
      );
    }
    return normalized;
  }

  @Get(':id/pricing-breakdown')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      'Get order pricing breakdown (Phase 7.1) and price explanation (Phase 7.2)',
    description:
      'Returns the pricing breakdown snapshot captured at order creation time, plus customer-facing price explanation. Returns 200 with null data if breakdown is not available (e.g., legacy orders).',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Pricing breakdown snapshot',
    type: PricingBreakdownResponseDto,
  })
  @ApiResponse({
    status: 200,
    description:
      'Pricing breakdown not available (legacy order) - returns code=0 with data=null',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async getPricingBreakdown(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<
    ApiResponseDto<PricingBreakdownResponseDto> | ApiResponseDto<null>
  > {
    const order = await this.orderService.getOrderById(id);
    if (!order) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    // Permission check: STAFF and ADMIN can view all orders, CUSTOMER can only view their own
    const isStaffOrAdmin = user.role === 'STAFF' || user.role === 'ADMIN';
    if (!isStaffOrAdmin && order.customerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    // If breakdown snapshot is not available (legacy orders), return 200 with null
    if (!order.pricingBreakdownSnapshot) {
      return ApiResponseDto.success(null);
    }

    const snapshot = order.pricingBreakdownSnapshot;

    // Map to pricing breakdown response (Phase 7.1)
    const response: PricingBreakdownResponseDto = {
      costIngredients: snapshot.costIngredients,
      costPackaging: snapshot.costPackaging,
      costLabor: snapshot.costLabor,
      costOverhead: snapshot.costOverhead,
      totalProductCost: snapshot.totalProductCost,
      productPrice: snapshot.productPrice,
      shippingFee: snapshot.shippingFee,
      totalPrice: snapshot.totalPrice,
      shippingTemplateId: snapshot.shippingTemplateId,
      marginStrategyName: snapshot.marginStrategyName,
      createdAt: snapshot.createdAt.toISOString(),
      ingredientPriceVersionHash: snapshot.ingredientPriceVersionHash ?? null,
      // Phase 7.2: Add price explanation (mapping in application layer)
      priceExplanation: this.orderService.mapToPriceExplanation(snapshot),
    };

    return ApiResponseDto.success(response);
  }

  @Get('items/:itemId/snapshot')
  @ApiOperation({ summary: 'Get order item recipe snapshot (immutable)' })
  @ApiParam({ name: 'itemId', description: 'Order Item ID' })
  @ApiResponse({
    status: 200,
    description: 'Recipe snapshot',
    schema: {
      type: 'object',
      description: 'Immutable recipe snapshot',
    },
  })
  @ApiResponse({ status: 404, description: 'Order or item not found' })
  async getOrderItemSnapshot(
    @Param('itemId') itemId: string,
  ): Promise<ApiResponseDto<RecipeSnapshot> | ApiResponseDto<null>> {
    // TODO: Get orderId from request or find via itemId
    // For now, we need to search all orders (inefficient, but works for InMemory repo)
    const snapshot = await this.findSnapshotByItemId(itemId);
    if (!snapshot) {
      return ApiResponseDto.error(404, 'Order item not found');
    }

    return ApiResponseDto.success(snapshot);
  }

  @Post(':id/cancel')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel order (Phase 8.16)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBody({ type: CancelOrderDto })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async cancelOrder(
    @Param('id') id: string,
    @Body() cancelOrderDto: CancelOrderDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.getOrderById(id);
      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      // Customer isolation: ensure customer can only cancel their own orders
      if (order.customerId !== user.customerId) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      const cancelledOrder = await this.orderService.cancelOrder(
        id,
        cancelOrderDto.reason,
        'customer',
        user.customerId, // Phase 8.18: Actor ID
      );
      const response = await this.mapOrderToDto(cancelledOrder);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      if (error instanceof InvalidStateTransitionError) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post(':id/complete')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer confirms receipt and completes order' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order completed successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async completeOrderByCustomer(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.getOrderById(id);
      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      if (order.customerId !== user.customerId) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      const completedOrder = await this.orderService.completeOrder(
        id,
        'customer',
        user.customerId,
        { source: 'miniapp_confirm_receipt' },
      );
      const response = await this.mapOrderToDto(completedOrder);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof InvalidStateTransitionError ||
        error instanceof ValidationError
      ) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('pricing/preview')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview order pricing (without creating order)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: PricingPreviewRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Pricing preview',
    type: PricingPreviewResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 404,
    description: 'Dog, recipe, or address not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  @ApiResponse({ status: 422, description: 'Validation error' })
  async previewPricing(
    @Body() requestDto: PricingPreviewRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<PricingPreviewResponseDto> | ApiResponseDto<null>> {
    // Generate correlation ID for diagnostics
    const correlationId = `preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const customerId = user.customerId;

    try {
      // Log request for diagnostics (without sensitive data)
      console.log(`[${correlationId}] Pricing preview request`, {
        customerId,
        orderType: requestDto.type,
        itemCount: requestDto.items?.length || 0,
        hasAddressId: !!requestDto.addressId,
        hasDogId: !!requestDto.dogId,
        pricingPurpose: requestDto.pricingPurpose ?? 'ORDER',
      });

      const preview = await this.orderService.previewPricing({
        customerId,
        dogId: requestDto.dogId,
        type: requestDto.type,
        ingredientSourcePlan: requestDto.ingredientSourcePlan,
        pricingPurpose: requestDto.pricingPurpose,
        targetProductionDate: null,
        items: requestDto.items,
        addressId: requestDto.addressId,
      });

      console.log(`[${correlationId}] Pricing preview success`, {
        amountProduct: preview.amountProduct,
        amountShipping: preview.amountShipping,
        amountTotal: preview.amountTotal,
      });

      return ApiResponseDto.success(preview);
    } catch (error) {
      // Determine if this is a validation error (expected user-input issue) vs system error
      const isValidationError =
        error instanceof BadRequestException ||
        (error &&
          typeof error === 'object' &&
          'response' in error &&
          typeof error.response === 'object' &&
          error.response !== null &&
          'message' in error.response &&
          'statusCode' in error.response &&
          error.response.statusCode === 400);

      // Log validation errors at WARN level (expected user-input state)
      // Log system errors at ERROR level (unexpected failures)
      if (isValidationError) {
        console.warn(
          `[${correlationId}] Pricing preview validation failure (expected user-input state)`,
          {
            customerId,
            orderType: requestDto.type,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      } else {
        console.error(`[${correlationId}] Pricing preview error`, {
          customerId,
          orderType: requestDto.type,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          requestBody: JSON.stringify(requestDto, null, 2),
        });
      }

      // Handle known exceptions
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }

      // Handle validation errors (from class-validator)
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response !== null &&
        'message' in error.response
      ) {
        const validationMessage = Array.isArray(error.response.message)
          ? error.response.message.join(', ')
          : String(error.response.message);
        return ApiResponseDto.error(
          422,
          `Validation error: ${validationMessage}`,
        );
      }

      // Handle domain validation errors
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        return ApiResponseDto.error(400, error.message);
      }

      // Unknown error - return generic message (don't leak internal details)
      return ApiResponseDto.error(
        500,
        'An error occurred while calculating pricing. Please try again.',
      );
    }
  }

  private async mapOrderToDto(order: Order): Promise<OrderDto> {
    const customer = await this.prisma.user.findUnique({
      where: { id: order.customerId },
      select: {
        id: true,
        nickname: true,
        phone: true,
        avatarUrl: true,
      },
    });

    // Map pricing breakdown snapshot if available
    const pricingBreakdown = order.pricingBreakdownSnapshot
      ? {
          costIngredients: order.pricingBreakdownSnapshot.costIngredients,
          costPackaging: order.pricingBreakdownSnapshot.costPackaging,
          costLabor: order.pricingBreakdownSnapshot.costLabor,
          costOverhead: order.pricingBreakdownSnapshot.costOverhead,
          totalProductCost: order.pricingBreakdownSnapshot.totalProductCost,
          productPrice: order.pricingBreakdownSnapshot.productPrice,
          shippingFee: order.pricingBreakdownSnapshot.shippingFee,
          totalPrice: order.pricingBreakdownSnapshot.totalPrice,
        }
      : undefined;

    // Fetch dog information for each item
    // For single-item orders (direct buy mode), use order amountProduct as item totalPrice
    const itemTotalPrice =
      order.items.length === 1 ? order.amountProduct : undefined;

    console.log('[Order Detail] Order items count:', order.items.length);
    console.log('[Order Detail] itemTotalPrice:', itemTotalPrice);
    console.log('[Order Detail] order.amountProduct:', order.amountProduct);
    console.log('[Order Detail] order.amountTotal:', order.amountTotal);

    const items = await Promise.all(
      order.items.map((item) => this.mapOrderItemToDto(item, itemTotalPrice)),
    );

    // Debug logging for amount issue
    console.log('[Order Detail] order.totalAmount:', order.totalAmount);
    console.log('[Order Detail] order.amountTotal:', order.amountTotal);
    console.log('[Order Detail] order.amountProduct:', order.amountProduct);
    console.log('[Order Detail] order.amountShipping:', order.amountShipping);

    // 计算预计发货日期（制作日期 + 1天）
    let estimatedShippingDate = null;
    if (order.targetProductionDate) {
      const shippingDate = new Date(order.targetProductionDate);
      shippingDate.setDate(shippingDate.getDate() + 1);
      estimatedShippingDate = shippingDate.toISOString();
      console.log(
        '[Order Detail] Estimated shipping date:',
        estimatedShippingDate,
      );
    }

    const productionPhotos = await this.getOrderProductionPhotos(order);
    const paymentWindow =
      order.status === OrderStatus.PENDING_PAYMENT
        ? await this.wechatPaymentService.getPaymentWindowForOrder(
            order.createdAt,
          )
        : {
            paymentDeadline: null,
            paymentRemainingSeconds: null,
            paymentTimeoutMinutes: null,
            paymentAutoCloseEnabled: null,
          };
    const refundStatus = await this.getRefundStatusForResponse(order);
    const refundRecords = refundStatus
      ? await this.orderService.getOrderRefundRecords(order.id)
      : [];

    return {
      id: order.id,
      customerId: order.customerId,
      dogId: order.dogId,
      addressId: order.addressId,
      address: order.address
        ? {
            id: order.address.id,
            recipientName: order.address.recipientName,
            phone: order.address.phone,
            region: order.address.region,
            regionText: `${order.address.region.province} ${order.address.region.city}${order.address.region.district ? ' ' + order.address.region.district : ''}`,
            detailAddress: order.address.detail,
          }
        : null,
      customer: customer
        ? {
            id: customer.id,
            nickname: customer.nickname,
            phone: customer.phone,
            avatarUrl: customer.avatarUrl,
          }
        : null,
      status: order.status,
      type: order.type,
      targetProductionDate: order.targetProductionDate
        ? order.targetProductionDate.toISOString()
        : null,
      originalTargetProductionDate: (order as any).originalTargetProductionDate
        ? (order as any).originalTargetProductionDate.toISOString()
        : null,
      estimatedShippingDate, // 新增：预计发货日期
      totalAmount: order.totalAmount ?? order.amountTotal,
      amountProduct: order.amountProduct,
      amountShipping: order.amountShipping,
      amountTotal: order.amountTotal,
      items,
      pricingBreakdown,
      pricingBreakdownSnapshot: order.pricingBreakdownSnapshot, // 新增：完整的定价快照
      productionPhotos, // 新增：原料照片
      // Phase 8.14: Shipping tracking fields
      trackingNumber: order.trackingNumber ?? null,
      carrierCode: order.carrierCode ?? null,
      shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
      // Phase 8.15: Order completion
      completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      // Phase 8.16: Order cancellation
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      cancellationReason: order.cancellationReason ?? null,
      cancelledBy: order.cancelledBy ?? null,
      // Phase 8.17: Payment transaction tracking
      paymentMethod: order.paymentMethod ?? null,
      transactionId: order.transactionId ?? null,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      paymentStatus: order.paymentStatus ?? null,
      paymentDeadline: paymentWindow.paymentDeadline,
      paymentRemainingSeconds: paymentWindow.paymentRemainingSeconds,
      paymentTimeoutMinutes: paymentWindow.paymentTimeoutMinutes,
      paymentAutoCloseEnabled: paymentWindow.paymentAutoCloseEnabled,
      aftersaleType: order.aftersaleType ?? null,
      aftersaleReason: order.aftersaleReason ?? null,
      aftersaleSince: order.aftersaleSince
        ? order.aftersaleSince.toISOString()
        : null,
      aftersalePhotos: order.aftersalePhotos ?? [],
      refundStatus,
      refundRecords,
      createdAt: order.createdAt.toISOString(),
    };
  }

  private async getOrderProductionPhotos(order: Order) {
    try {
      return await resolveOrderProductionPhotos(this.prisma, order);
    } catch (error) {
      console.error('[Order Detail] Failed to query production photos:', error);
      return null;
    }
  }

  private async mapOrderItemToDto(
    item: OrderItem,
    totalPrice?: number,
  ): Promise<OrderItemDto> {
    // Fetch dog information if dogId is present
    let dogInfo = undefined;
    if (item.dogId) {
      const dog = await this.dogRepository.findById(item.dogId);
      if (dog) {
        dogInfo = {
          id: dog.id,
          name: dog.name,
          breedName: dog.customBreedName ?? undefined,
          weightKg: dog.currentWeightKg,
          gender: dog.gender,
        };
      }
    }

    console.log(
      '[mapOrderItemToDto] Item ID:',
      item.id,
      'dogId:',
      item.dogId,
      'dogInfo:',
      dogInfo,
      'totalPrice:',
      totalPrice,
    );

    return {
      id: item.id,
      orderId: item.orderId,
      dogId: item.dogId,
      recipeSnapshot: item.recipeSnapshot,
      quantityG: item.quantityG,
      packageCount: item.packageCount,
      packageSpecG: item.packageSpecG,
      packagePlan: item.packagePlan ?? null,
      ingredientSourcePlan: item.ingredientSourcePlan ?? null,
      preparationMethod: item.preparationMethod ?? null,
      cookingMethod: item.cookingMethod ?? null,
      customRequirements: item.customRequirements,
      dailyIntakeG: item.dailyIntakeG,
      dog: dogInfo,
      totalPrice: totalPrice,
    };
  }

  private async mapOrderToSummaryDto(order: Order): Promise<OrderSummaryDto> {
    // Get first item with dog info if available
    let firstItem = undefined;
    if (order.items && order.items.length > 0) {
      const item = order.items[0];

      // Fetch dog information if dogId is present
      let dogInfo = undefined;
      if (item.dogId) {
        const dog = await this.dogRepository.findById(item.dogId);
        if (dog) {
          dogInfo = {
            id: dog.id,
            name: dog.name,
            breedName: dog.customBreedName ?? undefined,
            weightKg: dog.currentWeightKg,
            gender: dog.gender,
            mealsPerDay: dog.mealsPerDay,
          };
        }
      }

      // Fetch recipe cover image using Prisma directly
      let coverImageUrl = undefined;
      if (item.recipeSnapshot?.id) {
        try {
          let recipe = await this.prisma.recipe.findUnique({
            where: { id: item.recipeSnapshot.id },
            select: { coverImageUrl: true },
          });

          // If not found by ID, try to find by recipe name (data consistency workaround)
          if (!recipe && item.recipeSnapshot.name) {
            recipe = await this.prisma.recipe.findFirst({
              where: { name: item.recipeSnapshot.name },
              select: { coverImageUrl: true },
            });
          }

          if (recipe) {
            coverImageUrl = recipe.coverImageUrl?.replace(
              'http://',
              'https://',
            );
          }
        } catch (error: any) {
          // Recipe might be deleted, ignore error
        }
      }

      firstItem = {
        dog: dogInfo,
        recipeSnapshot: item.recipeSnapshot
          ? {
              id: item.recipeSnapshot.id,
              name: item.recipeSnapshot.name,
              coverImageUrl,
            }
          : undefined,
        packageCount: item.packageCount,
        packageSpecG: item.packageSpecG,
        packagePlan: item.packagePlan ?? null,
        ingredientSourcePlan: item.ingredientSourcePlan ?? null,
        dailyIntakeG: item.dailyIntakeG,
      };
    }

    // Get address info if addressId is present
    const address = undefined;
    if (order.addressId) {
      // TODO: Fetch address from repository when address module is available
      // For now, we'll return undefined
    }

    const paymentWindow =
      order.status === OrderStatus.PENDING_PAYMENT
        ? await this.wechatPaymentService.getPaymentWindowForOrder(
            order.createdAt,
          )
        : {
            paymentDeadline: null,
            paymentRemainingSeconds: null,
            paymentTimeoutMinutes: null,
            paymentAutoCloseEnabled: null,
          };
    const refundStatus = await this.getRefundStatusForResponse(order);

    return {
      id: order.id,
      status: order.status,
      type: order.type,
      cancellationReason: order.cancellationReason ?? null,
      aftersaleType: order.aftersaleType ?? null,
      totalAmount: order.totalAmount ?? order.amountTotal,
      itemCount: order.items.length,
      createdAt: order.createdAt.toISOString(),
      paymentDeadline: paymentWindow.paymentDeadline,
      paymentRemainingSeconds: paymentWindow.paymentRemainingSeconds,
      paymentTimeoutMinutes: paymentWindow.paymentTimeoutMinutes,
      paymentAutoCloseEnabled: paymentWindow.paymentAutoCloseEnabled,
      refundStatus,
      firstItem,
      address,
    };
  }

  private async getRefundStatusForResponse(order: Order) {
    if (order.paymentMethod !== 'WECHAT_PAY') {
      return null;
    }

    const looksLikeRefundFlow =
      order.status === OrderStatus.AFTERSALE ||
      order.status === OrderStatus.CANCELLED ||
      (order.cancellationReason || '').includes('售后退款');

    if (!looksLikeRefundFlow) {
      return null;
    }

    return this.orderService.getOrderRefundStatus(order.id);
  }

  /**
   * Mark order as freezing (急冻中待发货)
   * Phase 9.1: Staff endpoint to mark order as freezing after production photos uploaded
   */
  @Post(':id/freezing')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Mark order as freezing (急冻中待发货)' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order marked as freezing successfully',
    type: OrderDto,
  })
  async markAsFreezing(
    @Param('id') orderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const order = await this.orderService.markAsFreezing(orderId, user.userId);
    return this.mapOrderToDto(order);
  }

  /**
   * Apply for aftersale (申请售后)
   * Phase 9.1: Customer endpoint to apply for aftersale
   */
  @Post(':id/aftersale')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Apply for aftersale (申请售后)' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBody({ type: CreateAftersaleDto })
  @ApiResponse({
    status: 200,
    description: 'Aftersale request created successfully',
    type: OrderDto,
  })
  async applyForAftersale(
    @Param('id') orderId: string,
    @Body() dto: CreateAftersaleDto,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const order = await this.orderService.applyForAftersale(
        orderId,
        user.userId,
        dto.type as any,
        dto.reason,
        dto.photos || [],
      );
      return ApiResponseDto.success(await this.mapOrderToDto(order));
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof InvalidStateTransitionError ||
        error instanceof ValidationError
      ) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * Resolve aftersale (解决售后)
   * Phase 9.1: Admin/Staff endpoint to resolve aftersale request
   */
  @Post(':id/aftersale/resolve')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: 'Resolve aftersale (解决售后)' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBody({ type: ResolveAftersaleDto })
  @ApiResponse({
    status: 200,
    description: 'Aftersale resolved successfully',
    type: OrderDto,
  })
  async resolveAftersale(
    @Param('id') orderId: string,
    @Body() dto: ResolveAftersaleDto,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      let adminNote = dto.adminNote;
      if (dto.resolutionType === 'refunded') {
        if (user.role !== 'ADMIN') {
          return ApiResponseDto.error(403, '退款申请仅管理员可以审核');
        }
        const order = await this.orderRepository.findById(orderId);
        if (!order) {
          return ApiResponseDto.error(404, `Order not found: ${orderId}`);
        }
        const refund = await this.wechatPaymentService.createRefund({
          orderId,
          amount: order.amountTotal,
          reason: dto.adminNote || order.aftersaleReason || '售后退款',
          adminId: user.userId,
          source: 'AFTERSALE_APPROVE',
        });
        const refundNote = `微信原路退款已发起；退款单号：${refund.outRefundNo}`;
        adminNote = [dto.adminNote, refundNote].filter(Boolean).join('\n');
      }

      const order = await this.orderService.resolveAftersale(
        orderId,
        dto.resolutionType,
        user.userId,
        adminNote,
        user.role,
      );
      return ApiResponseDto.success(await this.mapOrderToDto(order));
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return ApiResponseDto.error(403, error.message);
      }
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof InvalidStateTransitionError ||
        error instanceof ValidationError
      ) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Get('aftersale/refunds')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: 'Get refund aftersale records including resolved refunds' })
  @ApiSecurity('X-Customer-Id')
  async getRefundAftersaleRecords(@CurrentUser() user: RequestUser) {
    if (user.role !== 'ADMIN') {
      return ApiResponseDto.success([]);
    }
    const orders = await this.orderService.getRefundAftersaleRecords();
    const data = await Promise.all(orders.map((order) => this.mapOrderToDto(order)));
    return ApiResponseDto.success(data);
  }

  /**
   * Get pending aftersale orders
   * Phase 9.1: Admin/Staff endpoint to get list of orders in AFTERSALE status
   */
  @Get('aftersale/pending')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: 'Get pending aftersale orders' })
  @ApiSecurity('X-Customer-Id')
  @ApiResponse({
    status: 200,
    description: 'List of pending aftersale orders',
    type: [OrderDto],
  })
  async getPendingAftersales(@CurrentUser() user: RequestUser) {
    const orders = await this.orderService.getPendingAftersales();
    const visibleOrders =
      user.role === 'ADMIN'
        ? orders
        : orders.filter((order) => order.aftersaleType !== 'REFUND');
    const data = await Promise.all(
      visibleOrders.map((order) => this.mapOrderToDto(order)),
    );
    return ApiResponseDto.success(data);
  }

  /**
   * Update order address
   * Only order owner or admin can modify (NOT STAFF)
   */
  @Put(':id/address')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update order address' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        addressId: { type: 'string', description: 'New address ID' },
      },
      required: ['addressId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Order address updated successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order or address not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async updateOrderAddress(
    @Param('id') id: string,
    @Body() body: { addressId: string },
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const updatedOrder = await this.orderService.updateOrderAddress(
        id,
        body.addressId,
        user.userId,
        user.role,
      );
      const response = await this.mapOrderToDto(updatedOrder);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      if (error instanceof InvalidStateTransitionError) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * Update order target production date
   * Only order owner or admin can modify (NOT STAFF)
   */
  @Put(':id/production-date')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update order target production date' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        targetProductionDate: {
          type: 'string',
          format: 'date',
          description: 'New target production date (YYYY-MM-DD)',
        },
      },
      required: ['targetProductionDate'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Order target production date updated successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async updateOrderTargetDate(
    @Param('id') id: string,
    @Body() body: { targetProductionDate: string },
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const updatedOrder = await this.orderService.updateOrderTargetDate(
        id,
        new Date(body.targetProductionDate),
        user.userId,
        user.role,
      );
      const response = await this.mapOrderToDto(updatedOrder);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      if (error instanceof InvalidStateTransitionError) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * Generate share token for order photos
   * Only order owner or admin can share
   */
  @Post(':id/share-photos')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Generate share token for order photos' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Share token generated successfully',
    type: SharePhotosResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 400, description: 'Order has no production photos' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async sharePhotos(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<SharePhotosResponseDto> | ApiResponseDto<null>> {
    try {
      // Check if order exists and user has permission
      const order = await this.orderRepository.findById(id);
      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      // Check permission: only order owner or admin can share
      // Note: role comparison is case-insensitive to handle both 'admin' and 'ADMIN'
      if (
        order.customerId !== user.customerId &&
        user.role?.toLowerCase() !== 'admin'
      ) {
        return ApiResponseDto.error(
          403,
          "You do not have permission to share this order's photos",
        );
      }

      // Check if order has production photos (stored in PackagingUnit)
      // Get order items first
      const orderItems = await this.prisma.orderItem.findMany({
        where: { orderId: id },
        select: { id: true },
      });

      if (!orderItems || orderItems.length === 0) {
        return ApiResponseDto.error(400, 'This order has no items');
      }

      const orderItemIds = orderItems.map((item) => item.id);

      // Find packaging units that contain these order items
      const packagingUnits = await this.prisma.packagingUnit.findMany({
        where: {
          sourceOrderItemIds: {
            hasSome: orderItemIds,
          },
        },
        select: {
          photosCooked: true,
          photosPortioned: true,
          photosRaw: true,
        },
      });

      // Check if any photos exist
      let hasPhotos = false;
      for (const unit of packagingUnits) {
        if (
          (unit.photosRaw && unit.photosRaw.length > 0) ||
          (unit.photosCooked && unit.photosCooked.length > 0) ||
          (unit.photosPortioned && unit.photosPortioned.length > 0)
        ) {
          hasPhotos = true;
          break;
        }
      }

      if (!hasPhotos) {
        return ApiResponseDto.error(
          400,
          'This order has no production photos to share',
        );
      }

      // Generate random token (32 characters)
      const crypto = require('crypto');
      const token = crypto.randomBytes(16).toString('hex');

      // Set expiration time (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Save token to database
      await this.prisma.photoShareToken.create({
        data: {
          orderId: id,
          token: token,
          expiresAt: expiresAt,
          createdBy: user.userId,
        },
      });

      const response: SharePhotosResponseDto = {
        token: token,
        expiresAt: expiresAt,
      };

      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  private async findSnapshotByItemId(
    itemId: string,
  ): Promise<RecipeSnapshot | null> {
    // Search through all orders to find the item
    // TODO: In real implementation, add findOrderItemById to repository for efficiency
    // For now, we search by iterating through orders by status
    // Phase 9: Simplified status list (removed READY_FOR_PACKAGING, READY_FOR_SHIPMENT)
    const statusesToSearch = [
      OrderStatus.INIT,
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.FREEZING,
      OrderStatus.SHIPPED,
      OrderStatus.COMPLETED,
    ];

    for (const status of statusesToSearch) {
      const orders = await this.orderRepository.findByStatus(status);
      for (const order of orders) {
        const item = order.items.find((i: OrderItem) => i.id === itemId);
        if (item) {
          return item.recipeSnapshot;
        }
      }
    }

    return null;
  }
}

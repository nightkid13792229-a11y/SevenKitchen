/**
 * Orders Controller
 * Handles order related endpoints
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
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
import { Inject } from '@nestjs/common';
import { ORDER_REPOSITORY } from '../../application/order/order.service.tokens';
import type { OrderRepository } from '../../domain/order/order.repository';
import { Order, OrderItem } from '../../domain/order';
import { OrderStatus } from '../../domain';
import { InvalidStateTransitionError } from '../../domain/common/errors';
import { CreateOrderDto } from '../dto/orders/create-order.dto';
import {
  OrderDto,
  OrderItemDto,
  OrderSummaryDto,
} from '../dto/orders/order-response.dto';
import {
  PricingPreviewRequestDto,
  PricingPreviewResponseDto,
  PricingBreakdownResponseDto,
} from '../dto/orders/pricing-preview.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Orders')
@Controller('api/v1/orders')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class OrdersController {
  constructor(
    private readonly orderService: OrderService,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
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

      const order = await this.orderService.createOrderDraft({
        customerId,
        dogId: createOrderDto.dogId,
        type: createOrderDto.type,
        targetProductionDate: createOrderDto.targetProductionDate
          ? new Date(createOrderDto.targetProductionDate)
          : null,
        items: createOrderDto.items,
        addressId: createOrderDto.addressId,
      });

      const response = this.mapOrderToDto(order);
      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm order (submit for payment)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order confirmed, status: PENDING_PAYMENT',
    type: OrderDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 400, description: 'Invalid state transition' })
  async confirmOrder(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.confirmOrder(id);
      const response = this.mapOrderToDto(order);
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
  @ApiOperation({ summary: 'Process payment (mock)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment processed, status: PAID',
    type: OrderDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 400, description: 'Invalid state transition' })
  async payOrder(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.processPayment(id);
      const response = this.mapOrderToDto(order);
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
    const summaries = orders.map((order) => this.mapOrderToSummaryDto(order));
    return ApiResponseDto.success(summaries);
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
    const order = await this.orderService.getOrderById(id);
    if (!order) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    // Customer isolation: ensure customer can only access their own orders
    if (order.customerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Order not found');
    }

    const response = this.mapOrderToDto(order);
    return ApiResponseDto.success(response);
  }

  @Get(':id/pricing-breakdown')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get order pricing breakdown (Phase 7.1) and price explanation (Phase 7.2)',
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

    // Customer isolation: ensure customer can only access their own orders
    if (order.customerId !== user.customerId) {
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
  @ApiResponse({ status: 404, description: 'Dog, recipe, or address not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  @ApiResponse({ status: 422, description: 'Validation error' })
  async previewPricing(
    @Body() requestDto: PricingPreviewRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<
    ApiResponseDto<PricingPreviewResponseDto> | ApiResponseDto<null>
  > {
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
      });

      const preview = await this.orderService.previewPricing({
        customerId,
        dogId: requestDto.dogId,
        type: requestDto.type,
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
        console.warn(`[${correlationId}] Pricing preview validation failure (expected user-input state)`, {
          customerId,
          orderType: requestDto.type,
          error: error instanceof Error ? error.message : String(error),
        });
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
        return ApiResponseDto.error(422, `Validation error: ${validationMessage}`);
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

  private mapOrderToDto(order: Order): OrderDto {
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

    return {
      id: order.id,
      customerId: order.customerId,
      dogId: order.dogId,
      addressId: order.addressId,
      status: order.status,
      type: order.type,
      targetProductionDate: order.targetProductionDate
        ? order.targetProductionDate.toISOString()
        : null,
      totalAmount: order.totalAmount ?? order.amountTotal,
      amountProduct: order.amountProduct,
      amountShipping: order.amountShipping,
      amountTotal: order.amountTotal,
      items: order.items.map((item) => this.mapOrderItemToDto(item)),
      pricingBreakdown,
    };
  }

  private mapOrderItemToDto(item: OrderItem): OrderItemDto {
    return {
      id: item.id,
      orderId: item.orderId,
      recipeSnapshot: item.recipeSnapshot,
      quantityG: item.quantityG,
      packageCount: item.packageCount,
      packageSpecG: item.packageSpecG,
      customRequirements: item.customRequirements,
    };
  }

  private mapOrderToSummaryDto(order: Order): OrderSummaryDto {
    return {
      id: order.id,
      status: order.status,
      type: order.type,
      totalAmount: order.totalAmount ?? order.amountTotal,
      itemCount: order.items.length,
    };
  }

  private async findSnapshotByItemId(
    itemId: string,
  ): Promise<RecipeSnapshot | null> {
    // Search through all orders to find the item
    // TODO: In real implementation, add findOrderItemById to repository for efficiency
    // For now, we search by iterating through orders by status
    const statusesToSearch = [
      OrderStatus.INIT,
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
      OrderStatus.WAITING_FOR_PRODUCTION,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.READY_FOR_PACKAGING,
      OrderStatus.READY_FOR_SHIPMENT,
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

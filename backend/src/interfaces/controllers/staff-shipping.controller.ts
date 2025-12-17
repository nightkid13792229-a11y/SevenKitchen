/**
 * Staff Shipping Controller
 * Phase 8.14: Production Shipment / Fulfillment MVP
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ShippingFulfillmentService } from '../../application/shipping/shipping-fulfillment.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { OrderStatus } from '../../domain';

export class MarkOrderAsShippedRequestDto {
  trackingNumber!: string;
  carrierCode!: string;
}

export class OrderReadyForShipmentResponseDto {
  id!: string;
  customerId!: string;
  status!: OrderStatus;
  amountTotal!: number;
  addressId!: string | null;
  trackingNumber!: string | null;
  carrierCode!: string | null;
  shippedAt!: string | null;
  items!: Array<{
    id: string;
    recipeSnapshotId: string;
    quantityG: number;
  }>;
}

@ApiTags('Staff Shipping')
@Controller('api/v1/staff/shipping')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class StaffShippingController {
  constructor(
    private readonly shippingFulfillmentService: ShippingFulfillmentService,
  ) {}

  @Get('orders')
  @ApiOperation({ summary: 'List orders ready for shipment' })
  @ApiResponse({
    status: 200,
    description: 'List of orders ready for shipment',
    type: [OrderReadyForShipmentResponseDto],
  })
  async listOrdersReadyForShipment(): Promise<
    ApiResponseDto<OrderReadyForShipmentResponseDto[]>
  > {
    const orders = await this.shippingFulfillmentService.listOrdersReadyForShipment();
    return ApiResponseDto.success(orders);
  }

  @Post('orders/:orderId/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as shipped with tracking information' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: MarkOrderAsShippedRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Order marked as shipped successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async markOrderAsShipped(
    @Param('orderId') orderId: string,
    @Body() dto: MarkOrderAsShippedRequestDto,
  ): Promise<ApiResponseDto<{ id: string; status: OrderStatus; trackingNumber: string; carrierCode: string; shippedAt: string }>> {
    try {
      const order = await this.shippingFulfillmentService.markOrderAsShipped(
        orderId,
        dto,
      );

      return ApiResponseDto.success({
        id: order.id,
        status: order.status,
        trackingNumber: order.trackingNumber || '',
        carrierCode: order.carrierCode || '',
        shippedAt: order.shippedAt?.toISOString() || '',
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw error;
    }
  }
}

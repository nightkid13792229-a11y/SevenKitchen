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
  Query,
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
  ApiProperty,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { ShippingFulfillmentService } from '../../application/shipping/shipping-fulfillment.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { OrderStatus } from '../../domain';

export class MarkOrderAsShippedRequestDto {
  @ApiProperty({ description: 'Tracking number', example: 'SF1234567890' })
  @IsString()
  @IsNotEmpty()
  trackingNumber!: string;

  @ApiProperty({ description: 'Carrier code', example: 'SF' })
  @IsString()
  @IsNotEmpty()
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
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
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
    const orders =
      await this.shippingFulfillmentService.listOrdersReadyForShipment();
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
  ): Promise<
    ApiResponseDto<{
      id: string;
      status: OrderStatus;
      trackingNumber: string;
      carrierCode: string;
      shippedAt: string;
      wechatShippingUpload: {
        success: boolean;
        skipped?: boolean;
        message: string;
      };
    }>
  > {
    try {
      const result = await this.shippingFulfillmentService.markOrderAsShipped(
        orderId,
        dto,
        'staff', // Phase 8.18: Actor attribution
        null, // Staff ID not available in current implementation
      );
      const order = result.order;

      return ApiResponseDto.success({
        id: order.id,
        status: order.status,
        trackingNumber: order.trackingNumber ?? '',
        carrierCode: order.carrierCode ?? '',
        shippedAt: order.shippedAt?.toISOString() ?? '',
        wechatShippingUpload: {
          success: result.wechatShippingUpload.success,
          skipped: result.wechatShippingUpload.skipped,
          message: result.wechatShippingUpload.message,
        },
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw error;
    }
  }

  @Post('orders/:orderId/wechat-shipping-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload or retry WeChat shipping info for an order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async uploadWechatShippingInfo(
    @Param('orderId') orderId: string,
  ): Promise<
    ApiResponseDto<{
      success: boolean;
      skipped?: boolean;
      message: string;
      response?: unknown;
    }>
  > {
    const result =
      await this.shippingFulfillmentService.uploadWechatShippingInfo(
        orderId,
        'staff',
        null,
      );
    return ApiResponseDto.success(result);
  }

  @Get('wechat-shipping-uploads/pending')
  @ApiOperation({ summary: 'List WeChat shipping upload pending or failed orders' })
  async listPendingWechatShippingUploads(
    @Query('limit') limit?: string,
  ): Promise<
    ApiResponseDto<{
      pendingCount: number;
      candidates: Array<{
        orderId: string;
        status: string;
        paymentStatus: string | null;
        transactionId: string | null;
        trackingNumber: string | null;
        carrierCode: string | null;
        shippedAt: string | null;
        customerName: string | null;
        customerPhone: string | null;
        lastUploadAt: string | null;
        lastSuccess: boolean | null;
        lastSkipped: boolean | null;
        lastMessage: string | null;
        reason: string;
      }>;
    }>
  > {
    const data =
      await this.shippingFulfillmentService.listPendingWechatShippingUploads(
        Number(limit) || 100,
      );
    return ApiResponseDto.success(data);
  }

  @Post('wechat-shipping-uploads/retry-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry all pending WeChat shipping uploads' })
  async retryPendingWechatShippingUploads(
    @Query('limit') limit?: string,
  ): Promise<
    ApiResponseDto<{
      total: number;
      success: number;
      failed: number;
      skipped: number;
      results: Array<{
        orderId: string;
        success: boolean;
        skipped?: boolean;
        message: string;
      }>;
    }>
  > {
    const data =
      await this.shippingFulfillmentService.uploadPendingWechatShippingInfo(
        Number(limit) || 100,
      );
    return ApiResponseDto.success(data);
  }

  @Post('orders/:orderId/wechat-special-shipping-report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report delayed/unshipped WeChat order to platform' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async reportWechatSpecialShippingOrder(
    @Param('orderId') orderId: string,
  ): Promise<
    ApiResponseDto<{
      success: boolean;
      skipped?: boolean;
      message: string;
      response?: unknown;
    }>
  > {
    const result =
      await this.shippingFulfillmentService.reportWechatSpecialShippingOrder(
        orderId,
        'staff',
        null,
      );
    return ApiResponseDto.success(result);
  }

  @Post('wechat-special-shipping-reports/retry-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report all paid but unshipped WeChat orders' })
  async reportPendingWechatSpecialShippingOrders(
    @Query('limit') limit?: string,
  ): Promise<
    ApiResponseDto<{
      total: number;
      success: number;
      failed: number;
      skipped: number;
      results: Array<{
        orderId: string;
        success: boolean;
        skipped?: boolean;
        message: string;
      }>;
    }>
  > {
    const data =
      await this.shippingFulfillmentService.reportPendingWechatSpecialShippingOrders(
        Number(limit) || 100,
      );
    return ApiResponseDto.success(data);
  }
}

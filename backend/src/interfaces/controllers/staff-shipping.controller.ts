/**
 * Staff Shipping Controller
 * Phase 8.14: Production Shipment / Fulfillment MVP
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UsePipes,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
  BadRequestException,
  Optional,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
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
import { OrderShipmentService } from '../../application/shipping/order-shipment.service';
import { WaybillReceiptService } from '../../application/shipping/waybill-receipt.service';
import { SupplementOrderService } from '../../application/supplement-shop/supplement-order.service';
import { AdminUpdateSupplementAddressDto } from '../dto/supplement-prepack.dto';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import type { WechatShippingOrderStatusResult } from '../../application/shipping/wechat-shipping-upload.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { OrderStatus } from '../../domain';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';

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
    @Optional()
    private readonly orderShipmentService?: OrderShipmentService,
    @Optional()
    private readonly waybillReceiptService?: WaybillReceiptService,
    @Optional()
    private readonly supplementOrderService?: SupplementOrderService,
    @Optional()
    private readonly cosService?: TencentCosService,
  ) {}

  @Get('box-options')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: '发货箱型选项（员工端）' })
  async getBoxOptions(): Promise<ApiResponseDto<any[]>> {
    const options = (await this.orderShipmentService?.listBoxOptions()) ?? [];
    return ApiResponseDto.success(options);
  }

  /**
   * ==========================================
   * 快递电子存根识别（2026-11-10）
   *
   * 打包间手上就是一张顺丰电子存根：拍一下读出卖家 / 单号 / 运费，
   * 并在后端跟这单的收货人核一遍。**图不留存**，只留结论行
   * （`waybill_receipt_record`）—— 发货硬锁要靠它。
   * ==========================================
   */

  @Post('upload-receipt')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: '上传快递电子存根（用于识别并自动填发货表单）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReceipt(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<{ url: string; key: string }>> {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }
    if (!this.cosService) {
      throw new BadRequestException('上传服务未就绪');
    }

    const result = await this.cosService.uploadImage(
      file,
      file.originalname,
      'shipping-waybill-receipts',
    );

    return ApiResponseDto.success(result, '上传成功');
  }

  @Post('receipt-recognize')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: '识别快递存根并与订单收货人核对（不落发货单）' })
  async recognizeReceipt(
    @Body() body: { imageUrl?: string; orderIds?: string[] },
    @Req() request: { user?: { userId?: string } },
  ): Promise<ApiResponseDto<any>> {
    const imageUrl = String(body?.imageUrl ?? '').trim();
    if (!imageUrl) {
      throw new BadRequestException('缺少存根图片');
    }

    const orderIds = Array.isArray(body?.orderIds)
      ? body.orderIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    if (orderIds.length === 0) {
      throw new BadRequestException('缺少订单');
    }

    if (!this.waybillReceiptService) {
      throw new BadRequestException('识别服务未就绪');
    }

    const result = await this.waybillReceiptService.recognize({
      imageUrl,
      orderIds,
      userId: request?.user?.userId ?? '',
    });

    return ApiResponseDto.success(result);
  }

  @Post('manual-waybill')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: '手动填写运单号（AI 认不出来时的出口，必须写原因）' })
  async manualWaybill(
    @Body()
    body: { orderIds?: string[]; trackingNumber?: string; reason?: string },
    @Req() request: { user?: { userId?: string } },
  ): Promise<ApiResponseDto<{ id: string }>> {
    const orderIds = Array.isArray(body?.orderIds)
      ? body.orderIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    if (orderIds.length === 0) {
      throw new BadRequestException('缺少订单');
    }

    const reason = String(body?.reason ?? '').trim();
    if (reason.length === 0) {
      throw new BadRequestException('手动填写必须说明原因');
    }

    if (!this.waybillReceiptService) {
      throw new BadRequestException('识别服务未就绪');
    }

    const result = await this.waybillReceiptService.createManualRecord({
      orderIds,
      trackingNumber: String(body?.trackingNumber ?? ''),
      reason,
      userId: request?.user?.userId ?? '',
    });

    return ApiResponseDto.success(result);
  }

  /**
   * 补剂单代改收货地址（2026-11-10）。
   *
   * 原先只有后台网页和管理员能改，小程序里补剂单**只能看不能改**。
   * 硬锁上线后「存根对不上 → 先改地址 → 再传存根」是唯一出路，
   * 打包间手上只有手机，这条不通就卡死了。
   *
   * 因此允许员工改，但**必须写原因**，并且落原/新地址审计。
   */
  @Patch('supplement-orders/:id/address')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: '补剂单代改未发货收货地址（必填原因）' })
  async updateSupplementAddress(
    @Param('id') id: string,
    @Body() dto: AdminUpdateSupplementAddressDto,
    @Req() request: { user?: { userId?: string } },
  ): Promise<ApiResponseDto<any>> {
    const reason = String(dto?.reason ?? '').trim();
    if (reason.length === 0) {
      throw new BadRequestException('改收货地址必须写原因');
    }

    if (!this.supplementOrderService) {
      throw new BadRequestException('补剂服务未就绪');
    }

    const result = await this.supplementOrderService.adminUpdateAddress(
      id,
      dto,
      request?.user?.userId ?? null,
    );

    return ApiResponseDto.success(result);
  }

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

  @Get('orders/:orderId/wechat-shipping-status')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiOperation({ summary: 'Query WeChat shipping order status for an order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async getWechatShippingOrderStatus(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<WechatShippingOrderStatusResult>> {
    const result =
      await this.shippingFulfillmentService.queryWechatShippingOrderStatus(
        orderId,
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

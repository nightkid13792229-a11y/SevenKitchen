import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  SupplementCatalogService,
  type UpdateSupplementCatalogItemDto,
} from '../../application/supplement-shop/supplement-catalog.service';
import {
  SupplementShopConfigService,
  type UpdateSupplementShopConfigDto,
} from '../../application/supplement-shop/supplement-shop-config.service';
import {
  SupplementPricingService,
  type SupplementQuoteLineInput,
} from '../../application/supplement-shop/supplement-pricing.service';
import { SupplementOrderService } from '../../application/supplement-shop/supplement-order.service';
import { WechatPaymentService } from '../../application/payment/wechat-payment.service';
import {
  CancelSupplementOrderDto,
  RefundSupplementOrderDto,
  ReshipSupplementOrderDto,
  ConfirmSupplementPaymentDto,
  ListSupplementOrdersQueryDto,
  PackSupplementOrderDto,
  ShipSupplementOrderDto,
  SupplementAftersaleDto,
} from '../dto/supplement-shop.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';

/**
 * 补剂商城 · 后台
 *
 * 第 0 期：补剂上架清单（含数据体检）
 * 第 1 期：可配置的加价倍率 / 分装服务费 / 运费策略 + 报价预览
 */
@ApiTags('Admin Supplement Shop')
@UseGuards(AuthGuard, StaffGuard)
@Controller('api/v1/admin/supplement-shop')
export class AdminSupplementShopController {
  constructor(
    private readonly supplementCatalogService: SupplementCatalogService,
    private readonly supplementShopConfigService: SupplementShopConfigService,
    private readonly supplementPricingService: SupplementPricingService,
    private readonly supplementOrderService: SupplementOrderService,
    private readonly wechatPaymentService: WechatPaymentService,
  ) {}

  // ---------- 上架清单 ----------

  @Get('catalog')
  @ApiOperation({ summary: '补剂上架清单（含数据体检结果）' })
  async catalog() {
    return ApiResponseDto.success(
      await this.supplementCatalogService.listCatalog(),
    );
  }

  @Patch('catalog/:id')
  @ApiOperation({ summary: '更新单个补剂的上架档案' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplementCatalogItemDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementCatalogService.updateCatalogItem(id, dto),
    );
  }

  @Post('catalog/enable-all-producible')
  @ApiOperation({
    summary: '一键上架全部可用于生产的补剂（先自动补齐空白档案）',
  })
  async enableAllProducible() {
    return ApiResponseDto.success(
      await this.supplementCatalogService.enableAllProducible(),
    );
  }

  @Post('catalog/apply-suggestions')
  @ApiOperation({ summary: '按系统建议批量预填空白项（不覆盖已填内容）' })
  async applySuggestions() {
    return ApiResponseDto.success(
      await this.supplementCatalogService.applySuggestions(),
    );
  }

  // ---------- 商城配置 ----------

  @Get('config')
  @ApiOperation({ summary: '读取补剂商城配置（倍率 / 服务费 / 运费策略 / 效期）' })
  async getConfig() {
    return ApiResponseDto.success(
      await this.supplementShopConfigService.getConfig(),
    );
  }

  @Put('config')
  @ApiOperation({ summary: '更新补剂商城配置' })
  async updateConfig(@Body() dto: UpdateSupplementShopConfigDto) {
    return ApiResponseDto.success(
      await this.supplementShopConfigService.updateConfig(dto),
    );
  }

  // ---------- 报价预览 ----------

  @Post('quote-preview')
  @ApiOperation({ summary: '按当前配置试算一份补剂报价（后台调参用）' })
  async quotePreview(
    @Body()
    body: {
      lines: SupplementQuoteLineInput[];
      totalWeightG?: number;
    },
  ) {
    return ApiResponseDto.success(
      await this.supplementPricingService.previewQuote({
        lines: body.lines || [],
        totalWeightG: body.totalWeightG,
      }),
    );
  }

  // ---------- 补剂订单（后台） ----------

  @Get('orders/summary')
  @ApiOperation({ summary: '补剂订单各状态数量（工作台角标）' })
  async orderSummary() {
    return ApiResponseDto.success(
      await this.supplementOrderService.getStatusCounts(),
    );
  }

  @Get('orders')
  @ApiOperation({ summary: '补剂订单列表（状态 / 关键词筛选）' })
  async listOrders(@Query() query: ListSupplementOrdersQueryDto) {
    return ApiResponseDto.success(
      await this.supplementOrderService.listAllOrders(query),
    );
  }

  @Get('orders/:id')
  @ApiOperation({ summary: '补剂订单详情（分装工单）' })
  async getOrder(@Param('id') id: string) {
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrderById(id),
    );
  }

  @Get('orders/:id/labels')
  @ApiOperation({ summary: '分装标签数据（未分装不允许打印）' })
  async getOrderLabels(@Param('id') id: string) {
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrderLabels(id),
    );
  }

  @Post('orders/:id/confirm-payment')
  @ApiOperation({ summary: '人工确认收款（微信支付接通前使用）' })
  async confirmPayment(
    @Param('id') id: string,
    @Body() dto: ConfirmSupplementPaymentDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.confirmPayment(id, dto),
    );
  }

  @Post('orders/:id/pack')
  @ApiOperation({ summary: '完成分装：填写原瓶到期日，自动算标签效期' })
  async packOrder(
    @Param('id') id: string,
    @Body() dto: PackSupplementOrderDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.packOrder(id, dto),
    );
  }

  @Post('orders/:id/ship')
  @ApiOperation({ summary: '发货：填写快递单号' })
  async shipOrder(
    @Param('id') id: string,
    @Body() dto: ShipSupplementOrderDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.shipOrder(id, dto),
    );
  }

  @Post('orders/:id/cancel')
  @ApiOperation({ summary: '取消补剂订单' })
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelSupplementOrderDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.cancelOrder(id, dto),
    );
  }

  @Post('orders/:id/refund')
  @ApiOperation({ summary: '线上退款（微信原路退回，同时登记售后）' })
  async refundOrder(
    @Param('id') id: string,
    @Body() dto: RefundSupplementOrderDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    return ApiResponseDto.success(
      await this.wechatPaymentService.createSupplementRefund({
        orderId: id,
        amount: dto.amount,
        reason: dto.reason,
        adminId: request.user?.userId ?? null,
      }),
    );
  }

  @Post('orders/:id/reship')
  @ApiOperation({ summary: '免费补发：生成一张 0 元补发单并登记售后' })
  async reshipOrder(
    @Param('id') id: string,
    @Body() dto: ReshipSupplementOrderDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.reshipOrder(id, dto.reason),
    );
  }

  @Post('orders/:id/aftersale')
  @ApiOperation({ summary: '登记售后（无理由退款 / 免费补发）' })
  async markAftersale(
    @Param('id') id: string,
    @Body() dto: SupplementAftersaleDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.markAftersale(id, dto),
    );
  }
}

import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  Optional,
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
import { SupplementLabelService } from '../../label/supplement-label.service';
import { SupplementSchedulingService } from '../../application/supplement-shop/supplement-scheduling.service';
import { SupplementAftersaleService } from '../../application/supplement-shop/supplement-aftersale.service';
import { SupplementNotificationService } from '../../application/supplement-shop/supplement-notification.service';
import {
  SupplementPackagingService,
  type UpsertPackagingRuleInput,
} from '../../application/supplement-shop/supplement-packaging.service';
import {
  AdminUpdateSupplementAddressDto,
  ListSupplementAftersalesQueryDto,
  ResolveAftersaleDto,
  ScheduleSupplementOrderDto,
} from '../dto/supplement-prepack.dto';
import { TimezoneUtil } from '../../utils/timezone.util';
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
import { AdminGuard, StaffGuard } from '../guards/role.guard';

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
    private readonly supplementLabelService: SupplementLabelService,
    @Optional()
    private readonly supplementSchedulingService?: SupplementSchedulingService,
    @Optional()
    private readonly supplementAftersaleService?: SupplementAftersaleService,
    @Optional()
    private readonly supplementPackagingService?: SupplementPackagingService,
    @Optional()
    private readonly supplementNotificationService?: SupplementNotificationService,
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
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '更新单个补剂的上架档案（仅管理员）' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplementCatalogItemDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementCatalogService.updateCatalogItem(id, dto),
    );
  }

  @Post('catalog/enable-all-producible')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: '一键上架全部可用于生产的补剂（先自动补齐空白档案）',
  })
  async enableAllProducible() {
    return ApiResponseDto.success(
      await this.supplementCatalogService.enableAllProducible(),
    );
  }

  @Post('catalog/apply-suggestions')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '按系统建议批量预填空白项（不覆盖已填内容，仅管理员）' })
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

  @Get('config/check')
  @ApiOperation({ summary: '检查当前配置与首发目标值的差异' })
  async checkConfig() {
    return ApiResponseDto.success(
      await this.supplementShopConfigService.getConfigHealth(),
    );
  }

  @Put('config')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '更新补剂商城配置（仅管理员）' })
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
  async listOrders(
    @Query() query: ListSupplementOrdersQueryDto,
    @Req() request: { user?: { role?: string } },
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.listAllOrders(query, {
        role: request.user?.role,
      }),
    );
  }

  @Get('orders/:id')
  @ApiOperation({ summary: '补剂订单详情（分装工单）' })
  async getOrder(
    @Param('id') id: string,
    @Req() request: { user?: { role?: string } },
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrderById(id, {
        role: request.user?.role,
      }),
    );
  }

  @Get('orders/:id/snapshot')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '补剂订单关联的制作单快照（旧单可能无快照）' })
  async getOrderSnapshot(@Param('id') id: string) {
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrderSnapshot(id),
    );
  }

  @Get('orders/:id/labels')
  @ApiOperation({ summary: '分装标签数据（未分装不允许打印）' })
  async getOrderLabels(@Param('id') id: string) {
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrderLabels(id),
    );
  }

  @Post('orders/:id/labels/printed')
  @ApiOperation({ summary: '记录标签已打印/补打（员工可用，不改库存）' })
  async recordLabelsPrinted(
    @Param('id') id: string,
    @Body() dto: { labelIds?: string[] },
    @Req() request: { user?: { userId?: string; role?: string } },
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.recordLabelsPrinted(
        id,
        Array.isArray(dto.labelIds) ? dto.labelIds : [],
        {
          type: request.user?.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
          id: request.user?.userId ?? null,
        },
      ),
    );
  }

  @Get('orders/:id/labels/images')
  @ApiOperation({
    summary: '分装标签图片（PNG base64，一袋一张）',
    description:
      '按袋展开：同一个补剂加量买 3 份就有 3 张标签，labelId 与标签数据接口一一对应。' +
      '未完成分装时沿用标签数据接口的报错行为。',
  })
  async getOrderLabelImages(@Param('id') id: string) {
    const labelData = await this.supplementOrderService.getOrderLabels(id);

    return ApiResponseDto.success({
      orderNo: labelData.orderNo,
      brandName: labelData.brandName,
      receiverName: labelData.receiverName,
      // labelId 原样带出去：小程序端拿它做列表 key，缺了会出现「换了一张图但没重绘」
      labels: labelData.labels.map((label) => ({
        labelId: label.labelId,
        imageBase64: this.supplementLabelService.generateLabelImage(
          label,
          labelData.orderNo,
          labelData.brandName,
        ),
      })),
    });
  }

  @Post('orders/:id/confirm-payment')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '人工确认收款（仅管理员，微信支付接通前使用）' })
  async confirmPayment(
    @Param('id') id: string,
    @Body() dto: ConfirmSupplementPaymentDto,
    @Req() request: { user?: { role?: string } },
  ) {
    return ApiResponseDto.success(
      await this.redactForStaff(
        await this.supplementOrderService.confirmPayment(id, dto),
        request,
      ),
    );
  }

  @Post('orders/:id/schedule')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '管理员改分装日（只允许已付款未分装）' })
  async scheduleOrder(
    @Param('id') id: string,
    @Body() dto: ScheduleSupplementOrderDto,
  ) {
    if (!this.supplementSchedulingService) {
      throw new BadRequestException('排期服务未启用');
    }
    let packingDate: Date;
    try {
      packingDate = TimezoneUtil.parseDateOnly(dto.packingDate);
    } catch {
      throw new BadRequestException('分装日必须是 YYYY-MM-DD');
    }
    await this.supplementSchedulingService.rescheduleOrder(
      id,
      packingDate,
      { type: 'ADMIN' },
      { allowOverbook: dto.allowOverbook, reason: dto.reason },
    );
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrderById(id),
    );
  }

  @Post('orders/:id/pack')
  @ApiOperation({ summary: '完成分装：填写原瓶到期日，自动算标签效期' })
  async packOrder(
    @Param('id') id: string,
    @Body() dto: PackSupplementOrderDto,
    @Req() request: { user?: { role?: string; userId?: string } },
  ) {
    if (dto.force && request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('只有管理员可以强制分装');
    }
    return ApiResponseDto.success(
      await this.redactForStaff(
        await this.supplementOrderService.packOrder(
          id,
          dto,
          request.user?.role === 'ADMIN'
            ? { type: 'ADMIN', id: request.user.userId ?? null }
            : { type: 'STAFF', id: request.user?.userId ?? null },
        ),
        request,
      ),
    );
  }

  @Post('orders/:id/ship')
  @ApiOperation({ summary: '发货：填写快递单号' })
  async shipOrder(
    @Param('id') id: string,
    @Body() dto: ShipSupplementOrderDto,
    @Req() request: { user?: { role?: string; userId?: string } },
  ) {
    // 与鲜食单同一口径：正常发货必须有单号和实际运费；无需发货则都不用填
    if (dto.shippingType !== 'NOT_REQUIRED') {
      if (!String(dto.trackingNumber || '').trim()) {
        return ApiResponseDto.error(400, '请填写快递单号');
      }
      if (dto.actualShippingFee === undefined || dto.actualShippingFee === null) {
        return ApiResponseDto.error(400, '请填写实际运费');
      }
    }

    return ApiResponseDto.success(
      await this.redactForStaff(
        await this.supplementOrderService.shipOrder(id, dto, {
          type: request.user?.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
          id: request.user?.userId ?? null,
        }),
        request,
      ),
    );
  }

  @Post('orders/:id/complete')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '管理员手动完成已发货订单' })
  async completeOrder(
    @Param('id') id: string,
    @Req() request: { user?: { userId?: string } },
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.completeOrder(
        id,
        request.user?.userId ?? null,
      ),
    );
  }

  @Patch('orders/:id/address')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '管理员代改未发货收货地址（写原/新地址审计）' })
  async adminUpdateAddress(
    @Param('id') id: string,
    @Body() dto: AdminUpdateSupplementAddressDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.adminUpdateAddress(
        id,
        dto,
        request.user?.userId ?? null,
      ),
    );
  }

  @Post('orders/:id/cancel')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '取消补剂订单（仅管理员）' })
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelSupplementOrderDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    const order = await this.supplementOrderService.getOrderById(id);
    if (order.status === 'PAID' && order.paymentMethod !== 'RESHIP') {
      if (!this.supplementAftersaleService) {
        throw new BadRequestException('售后记录服务未启用');
      }
      return ApiResponseDto.success(
        await this.supplementAftersaleService.cancelPaidOrder(
          null,
          id,
          dto.reason,
          { type: 'ADMIN', id: request.user?.userId ?? null },
        ),
      );
    }
    return ApiResponseDto.success(
      await this.supplementOrderService.cancelOrder(id, dto, undefined, {
        type: 'ADMIN',
        id: request.user?.userId ?? null,
      }),
    );
  }

  @Post('orders/:id/notify-delay')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '发送补剂延迟发货通知（站内 + 订阅）' })
  async notifyDelay(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
  ) {
    if (!this.supplementNotificationService) {
      throw new BadRequestException('通知服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementNotificationService.notifyDelay(id, dto.reason),
    );
  }

  @Get('packaging-rules')
  @ApiOperation({ summary: '补剂包材规则（员工只读）' })
  async listPackagingRules() {
    if (!this.supplementPackagingService) {
      throw new BadRequestException('包材服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementPackagingService.listRules(),
    );
  }

  @Get('packaging-ingredients')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '可选包材档案（PACKAGING 原料）' })
  async listPackagingIngredients() {
    if (!this.supplementPackagingService) {
      throw new BadRequestException('包材服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementPackagingService.listPackagingIngredients(),
    );
  }

  @Put('packaging-rules')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '新增/更新补剂包材规则（仅管理员）' })
  async upsertPackagingRule(@Body() dto: UpsertPackagingRuleInput) {
    if (!this.supplementPackagingService) {
      throw new BadRequestException('包材服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementPackagingService.upsertRule(dto),
    );
  }

  @Delete('packaging-rules/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '删除补剂包材规则（仅管理员）' })
  async deletePackagingRule(@Param('id') id: string) {
    if (!this.supplementPackagingService) {
      throw new BadRequestException('包材服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementPackagingService.deleteRule(id),
    );
  }

  @Get('packing-summary')
  @ApiOperation({ summary: '分装汇总：单数/袋数/原料总量/包材/缺料/产能' })
  async packingSummary(@Query('date') date?: string) {
    if (!this.supplementPackagingService) {
      throw new BadRequestException('包材服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementPackagingService.getPackingSummary(date),
    );
  }

  @Get('aftersales')
  @ApiOperation({ summary: '补剂售后列表（员工只读）' })
  async listAftersales(
    @Query() query: ListSupplementAftersalesQueryDto,
    @Req() request: { user?: { role?: string } },
  ) {
    if (!this.supplementAftersaleService) {
      throw new BadRequestException('售后记录服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementAftersaleService.listCases(query, {
        role: request.user?.role,
      }),
    );
  }

  @Post('aftersales/:id/resolve')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '处理售后：退款/补发/仅登记/驳回（管理员）' })
  async resolveAftersale(
    @Param('id') id: string,
    @Body() dto: ResolveAftersaleDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    if (!this.supplementAftersaleService) {
      throw new BadRequestException('售后记录服务未启用');
    }
    return ApiResponseDto.success(
      await this.supplementAftersaleService.resolve(
        request.user?.userId ?? 'admin',
        id,
        dto,
      ),
    );
  }

  @Post('orders/:id/refund')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '线上退款（微信原路退回，同时登记售后，仅管理员）' })
  async refundOrder(
    @Param('id') id: string,
    @Body() dto: RefundSupplementOrderDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    if (!this.supplementAftersaleService) {
      throw new BadRequestException('售后记录服务未启用');
    }
    const view = await this.supplementAftersaleService.createForAdmin(id, {
      requestType: 'REFUND',
      reason: dto.reason,
      amount: dto.amount,
    });
    return ApiResponseDto.success(
      await this.wechatPaymentService.createSupplementRefundForCase({
        caseId: view.id,
        amount: dto.amount,
        reason: dto.reason,
        adminId: request.user?.userId ?? null,
      }),
    );
  }

  @Post('orders/:id/reship')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '免费补发：生成一张 0 元补发单并登记售后（仅管理员）' })
  async reshipOrder(
    @Param('id') id: string,
    @Body() dto: ReshipSupplementOrderDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    if (!this.supplementAftersaleService) {
      throw new BadRequestException('售后记录服务未启用');
    }
    const view = await this.supplementAftersaleService.createForAdmin(id, {
      requestType: 'RESHIP',
      reason: dto.reason,
    });
    const resolved = await this.supplementAftersaleService.resolve(
      request.user?.userId ?? 'admin',
      view.id,
      { resolutionType: 'RESHIP', note: dto.reason },
    );
    return ApiResponseDto.success({
      reship: { orderNo: resolved.reshipOrderNo },
    });
  }

  @Post('orders/:id/aftersale')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '登记售后（无理由退款 / 免费补发，仅管理员）' })
  async markAftersale(
    @Param('id') id: string,
    @Body() dto: SupplementAftersaleDto,
  ) {
    if (!this.supplementAftersaleService) {
      throw new BadRequestException('售后记录服务未启用');
    }
    await this.supplementAftersaleService.createForAdmin(id, {
      requestType: dto.type,
      reason: dto.reason,
    });
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrderById(id),
    );
  }

  /** 员工动作接口也按员工角色脱敏；管理员动作已经 AdminGuard 限制 */
  private async redactForStaff(
    order: Awaited<ReturnType<SupplementOrderService['getOrderById']>>,
    request: { user?: { role?: string } },
  ) {
    if (request.user?.role !== 'STAFF') return order;
    return this.supplementOrderService.getOrderById(order.id, { role: 'STAFF' });
  }
}

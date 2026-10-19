/**
 * Supplement Orders Controller（小程序端）
 * 补剂订单：创建、列表、详情。独立于鲜食订单。
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SupplementOrderService } from '../../application/supplement-shop/supplement-order.service';
import { WechatPaymentService } from '../../application/payment/wechat-payment.service';
import { SupplementAftersaleService } from '../../application/supplement-shop/supplement-aftersale.service';
import {
  CreateSupplementOrderDto,
  ListSupplementOrdersQueryDto,
} from '../dto/supplement-shop.dto';
import {
  CreateSupplementAftersaleDto,
  UpdateSupplementAddressDto,
} from '../dto/supplement-prepack.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Supplement Orders')
@Controller('api/v1/supplement-orders')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SupplementOrdersController {
  constructor(
    private readonly supplementOrderService: SupplementOrderService,
    private readonly wechatPaymentService: WechatPaymentService,
    private readonly aftersaleService: SupplementAftersaleService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '创建补剂订单' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSupplementOrderDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.createOrder(user.userId, dto),
    );
  }

  @Get()
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '我的补剂订单列表' })
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListSupplementOrdersQueryDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.listOrders(user.userId, query),
    );
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '发起微信支付（返回小程序调起支付所需参数）' })
  async pay(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.wechatPaymentService.createSupplementJsapiPayment(
        id,
        user.userId,
      ),
    );
  }

  @Post(':id/sync-payment')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '主动查询微信支付结果（回调丢失时兜底）' })
  async syncPayment(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.wechatPaymentService.syncSupplementPayment(id, user.userId),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '顾客取消未分装补剂订单' })
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: { reason?: string },
  ) {
    const order = await this.supplementOrderService.getOrder(user.userId, id);
    if (order.status === 'PAID') {
      return ApiResponseDto.success(
        await this.aftersaleService.cancelPaidOrder(
          user.userId,
          id,
          dto.reason,
        ),
      );
    }
    return ApiResponseDto.success(
      await this.supplementOrderService.cancelOrder(id, dto, user.userId),
    );
  }

  @Patch(':id/address')
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '未发货自助改收货地址' })
  async updateAddress(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplementAddressDto,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.updateAddress(user.userId, id, dto),
    );
  }

  @Post(':id/repurchase')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '再次购买报价草稿（不直接建单）' })
  async repurchase(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.repurchase(user.userId, id),
    );
  }

  @Post(':id/aftersales')
  @HttpCode(HttpStatus.CREATED)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '申请补剂售后' })
  async createAftersale(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateSupplementAftersaleDto,
  ) {
    return ApiResponseDto.success(
      await this.aftersaleService.createForCustomer(user.userId, id, dto),
    );
  }

  @Get(':id/aftersales')
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '补剂订单的售后记录' })
  async listAftersales(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return ApiResponseDto.success(
      await this.aftersaleService.listForOrder(user.userId, id),
    );
  }

  @Get(':id')
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '补剂订单详情' })
  async detail(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return ApiResponseDto.success(
      await this.supplementOrderService.getOrder(user.userId, id),
    );
  }
}

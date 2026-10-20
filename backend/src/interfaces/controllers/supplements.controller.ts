/**
 * Supplements Controller（小程序端）
 * 按 DIY 制作单上的补剂清单报价
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SupplementOrderService } from '../../application/supplement-shop/supplement-order.service';
import { SupplementShopConfigService } from '../../application/supplement-shop/supplement-shop-config.service';
import { SupplementSchedulingService } from '../../application/supplement-shop/supplement-scheduling.service';
import { SupplementNotificationService } from '../../application/supplement-shop/supplement-notification.service';
import { SupplementQuoteRequestDto } from '../dto/supplement-shop.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('Supplements')
@Controller('api/v1/supplements')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SupplementsController {
  constructor(
    private readonly supplementOrderService: SupplementOrderService,
    private readonly supplementShopConfigService: SupplementShopConfigService,
    private readonly supplementSchedulingService: SupplementSchedulingService,
    private readonly supplementNotificationService: SupplementNotificationService,
  ) {}

  @Get('shop-status')
  @UseGuards(AuthGuard)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '补剂商城是否开放（供小程序决定是否展示入口）' })
  async shopStatus() {
    const config = await this.supplementShopConfigService.getConfig();
    return ApiResponseDto.success({ enabled: config.enabled });
  }

  @Get('packing-date')
  @UseGuards(AuthGuard)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '下单前预计分装/发货日（只读，不占产能）' })
  async packingDate() {
    return ApiResponseDto.success(
      await this.supplementSchedulingService.previewPackingDate(),
    );
  }

  @Get('subscribe-templates')
  @UseGuards(AuthGuard)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '补剂订阅消息模板 ID（供小程序 requestSubscribeMessage）' })
  async subscribeTemplates() {
    return ApiResponseDto.success(
      this.supplementNotificationService.getTemplateIds(),
    );
  }

  @Get('policy')
  @UseGuards(AuthGuard)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '补剂售后政策文案（后台可配）' })
  async policy() {
    const config = await this.supplementShopConfigService.getConfig();
    return ApiResponseDto.success({
      aftersalePolicy: config.aftersalePolicy,
      aftersaleWindowDays: config.aftersaleWindowDays,
    });
  }

  @Post('quote')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({
    summary: '按 DIY 制作单的补剂清单报价（价格由服务端现算）',
  })
  async quote(@Body() dto: SupplementQuoteRequestDto) {
    return ApiResponseDto.success(
      await this.supplementOrderService.quote({
        lines: dto.lines,
        portionMultiplier: dto.portionMultiplier,
        cycleDays: dto.cycleDays,
      }),
    );
  }
}

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
  ) {}

  @Get('shop-status')
  @UseGuards(AuthGuard)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '补剂商城是否开放（供小程序决定是否展示入口）' })
  async shopStatus() {
    const config = await this.supplementShopConfigService.getConfig();
    return ApiResponseDto.success({ enabled: config.enabled });
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

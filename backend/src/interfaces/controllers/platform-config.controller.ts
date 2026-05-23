import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';
import { PlatformConfigService } from '../../application/platform-config/platform-config.service';
import {
  UpdateCustomerServiceConfigDto,
  UpdatePaymentConfigDto,
} from '../dto/platform-config.dto';

@Controller('api/v1/admin/platform-config')
@UseGuards(AuthGuard, AdminGuard)
export class PlatformConfigController {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  @Get('payment')
  async getPaymentConfig() {
    const config = await this.platformConfigService.getPaymentConfig();
    return ApiResponseDto.success(config);
  }

  @Put('payment')
  async updatePaymentConfig(@Body() dto: UpdatePaymentConfigDto) {
    const config = await this.platformConfigService.updatePaymentConfig(dto);
    return ApiResponseDto.success(config);
  }

  @Get('customer-service')
  async getCustomerServiceConfig() {
    const config = await this.platformConfigService.getCustomerServiceConfig();
    return ApiResponseDto.success(config);
  }

  @Put('customer-service')
  async updateCustomerServiceConfig(
    @Body() dto: UpdateCustomerServiceConfigDto,
  ) {
    const config =
      await this.platformConfigService.updateCustomerServiceConfig(dto);
    return ApiResponseDto.success(config);
  }
}

@Controller('api/v1/platform-config')
export class PublicPlatformConfigController {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  @Get('customer-service')
  async getPublicCustomerServiceConfig() {
    const config = await this.platformConfigService.getCustomerServiceConfig();
    return ApiResponseDto.success({
      enabled: config.enabled,
      provider: config.provider,
      customerServiceUrl: config.customerServiceUrl,
      orderCardTitleTemplate: config.orderCardTitleTemplate,
      orderCardPathTemplate: config.orderCardPathTemplate,
      productCardTitleTemplate: config.productCardTitleTemplate,
      productCardPathTemplate: config.productCardPathTemplate,
      defaultCardTitleTemplate: config.defaultCardTitleTemplate,
      defaultCardPathTemplate: config.defaultCardPathTemplate,
      welcomeMessage: config.welcomeMessage,
      orderDetailDeliveryNote: config.orderDetailDeliveryNote,
      orderDetailAftersaleNote: config.orderDetailAftersaleNote,
      orderDetailMerchantNote: config.orderDetailMerchantNote,
      floatingButtonEnabled: config.floatingButtonEnabled,
      floatingButtonText: config.floatingButtonText,
      floatingButtonIconUrl: config.floatingButtonIconUrl,
      floatingButtonSize: config.floatingButtonSize,
      floatingButtonPosition: config.floatingButtonPosition,
      floatingButtonBottom: config.floatingButtonBottom,
      floatingButtonRight: config.floatingButtonRight,
      floatingButtonStyle: config.floatingButtonStyle,
    });
  }
}

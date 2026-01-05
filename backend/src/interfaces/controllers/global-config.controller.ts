/**
 * Global Config Controller
 * Admin-only endpoint for managing global configuration
 */

import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { GlobalConfigService } from '../../application/config/global-config.service';
import { UpdateGlobalConfigDto } from '../dto/global-config.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ApiResponseDto } from '../dto/common/response.dto';

@Controller('api/v1/admin/global-config')
@UseGuards(AuthGuard)
export class GlobalConfigController {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  /**
   * Get current global configuration
   * GET /api/v1/admin/global-config
   */
  @Get()
  async getConfig() {
    const config = await this.globalConfigService.getGlobalConfig();
    return ApiResponseDto.success({
      id: 'singleton',
      ...config,
    });
  }

  /**
   * Update global configuration
   * PUT /api/v1/admin/global-config
   */
  @Put()
  async updateConfig(@Body() dto: UpdateGlobalConfigDto) {
    const updated = await this.globalConfigService.updateGlobalConfig(dto);
    return ApiResponseDto.success({
      id: 'singleton',
      ...updated,
    });
  }
}

/**
 * Public Global Config Controller
 * Public endpoint for fetching global configuration (no auth required)
 */
@Controller('api/v1/global-config')
export class PublicGlobalConfigController {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  /**
   * Get public global configuration
   * GET /api/v1/global-config
   */
  @Get()
  async getPublicConfig() {
    const config = await this.globalConfigService.getGlobalConfig();
    return ApiResponseDto.success({
      id: 'singleton',
      ...config,
    });
  }
}

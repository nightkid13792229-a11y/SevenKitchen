/**
 * Global Config Controller
 * Admin-only endpoint for managing global configuration
 */

import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { GlobalConfigService } from '../../application/config/global-config.service';
import { UpdateGlobalConfigDto } from '../dto/global-config.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';

/**
 * ⚠️ 2026-10-16（B4）加了 `StaffGuard`。
 *
 * 原来只有 `AuthGuard`：**任何登录用户**（包括普通顾客的微信 token）都能改这张
 * 全局配置表 —— 定价、毛利、疫苗板块开关全在里面 ✗。
 * 而这个类的注释一直写着 "Admin-only" ✓ —— 这次只是让代码与它自己的说明一致。
 *
 * 谁能进：STAFF 与 ADMIN。admin-web 的登录口就是 `/auth/admin-login`，
 * 它只认 STAFF / ADMIN 两种角色（见 auth.controller.ts）——
 * 所以后台「全局配置」页一个字都不用改，照常能存 ✓。
 *
 * 为什么必须在 B4 一起做：疫苗开关是"出事一分钟关掉"用的手段，
 * 如果连普通顾客都能把它（以及定价）改掉，这个开关本身就是个更大的风险 ✗
 */
@Controller('api/v1/admin/global-config')
@UseGuards(AuthGuard, StaffGuard)
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

/**
 * Global Config Controller
 * Admin-only endpoint for managing global configuration
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { GlobalConfigService } from '../../application/config/global-config.service';
import { UpdateGlobalConfigDto } from '../dto/global-config.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';
import { PrismaShippingTemplateRepository } from '../../infrastructure/repositories/prisma-shipping-template.repository';

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
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly shippingTemplateRepository: PrismaShippingTemplateRepository,
  ) {}

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
    await this.assertDefaultShippingTemplateUsable(dto.defaultShippingTemplateId);

    const updated = await this.globalConfigService.updateGlobalConfig(dto);
    return ApiResponseDto.success({
      id: 'singleton',
      ...updated,
    });
  }

  /**
   * 保存「默认运费模板」前必须能真的用。
   *
   * 2026-11-07 起算价只认这一个设置：存进去一个不存在 / 已停用的 id，
   * 下单预览会直接报错、顾客结不了账。把错误挡在保存这一刻，比等顾客发现便宜。
   */
  private async assertDefaultShippingTemplateUsable(
    templateId?: string | null,
  ): Promise<void> {
    if (!templateId) {
      return; // 清空默认模板允许保存；算价会退回唯一生效模板
    }

    const template =
      await this.shippingTemplateRepository.findById(templateId);
    if (!template) {
      throw new BadRequestException('默认运费模板不存在，请重新选择');
    }
    if (!template.isActive) {
      throw new BadRequestException(
        '默认运费模板已停用，请先激活它或换一张生效的模板',
      );
    }
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

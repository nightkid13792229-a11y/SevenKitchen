import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PlatformOptionsService } from '../../application/platform-options/platform-options.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import type { OptionSeedItem } from '../../application/platform-options/option-sets.registry';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
/**
 * ⚠️ 项目里有**两个** `AdminGuard`：
 *   · `interfaces/guards/role.guard.ts` —— 主流，30 个文件在用（本处采用）
 *   · `interfaces/controllers/auth/admin.guard.ts` —— 遗留副本，3 个文件在用
 * 两者实现等价。新代码统一走主流那个；遗留副本的合并另行排期
 * （属于本次重构范围之外，见需求文档 12.4「全站枚举一次性重构」同类的克制原则）。
 */
import { AdminGuard, StaffGuard } from '../guards/role.guard';

/**
 * 平台选项字典 · 后台维护接口（2026-10-16，食谱定制重构 批次 1.3）
 *
 * 权限口径沿用定制板块的既有约定（2026-10-04 老板拍板）：
 *   · **查看**：客服/员工都能看（`StaffGuard`）—— 他们每天要用这些中文；
 *   · **修改**：仅管理员（`AdminGuard`）—— 改一个标签会影响三个端的显示，
 *     还会影响历史订单的呈现，不能随手改。
 *
 * 两类选项集的差别（服务层强制，不靠前端自觉）：
 *   · `ENUM` 类：只能改标签/说明/色调/排序/启用，**不能增删**
 *     （代码里有 if-else 依赖这些值，比如「已付款才能取消」）；
 *   · `DATA` 类：可自由增删改。
 */
@ApiTags('Admin Platform Options')
@ApiSecurity('X-Customer-Id')
@Controller('api/v1/admin/options')
@UseGuards(AuthGuard, StaffGuard)
export class AdminPlatformOptionsController {
  constructor(private readonly platformOptions: PlatformOptionsService) {}

  @Get(':setCode')
  @ApiOperation({ summary: 'List one option set for maintenance (incl. disabled)' })
  async listSet(@Param('setCode') setCode: string) {
    const result = await this.platformOptions.listSetForAdmin(setCode);
    return ApiResponseDto.success({
      code: result.set.code,
      name: result.set.name,
      description: result.set.description ?? null,
      /** 前端据此决定"能不能增删"的按钮是否显示 —— 但仍然以后端校验为准 */
      sourceType: result.set.sourceType,
      items: result.items,
    });
  }

  @Put(':setCode/items/:code')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update an option item display metadata' })
  async updateItem(
    @Param('setCode') setCode: string,
    @Param('code') code: string,
    @Body()
    body: {
      label?: string;
      description?: string | null;
      tone?: string | null;
      icon?: string | null;
      sortOrder?: number;
      enabled?: boolean;
    },
    @CurrentUser() _user: RequestUser,
  ) {
    await this.platformOptions.updateItem(setCode, code, body);
    return ApiResponseDto.success({ updated: true });
  }

  @Post(':setCode/items')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create an option item (DATA sets only)' })
  async createItem(
    @Param('setCode') setCode: string,
    @Body() body: OptionSeedItem,
    @CurrentUser() _user: RequestUser,
  ) {
    await this.platformOptions.createItem(setCode, body);
    return ApiResponseDto.success({ created: true });
  }

  @Delete(':setCode/items/:code')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Delete an option item (DATA sets only). Prefer disabling — historical rows may reference the code.',
  })
  async deleteItem(
    @Param('setCode') setCode: string,
    @Param('code') code: string,
    @CurrentUser() _user: RequestUser,
  ) {
    await this.platformOptions.deleteItem(setCode, code);
    return ApiResponseDto.success({ deleted: true });
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformOptionsService } from '../../application/platform-options/platform-options.service';
import { ApiResponseDto } from '../dto/common/response.dto';

/**
 * 平台选项字典 · 顾客端只读接口（2026-10-16，食谱定制重构 批次 1.3）
 *
 * ## 为什么要有这个接口
 *
 * 「同一个状态码的中文在三个端各写一份」是这次重构要根治的病：
 * 小程序 5 处、后台 1 处、成品订单线还有一份，加一个枚举要改六处。
 * 2026-10-04 加「已取消」时漏了两处半，顾客看到的是英文 `CANCELLED`。
 *
 * 有了它，前端不再写映射表 —— **码从后端来，中文也从后端来**。
 * 这就是老板要的「前端只负责渲染」在"文案"这一层的落地。
 *
 * ## 为什么不需要登录
 *
 * 字典里没有敏感信息（就是中文标签与排序），而小程序在登录前
 * 也可能需要展示（例如首页的定制入口卡要显示价格与状态）。
 * 与 `PublicCustomRecipeConfigController` 同一口径。
 *
 * ## 用法
 *
 *   GET /api/v1/options                       → 全部选项集
 *   GET /api/v1/options?sets=custom_recipe_status,meal_count  → 指定几个
 */
@ApiTags('Platform Options')
@Controller('api/v1')
export class PlatformOptionsController {
  constructor(private readonly platformOptions: PlatformOptionsService) {}

  @Get('options')
  @ApiOperation({
    summary: 'Get option dictionaries (labels, tones, order) by set code',
  })
  @ApiQuery({
    name: 'sets',
    required: false,
    description: '逗号分隔的选项集码；省略则返回全部',
  })
  @ApiResponse({ status: 200, description: 'Option sets retrieved' })
  async listOptions(@Query('sets') sets?: string) {
    const codes = sets
      ? sets
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean)
      : undefined;

    const result = await this.platformOptions.listSets(codes);

    return ApiResponseDto.success({ sets: result });
  }
}

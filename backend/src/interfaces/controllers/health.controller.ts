/**
 * Health Check Controller
 *
 * 这里只有两样东西：存活探针 + **疫苗板块的公开开关**（2026-10-16 B4）。
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GlobalConfigService } from '../../application/config/global-config.service';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('Health')
@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00Z' },
      },
    },
  })
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 疫苗板块能不能出现（2026-10-16 上线前风险控制 B4）。
   *
   * `GET /api/v1/health/vaccine-feature` → `{ code: 0, data: { enabled, notice } }`
   *
   * ── 为什么是公开的（没有 AuthGuard）────────────────────────────────────
   * 小程序**启动时**就要问这一句：还没登录、或者登录态过期降级了，也得能问。
   * 它不读任何用户数据、不认任何入参，只回答"这个功能现在开着吗"——
   * 关掉一个功能这件事本身不是秘密（板块都会消失，瞒不住）。
   *
   * ── 为什么不是"可被滥用的入口"────────────────────────────────────────
   *   · 只有 `@Get`：**改不了任何东西**（`@Put` 在
   *     `/api/v1/admin/global-config`，走登录鉴权 ✓）；
   *   · 不吃任何查询参数 / 请求体（没有任何能"注入"的面）；
   *   · 只回两个字段：开关 + 一句给顾客看的话，不泄露配置表的其它内容
   *     （定价、毛利这些都在同一个单例里，绝不能从这个口漏出去 ✗）。
   *
   * ── 拉不到时怎么办 ───────────────────────────────────────────────────
   * 后端不吞异常：库里读不到就让它 5xx，小程序**按"关"处理**
   * （宁可少一个功能，也不要给错建议 —— 见 miniapp/src/utils/vaccine-feature.ts）。
   * 所以这个接口"挂掉"的最坏结果是疫苗书签不出现，不会给错接种建议 ✓。
   */
  @Get('vaccine-feature')
  @ApiOperation({ summary: '疫苗板块开关（公开只读）' })
  @ApiResponse({
    status: 200,
    description: '开关状态',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        data: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', example: true },
            notice: { type: 'string', example: '' },
          },
        },
      },
    },
  })
  async getVaccineFeature() {
    const flag = await this.globalConfigService.getVaccineFeatureFlag();
    return ApiResponseDto.success({
      enabled: flag.enabled,
      notice: flag.notice,
    });
  }
}

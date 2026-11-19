import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FinanceSummaryService } from '../../application/finance/finance-summary.service';
import { AuthGuard } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { FinanceRangeQueryDto } from '../dto/finance/finance-range.query.dto';
import { AdminGuard } from '../guards/role.guard';

/**
 * 财务（重做版）接口。
 *
 * 与旧的 `AdminFinanceController` 共用 `api/v1/admin/finance` 前缀，
 * 但本控制器下的接口一律仅 ADMIN：
 * - `AuthGuard` 负责解析登录态、把 `request.user` 填上（项目里没有全局守卫，
 *   单独挂 `AdminGuard` 会永远 403）；
 * - `AdminGuard` 再按角色拦一次，`STAFF` 一律 403。
 */
@ApiTags('admin-finance-v2')
@Controller('api/v1/admin/finance')
@UseGuards(AuthGuard, AdminGuard)
export class AdminFinanceV2Controller {
  constructor(private readonly financeSummaryService: FinanceSummaryService) {}

  /**
   * 财务首页 / 月报汇总：收入、支出、结余、线下待确认收款数。
   *
   * `month` 优先（整月）；否则 `from`/`to`；都缺省 = 本月至今。
   */
  @Get('dashboard')
  @ApiOperation({ summary: '财务首页/月报汇总（仅 ADMIN）' })
  @ApiResponse({
    status: 200,
    description: '收入、支出、结余与线下待确认收款数',
  })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async getDashboard(@Query() query: FinanceRangeQueryDto) {
    return ApiResponseDto.success(
      await this.financeSummaryService.getSummary(query),
      'Finance dashboard retrieved successfully',
    );
  }
}

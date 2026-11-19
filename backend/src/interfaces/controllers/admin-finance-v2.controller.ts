import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FinanceEntriesService } from '../../application/finance/finance-entries.service';
import { FinanceManualEntryService } from '../../application/finance/finance-manual-entry.service';
import { FinanceSummaryService } from '../../application/finance/finance-summary.service';
import { AuthGuard } from '../auth';
import { UserId } from '../auth/user.decorator';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CreateManualEntryDto,
  UpdateManualEntryDto,
  VoidManualEntryDto,
} from '../dto/finance/create-manual-entry.dto';
import { FinanceEntriesQueryDto } from '../dto/finance/finance-entries.query.dto';
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
  constructor(
    private readonly financeSummaryService: FinanceSummaryService,
    private readonly financeEntriesService: FinanceEntriesService,
    private readonly financeManualEntryService: FinanceManualEntryService,
  ) {}

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

  /**
   * 收支明细：各来源合并后按时间倒序，内存分页。
   *
   * 金额带符号：退款行是负的收入，手续费冲回是负的支出。
   * 合并后超过 5000 条时截断，`truncated = true`。
   */
  @Get('entries')
  @ApiOperation({ summary: '收支明细（合并各来源 + 手工条目，仅 ADMIN）' })
  @ApiResponse({
    status: 200,
    description: '明细列表、总条数、页码与是否截断',
  })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async getEntries(@Query() query: FinanceEntriesQueryDto) {
    return ApiResponseDto.success(
      await this.financeEntriesService.list(query),
      'Finance entries retrieved successfully',
    );
  }

  /** 记一笔：手工登记系统抓不到的收入/支出（设备、税费、零星收入等） */
  @Post('manual-entries')
  @ApiOperation({ summary: '记一笔（手工收入/支出，仅 ADMIN）' })
  @ApiResponse({ status: 200, description: '新建成功，返回条目 id' })
  @ApiResponse({ status: 400, description: '金额/方向/类别/发生日不合法' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async createManualEntry(
    @UserId() userId: string,
    @Body() body: CreateManualEntryDto,
  ): Promise<ApiResponseDto<{ id: string }>> {
    return ApiResponseDto.success(
      await this.financeManualEntryService.create(userId, body),
      'Manual entry created successfully',
    );
  }

  /** 改一笔：已作废的条目不允许修改 */
  @Patch('manual-entries/:id')
  @ApiOperation({ summary: '修改手工条目（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '手工条目ID' })
  @ApiResponse({ status: 200, description: '修改成功，返回条目 id' })
  @ApiResponse({ status: 400, description: '入参不合法或条目已作废' })
  @ApiResponse({ status: 404, description: '手工条目不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async updateManualEntry(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: UpdateManualEntryDto,
  ): Promise<ApiResponseDto<{ id: string }>> {
    return ApiResponseDto.success(
      await this.financeManualEntryService.update(userId, id, body),
      'Manual entry updated successfully',
    );
  }

  /** 作废：保留记录并标灰，不物理删除 */
  @Post('manual-entries/:id/void')
  @ApiOperation({ summary: '作废手工条目（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '手工条目ID' })
  @ApiResponse({ status: 200, description: '作废成功，返回条目 id' })
  @ApiResponse({ status: 404, description: '手工条目不存在或已作废' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async voidManualEntry(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: VoidManualEntryDto,
  ): Promise<ApiResponseDto<{ id: string }>> {
    return ApiResponseDto.success(
      await this.financeManualEntryService.void(userId, id, body.reason),
      'Manual entry voided successfully',
    );
  }
}

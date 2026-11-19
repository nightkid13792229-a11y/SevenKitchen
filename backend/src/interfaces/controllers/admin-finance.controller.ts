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
import { ExpenseBillService } from '../../application/finance/expense-bill.service';
import { FinanceCategoryService } from '../../application/finance/finance-category.service';
import { ExpenseTemplateService } from '../../application/finance/expense-template.service';
import { FinanceEntriesService } from '../../application/finance/finance-entries.service';
import { FinanceManualEntryService } from '../../application/finance/finance-manual-entry.service';
import { FinanceSummaryService } from '../../application/finance/finance-summary.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import { AuthGuard } from '../auth';
import { UserId } from '../auth/user.decorator';
import { ApiResponseDto } from '../dto/common/response.dto';
import { CreateExpenseTemplateDto } from '../dto/finance/create-expense-template.dto';
import {
  CreateManualEntryDto,
  UpdateManualEntryDto,
  VoidManualEntryDto,
} from '../dto/finance/create-manual-entry.dto';
import { FinanceEntriesQueryDto } from '../dto/finance/finance-entries.query.dto';
import { FinanceRangeQueryDto } from '../dto/finance/finance-range.query.dto';
import { GenerateBillsDto } from '../dto/finance/generate-bills.dto';
import { PayExpenseBillDto } from '../dto/finance/pay-expense-bill.dto';
import {
  CreateFinanceCategoryDto,
  MergeFinanceCategoryDto,
  RenameFinanceCategoryDto,
} from '../dto/finance/finance-category.dto';
import { AdminGuard } from '../guards/role.guard';

/**
 * 后台财务接口（仅 ADMIN）。
 *
 * - `AuthGuard` 负责解析登录态、把 `request.user` 填上（项目里没有全局守卫，
 *   单独挂 `AdminGuard` 会永远 403）；
 * - `AdminGuard` 再按角色拦一次，`STAFF` 一律 403。
 */
@ApiTags('admin-finance')
@Controller('api/v1/admin/finance')
@UseGuards(AuthGuard, AdminGuard)
export class AdminFinanceController {
  constructor(
    private readonly financeSummaryService: FinanceSummaryService,
    private readonly financeEntriesService: FinanceEntriesService,
    private readonly financeManualEntryService: FinanceManualEntryService,
    private readonly expenseTemplateService: ExpenseTemplateService,
    private readonly expenseBillService: ExpenseBillService,
    private readonly financeCategoryService: FinanceCategoryService,
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

  // ---------------------------------------------------------------------------
  // 支出类别字典（设计文档 §2）
  // ---------------------------------------------------------------------------

  /** 类别列表：默认只给启用类别；管理页传 includeInactive=true 看全部 */
  @Get('categories')
  @ApiOperation({ summary: '支出类别列表（含引用数，仅 ADMIN）' })
  @ApiResponse({
    status: 200,
    description:
        '类别列表（id / name / isSystem / isActive / usageCount / selectable；「其它」selectable=false）',
  })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async listCategories(@Query('includeInactive') includeInactive?: string) {
    const include = includeInactive === 'true' || includeInactive === '1';
    return ApiResponseDto.success(
      await this.financeCategoryService.list(include),
      'Finance categories retrieved successfully',
    );
  }

  /** 新建类别（输入即建）：同名（忽略大小写与首尾空格）拒绝 400 */
  @Post('categories')
  @ApiOperation({ summary: '新建支出类别（仅 ADMIN）' })
  @ApiResponse({ status: 200, description: '新建成功，返回类别 id 与名称' })
  @ApiResponse({ status: 400, description: '名称为空、超长或重名' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async createCategory(
    @UserId() userId: string,
    @Body() body: CreateFinanceCategoryDto,
  ): Promise<ApiResponseDto<{ id: string; name: string }>> {
    return ApiResponseDto.success(
      await this.financeCategoryService.create(userId, body.name),
      'Finance category created successfully',
    );
  }

  /** 改名：系统类别也允许；历史记录按 categoryId 自动显示新名字 */
  @Patch('categories/:id')
  @ApiOperation({ summary: '类别改名（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '类别ID' })
  @ApiResponse({ status: 200, description: '改名成功' })
  @ApiResponse({ status: 400, description: '名称为空、超长或重名' })
  @ApiResponse({ status: 404, description: '类别不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async renameCategory(
    @Param('id') id: string,
    @Body() body: RenameFinanceCategoryDto,
  ): Promise<ApiResponseDto<{ id: string; name: string }>> {
    return ApiResponseDto.success(
      await this.financeCategoryService.rename(id, body.name),
      'Finance category renamed successfully',
    );
  }

  /** 合并：历史账单/模板/手工条目一起搬到目标类别，返回搬移条数 */
  @Post('categories/:id/merge')
  @ApiOperation({ summary: '合并支出类别（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '被合并的源类别ID' })
  @ApiResponse({ status: 200, description: '合并成功，返回搬移条数' })
  @ApiResponse({
    status: 400,
    description: '目标与源相同或未指定；系统类别不能合并',
  })
  @ApiResponse({ status: 404, description: '源类别或目标类别不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async mergeCategory(
    @Param('id') id: string,
    @Body() body: MergeFinanceCategoryDto,
  ): Promise<
    ApiResponseDto<{ sourceId: string; targetId: string; moved: number }>
  > {
    return ApiResponseDto.success(
      await this.financeCategoryService.merge(id, body.targetId),
      'Finance category merged successfully',
    );
  }

  /** 停用（删除 = 停用）：系统类别禁止；已停用的幂等返回 */
  @Post('categories/:id/deactivate')
  @ApiOperation({ summary: '停用支出类别（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '类别ID' })
  @ApiResponse({ status: 200, description: '停用成功' })
  @ApiResponse({ status: 400, description: '系统类别不能停用' })
  @ApiResponse({ status: 404, description: '类别不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async deactivateCategory(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<{ id: string; isActive: false }>> {
    return ApiResponseDto.success(
      await this.financeCategoryService.deactivate(id),
      'Finance category deactivated successfully',
    );
  }

  // ---------------------------------------------------------------------------
  // 固定费用（设计文档 §5.4 / §6.4）
  // ---------------------------------------------------------------------------

  /** 固定费用模板列表；停用的也返回，页面才能展示「启用状态」 */
  @Get('templates')
  @ApiOperation({ summary: '固定费用模板列表（仅 ADMIN）' })
  @ApiResponse({ status: 200, description: '模板列表（含停用）' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async listTemplates() {
    return ApiResponseDto.success(
      await this.expenseTemplateService.listTemplates({
        includeInactive: true,
      }),
      'Expense templates retrieved successfully',
    );
  }

  /** 新建固定费用模板（支持月付/季付/年付、付款方、服务期月数） */
  @Post('templates')
  @ApiOperation({ summary: '新建固定费用模板（仅 ADMIN）' })
  @ApiResponse({ status: 200, description: '新建成功' })
  @ApiResponse({ status: 400, description: '周期/金额/服务期等入参不合法' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async createTemplate(
    @UserId() userId: string,
    @Body() body: CreateExpenseTemplateDto,
  ) {
    return ApiResponseDto.success(
      await this.expenseTemplateService.create(userId, body),
      'Expense template created successfully',
    );
  }

  /** 编辑模板：只影响以后生成的账单，不改历史账单 */
  @Patch('templates/:id')
  @ApiOperation({ summary: '编辑固定费用模板（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '模板ID' })
  @ApiResponse({ status: 200, description: '修改成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async updateTemplate(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: Partial<CreateExpenseTemplateDto>,
  ): Promise<ApiResponseDto<{ id: string }>> {
    return ApiResponseDto.success(
      await this.expenseTemplateService.update(userId, id, body),
      'Expense template updated successfully',
    );
  }

  /** 停用模板：只影响以后，不改历史账单 */
  @Post('templates/:id/deactivate')
  @ApiOperation({ summary: '停用固定费用模板（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '模板ID' })
  @ApiResponse({ status: 200, description: '停用成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async deactivateTemplate(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<ApiResponseDto<{ id: string }>> {
    return ApiResponseDto.success(
      await this.expenseTemplateService.deactivate(userId, id),
      'Expense template deactivated successfully',
    );
  }

  /** 启用模板：停用后恢复，只影响以后，不补生成历史账单 */
  @Post('templates/:id/activate')
  @ApiOperation({ summary: '启用固定费用模板（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '模板ID' })
  @ApiResponse({ status: 200, description: '启用成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async activateTemplate(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<ApiResponseDto<{ id: string }>> {
    return ApiResponseDto.success(
      await this.expenseTemplateService.activate(userId, id),
      'Expense template activated successfully',
    );
  }

  /** 某月应计固定费用账单（含已付/待付状态与付款方） */
  @Get('bills')
  @ApiOperation({ summary: '某月应计固定费用账单（仅 ADMIN）' })
  @ApiResponse({ status: 200, description: '该月账单列表' })
  @ApiResponse({ status: 400, description: '月份格式不合法' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async listBills(@Query('month') month?: string) {
    const target =
      month || TimezoneUtil.shanghaiDateKey(new Date()).slice(0, 7);
    return ApiResponseDto.success(
      await this.expenseBillService.listForMonth(target),
      'Expense bills retrieved successfully',
    );
  }

  /** 补生成指定月份（缺省本月）的固定费用账单；幂等，重复调用不重复生成 */
  @Post('bills/generate')
  @ApiOperation({ summary: '补生成固定费用账单（仅 ADMIN）' })
  @ApiResponse({
    status: 200,
    description: '本次新建的账单数与当月到期模板数（dueCount）',
  })
  @ApiResponse({ status: 400, description: '月份格式不合法' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async generateBills(
    @UserId() userId: string,
    @Body() body: GenerateBillsDto,
  ): Promise<ApiResponseDto<{ created: number; dueCount: number }>> {
    const target =
      body?.month || TimezoneUtil.shanghaiDateKey(new Date()).slice(0, 7);
    return ApiResponseDto.success(
      await this.expenseTemplateService.generateForMonth(target, userId),
      'Expense bills generated successfully',
    );
  }

  /** 标记已付（可改实付金额、可部分付） */
  @Post('bills/:id/pay')
  @ApiOperation({ summary: '标记固定费用账单已付（仅 ADMIN）' })
  @ApiParam({ name: 'id', description: '账单ID' })
  @ApiResponse({ status: 200, description: '付款记录已写入，返回账单最新状态' })
  @ApiResponse({ status: 400, description: '账单已取消或入参不合法' })
  @ApiResponse({ status: 404, description: '账单不存在' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  async payBill(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: PayExpenseBillDto,
  ) {
    return ApiResponseDto.success(
      await this.expenseBillService.pay(userId, id, body),
      'Expense bill payment recorded successfully',
    );
  }
}

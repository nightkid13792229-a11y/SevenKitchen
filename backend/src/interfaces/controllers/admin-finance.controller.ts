import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExpenseBillService } from '../../application/finance/expense-bill.service';
import { ExpenseTemplateService } from '../../application/finance/expense-template.service';
import { FinanceAlertService } from '../../application/finance/finance-alert.service';
import { FinanceReportService } from '../../application/finance/finance-report.service';
import { AuthGuard } from '../auth';
import { UserId } from '../auth/user.decorator';
import { ApiResponseDto } from '../dto/common/response.dto';
import { CreateExpenseBillDto } from '../dto/finance/create-expense-bill.dto';
import { CreateExpenseTemplateDto } from '../dto/finance/create-expense-template.dto';
import { FinanceRangeDto } from '../dto/finance/finance-range.dto';
import { RecordExpensePaymentDto } from '../dto/finance/record-expense-payment.dto';

@ApiTags('admin-finance')
@Controller('api/v1/admin/finance')
@UseGuards(AuthGuard)
export class AdminFinanceController {
  constructor(
    private readonly expenseBillService: ExpenseBillService,
    private readonly expenseTemplateService: ExpenseTemplateService,
    private readonly financeReportService: FinanceReportService,
    private readonly financeAlertService: FinanceAlertService,
  ) {}

  @Get('templates')
  async listTemplates() {
    return ApiResponseDto.success(
      await this.expenseTemplateService.listTemplates(),
      'Expense templates retrieved successfully',
    );
  }

  @Post('templates')
  async createTemplate(
    @Body() dto: CreateExpenseTemplateDto,
    @UserId() userId: string,
  ) {
    return ApiResponseDto.success(
      await this.expenseTemplateService.createTemplate(userId, dto),
      'Expense template created successfully',
    );
  }

  @Get('overview')
  async getOverview(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeReportService.getOverview(query),
      'Finance overview retrieved successfully',
    );
  }

  @Get('expense-bills')
  async listExpenseBills(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.expenseBillService.listBills(query),
      'Expense bills retrieved successfully',
    );
  }

  @Post('expense-bills')
  async createExpenseBill(
    @Body() dto: CreateExpenseBillDto,
    @UserId() userId: string,
  ) {
    return ApiResponseDto.success(
      await this.expenseBillService.createBill(userId, dto),
      'Expense bill created successfully',
    );
  }

  @Post('expense-bills/:id/payments')
  async recordExpensePayment(
    @Param('id') id: string,
    @Body() dto: RecordExpensePaymentDto,
    @UserId() userId: string,
  ) {
    return ApiResponseDto.success(
      await this.expenseBillService.recordPayment(id, userId, dto),
      'Expense payment recorded successfully',
    );
  }

  @Get('expense-analysis')
  async getExpenseAnalysis(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeReportService.getExpenseAnalysis(query),
      'Expense analysis retrieved successfully',
    );
  }

  @Get('contribution-analysis')
  async getContributionAnalysis(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeReportService.getContributionAnalysis(
        query,
        query.groupBy ?? 'RECIPE',
      ),
      'Contribution analysis retrieved successfully',
    );
  }

  @Get('alerts')
  async getAlerts(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeAlertService.getAlerts(query),
      'Finance alerts retrieved successfully',
    );
  }
}

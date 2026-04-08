import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpenseTemplateService } from '../finance/expense-template.service';

@Injectable()
export class FinanceSchedulerService {
  private readonly logger = new Logger(FinanceSchedulerService.name);

  constructor(
    private readonly expenseTemplateService: ExpenseTemplateService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateRecurringExpenseBills() {
    const created = await this.expenseTemplateService.generateDueBills(
      new Date(),
      'system',
    );
    this.logger.log(
      `[FinanceScheduler] generated ${created.length} recurring expense bill(s)`,
    );
  }
}

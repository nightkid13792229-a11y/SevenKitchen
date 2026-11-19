import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpenseTemplateService } from '../finance/expense-template.service';
import { TimezoneUtil } from '../../utils/timezone.util';

@Injectable()
export class FinanceSchedulerService {
  private readonly logger = new Logger(FinanceSchedulerService.name);

  constructor(
    private readonly expenseTemplateService: ExpenseTemplateService,
  ) {}

  /**
   * 每日 01:00 补生成当月固定费用账单。
   *
   * 生成按月份幂等（同模板同费属月只写一张），所以每天跑也只会写一次；
   * 月初就生成整月账单，符合「固定费用整月计入」的口径（设计文档 §4.7）。
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateRecurringExpenseBills() {
    const month = TimezoneUtil.shanghaiDateKey(new Date()).slice(0, 7);
    const { created } = await this.expenseTemplateService.generateForMonth(
      month,
      'system',
    );
    this.logger.log(
      `[FinanceScheduler] generated ${created} recurring expense bill(s) for ${month}`,
    );
  }
}

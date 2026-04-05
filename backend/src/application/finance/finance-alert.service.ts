import { Injectable } from '@nestjs/common';
import { FinanceRangeDto } from '../../interfaces/dto/finance/finance-range.dto';
import { FinanceReportService } from './finance-report.service';

@Injectable()
export class FinanceAlertService {
  constructor(
    private readonly financeReportService: FinanceReportService,
  ) {}

  private previousComparableRange(range: FinanceRangeDto): FinanceRangeDto {
    if (range.preset === 'THIS_WEEK') return { ...range, preset: 'TODAY' };
    if (range.preset === 'THIS_MONTH') return { ...range, preset: 'THIS_WEEK' };
    return range;
  }

  async getAlerts(range: FinanceRangeDto) {
    const overview = await this.financeReportService.getOverview(range);
    const current = await this.financeReportService.getExpenseAnalysis(range);
    const baseline = await this.financeReportService.getExpenseAnalysis(
      this.previousComparableRange(range),
    );

    const historicalAlerts = current.categories
      .filter((item) => {
        const previous = baseline.categories.find(
          (base) => base.category === item.category,
        );
        return previous && item.amount > previous.amount * 1.2;
      })
      .map((item) => ({
        type: 'EXPENSE_SURGE',
        category: item.category,
        message: `${item.label}较历史基线显著上涨`,
      }));

    const businessGoalAlerts = [];
    const logistics = current.categories.find(
      (item) => item.category === 'LOGISTICS_DELIVERY',
    );
    if (overview.operatingRevenue > 0 && logistics) {
      const logisticsRate = logistics.amount / overview.operatingRevenue;
      if (logisticsRate > 0.25) {
        businessGoalAlerts.push({
          type: 'BUSINESS_TARGET',
          category: 'LOGISTICS_DELIVERY',
          message: `物流配送费占收入比例为 ${(logisticsRate * 100).toFixed(1)}%，超过 25% 目标线`,
        });
      }
    }

    if (overview.operatingBalance < 0) {
      businessGoalAlerts.push({
        type: 'BUSINESS_TARGET',
        category: 'OPERATING_BALANCE',
        message: '当前周期真实经营结余为负，需要优先检查固定费用和物流支出',
      });
    }

    return [...historicalAlerts, ...businessGoalAlerts];
  }
}

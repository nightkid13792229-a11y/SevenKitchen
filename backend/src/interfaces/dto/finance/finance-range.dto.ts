export class FinanceRangeDto {
  preset: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' = 'TODAY';
  timezone?: string;
  groupBy?: 'ORDER' | 'RECIPE';
}

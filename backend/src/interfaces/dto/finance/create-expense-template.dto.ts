import type { FinanceExpenseCategory } from '../../../application/finance/finance-categories';

export class CreateExpenseTemplateDto {
  name!: string;
  titleTemplate!: string;
  category!: FinanceExpenseCategory;
  payeeName!: string;
  defaultAmount!: number;
  interval!: 'MONTHLY' | 'YEARLY';
  dayOfMonth!: number;
  monthOfYear?: number;
  servicePeriodMonths!: number;
  note?: string;
}

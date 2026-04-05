import type { FinanceExpenseCategory } from '../../../application/finance/finance-categories';

export class CreateExpenseBillDto {
  title!: string;
  category!: FinanceExpenseCategory;
  amount!: number;
  payeeName!: string;
  recognitionStart!: string;
  recognitionEnd!: string;
  dueAt!: string;
  templateId?: string;
  note?: string;
}

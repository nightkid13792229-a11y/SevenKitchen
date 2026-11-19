import type { FinanceExpenseCategory } from '../../../application/finance/finance-categories';

/** 固定费用模板（设计文档 §5.4） */
export class CreateExpenseTemplateDto {
  name!: string;
  titleTemplate!: string;
  category!: FinanceExpenseCategory;
  payeeName!: string;
  defaultAmount!: number;
  /** 每月 / 每季 / 每年 */
  interval!: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  /** 每月几号应付（1-31） */
  dayOfMonth?: number;
  /** 年付模板的月份（1-12），月付/季付忽略 */
  monthOfYear?: number;
  /** 服务期月数：默认 1；年付宽带填 12，支出按月分摊 */
  servicePeriodMonths?: number;
  /** 付款方：个人垫付 / 公司账户；默认 PERSONAL */
  payerType?: 'COMPANY' | 'PERSONAL';
  payerUserId?: string | null;
  note?: string | null;
}

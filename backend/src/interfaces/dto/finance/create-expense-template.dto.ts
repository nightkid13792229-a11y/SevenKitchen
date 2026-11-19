/**
 * 固定费用模板（设计文档 §5.4 / §1.2）。
 *
 * 类别走类别字典（`categoryId`，必填、必须是启用类别）；账户 `payerAccount`
 * 缺省 `PERSONAL_BANK`（房租/社保这类走卡），已生成的历史账单不受影响。
 */
export class CreateExpenseTemplateDto {
  name!: string;
  titleTemplate!: string;
  /** 支出类别 id（类别字典，必填） */
  categoryId!: string;
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
  /** 付款方：个人垫付 / 公司账户；默认 PERSONAL（旧字段，保留一版） */
  payerType?: 'COMPANY' | 'PERSONAL';
  payerUserId?: string | null;
  /** 默认出账账户：MERCHANT / PERSONAL_WECHAT / PERSONAL_ALIPAY / PERSONAL_BANK / CASH；缺省 PERSONAL_BANK */
  payerAccount?: string | null;
  note?: string | null;
}

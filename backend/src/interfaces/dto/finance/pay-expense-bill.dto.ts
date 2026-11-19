/** 固定费用账单「标记已付」（设计文档 §5.4） */
export class PayExpenseBillDto {
  /** 本次实付金额；缺省 = 账单金额 */
  paidAmount?: number;
  /** 付款日 YYYY-MM-DD；缺省 = 今天 */
  paidAt?: string;
  /** 付款方；缺省继承账单上的 payerType */
  payerType?: 'COMPANY' | 'PERSONAL';
}

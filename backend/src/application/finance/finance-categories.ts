export const FINANCE_EXPENSE_CATEGORY_LABELS = {
  RAW_MATERIAL: '原料采购',
  PACKAGING_SUPPLIES: '包材耗材',
  PAYROLL: '工资',
  RENT: '房租',
  UTILITIES: '水电燃气',
  NETWORK_COMMUNICATION: '宽带通信',
  TECHNICAL_SERVICES: '服务器/域名/证书/备案',
  LOGISTICS_DELIVERY: '物流配送费',
  ADMINISTRATIVE: '行政费用',
  AFTERSALE_LOSS: '售后退款/经营损失',
  OTHER: '其他杂项',
} as const;

export type FinanceExpenseCategory =
  keyof typeof FINANCE_EXPENSE_CATEGORY_LABELS;

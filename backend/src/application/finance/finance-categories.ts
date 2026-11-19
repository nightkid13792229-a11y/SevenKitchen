import type { FinanceExpenseCategory as PrismaFinanceExpenseCategory } from '@prisma/client';

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
  SUPPLEMENT: '补剂采购',
  TAX: '税费',
  SOCIAL_INSURANCE: '社保',
  EQUIPMENT: '设备工具',
  PAYMENT_FEE: '支付手续费',
} as const;

/**
 * 可写入数据库的支出分类。
 * 直接取 Prisma 生成的枚举：新加的 SUPPLEMENT / TAX / SOCIAL_INSURANCE /
 * EQUIPMENT / PAYMENT_FEE 在迁移补进 DB enum 并 `prisma generate` 后会自动并入，
 * 不用在这里手抄一份、也就不会出现「代码接受、数据库不认」的分类。
 */
export type FinanceExpenseCategory = PrismaFinanceExpenseCategory;

/**
 * 收入类别（不建 enum，用字符串常量，见设计文档 §6.2）。
 * 手工收入只允许 OTHER_INCOME，其余由系统按来源自动归类。
 */
export const FINANCE_INCOME_CATEGORY_LABELS = {
  ONLINE_ORDER: '线上订单',
  OFFLINE_ORDER: '线下订单',
  SUPPLEMENT: '补剂订单',
  CUSTOM_RECIPE: '定制食谱',
  REFUND: '退款',
  OTHER_INCOME: '其他收入',
} as const;

export type FinanceIncomeCategory =
  keyof typeof FINANCE_INCOME_CATEGORY_LABELS;

/** 线下收款方式：钱进个人账户，不产生支付手续费 */
export const OFFLINE_PAYMENT_METHODS = [
  'ADMIN',
  'OFFLINE_WECHAT',
  'OFFLINE_ALIPAY',
  'OTHER',
] as const;

/** 线上收款方式：钱进公司微信商户号，按费率计手续费 */
export const ONLINE_PAYMENT_METHODS = ['WECHAT_PAY', 'WECHAT'] as const;

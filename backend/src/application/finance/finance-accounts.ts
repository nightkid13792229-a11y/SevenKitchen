import { BadRequestException } from '@nestjs/common';

/**
 * 财务账户口径（2026-11-19 账户化改造，设计文档 §1）。
 *
 * 老板真正需要的是「这笔钱从哪个账户进出」，不是会计上的「公司/个人垫付」，
 * 所以本期固定五个账户、不做自建，也不再有 `payerType` 这层概念。
 *
 * - 线上订单收款不存字段，按 `FINANCE_INCOME_ACCOUNT` 推导；
 * - 手工记账、补货、固定费用模板/账单/付款各自存 `payerAccount`；
 * - 空值统一缺省 `PERSONAL_WECHAT`（固定费用模板缺省 `PERSONAL_BANK`，
 *   见 expense-template.service.ts；房租/社保这类走卡的由模板自己带）。
 */
export const FINANCE_ACCOUNTS = {
  MERCHANT: '微信商户号',
  PERSONAL_WECHAT: '我的微信',
  PERSONAL_ALIPAY: '我的支付宝',
  PERSONAL_BANK: '我的银行卡',
  CASH: '现金',
} as const;

export type FinanceAccount = keyof typeof FINANCE_ACCOUNTS;

/** 账户下拉的顺序 = 对象键顺序（商户号 → 微信 → 支付宝 → 银行卡 → 现金） */
export const FINANCE_ACCOUNT_CODES = Object.keys(
  FINANCE_ACCOUNTS,
) as FinanceAccount[];

/** 空值缺省账户：老板日常补货、零星支出都走「我的微信」 */
export const DEFAULT_FINANCE_ACCOUNT: FinanceAccount = 'PERSONAL_WECHAT';

/** 线上收入固定落微信商户号（不存字段，读时按这个推导） */
export const FINANCE_INCOME_ACCOUNT: FinanceAccount = 'MERCHANT';

/** 是否合法账户码；`null` / 空串 / 大小写不符都不算 */
export function isFinanceAccount(
  value: string | null | undefined,
): value is FinanceAccount {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(FINANCE_ACCOUNTS, value)
  );
}

/**
 * 把入参归一到账户码：
 * - 空值（`undefined` / `null` / 空串 / 纯空格）→ 默认账户；
 * - 合法账户去掉首尾空格后原样返回；
 * - 非法账户直接 400 —— **不能静默落成默认值**，否则页面传错字段会
 *   悄悄记成「我的微信」，对账时才发现账户全错。
 */
export function normalizeFinanceAccount(
  value: string | null | undefined,
): FinanceAccount {
  if (value === undefined || value === null) {
    return DEFAULT_FINANCE_ACCOUNT;
  }
  const code = String(value).trim();
  if (!code) return DEFAULT_FINANCE_ACCOUNT;
  if (!isFinanceAccount(code)) {
    throw new BadRequestException('账户不合法');
  }
  return code;
}

/**
 * 读库时的账户归一：未知/空值落回默认账户，**不抛错**。
 *
 * 写入口用 `normalizeFinanceAccount`（非法值 400）；读历史数据时数据库里可能
 * 还有迁移前留下的空值，报表不能因为一条老数据整页报错。
 */
export function resolveFinanceAccount(
  value: string | null | undefined,
  fallback: FinanceAccount = DEFAULT_FINANCE_ACCOUNT,
): FinanceAccount {
  const code = typeof value === 'string' ? value.trim() : '';
  return isFinanceAccount(code) ? code : fallback;
}

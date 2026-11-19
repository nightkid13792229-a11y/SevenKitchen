/**
 * 财务账户（2026-11-19 账户化改造，设计文档 §1）。
 *
 * 老板真正的口径是「这笔钱从哪个账户进出」，所以本期固定五个账户、
 * 不做自建，也没有「公司/个人垫付」这层概念。
 *
 * 这份常量必须与后端 `backend/src/application/finance/finance-accounts.ts`
 * 的 `FINANCE_ACCOUNTS` 一一对应（code 是写入后端的值，label 只给页面显示）。
 *
 * 「记住上次用的账户」放在这里，五处账户选择（记一笔、固定费用模板、
 * 标记已付、代客下单、订单退款）共用同一个 storage key，互相带值。
 */

/** 五个账户 code（顺序 = 页面 chips 顺序，与后端一致） */
export type FinanceAccountCode =
  | 'MERCHANT'
  | 'PERSONAL_WECHAT'
  | 'PERSONAL_ALIPAY'
  | 'PERSONAL_BANK'
  | 'CASH';

export type FinanceAccountOption = {
  code: FinanceAccountCode;
  label: string;
};

/** 与后端 FINANCE_ACCOUNTS 一致：微信商户号 → 我的微信 → 支付宝 → 银行卡 → 现金 */
export const FINANCE_ACCOUNTS: readonly FinanceAccountOption[] = [
  { code: 'MERCHANT', label: '微信商户号' },
  { code: 'PERSONAL_WECHAT', label: '我的微信' },
  { code: 'PERSONAL_ALIPAY', label: '我的支付宝' },
  { code: 'PERSONAL_BANK', label: '我的银行卡' },
  { code: 'CASH', label: '现金' },
];

/** 空值缺省：老板日常补货、零星支出都走「我的微信」（与后端一致） */
export const DEFAULT_FINANCE_ACCOUNT: FinanceAccountCode = 'PERSONAL_WECHAT';

/** 记住上次用的账户（五处共用） */
export const FINANCE_ACCOUNT_STORAGE_KEY = 'finance:lastAccount';

export function isFinanceAccountCode(
  value: unknown,
): value is FinanceAccountCode {
  return FINANCE_ACCOUNTS.some((option) => option.code === value);
}

/**
 * 账户 code → 显示名。
 *
 * 后端明细已经直接给 `payerAccountLabel`，这里的映射只用于
 * 模板/账单这类返回裸 code 的地方；未知 code 显示「未记录」，
 * 不把一串英文丢给老板看。
 */
export function financeAccountLabel(
  code: string | null | undefined,
): string {
  const matched = FINANCE_ACCOUNTS.find((option) => option.code === code);
  return matched?.label || '未记录';
}

type UniStorageLike = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => void;
};

/** 小程序里取 uni；跑单测（node 环境）时没有 uni，返回 null 由调用方兜底 */
function storage(): UniStorageLike | null {
  const candidate = (globalThis as { uni?: UniStorageLike }).uni;
  if (!candidate) return null;
  if (typeof candidate.getStorageSync !== 'function') return null;
  if (typeof candidate.setStorageSync !== 'function') return null;
  return candidate;
}

/**
 * 上次用的账户。
 *
 * 读不到 / 存的是脏值（旧版本、手改 storage）一律回落到 `fallback`，
 * 不抛错、也不阻断记账：账户选错可以事后在明细里看出来，
 * 但页面因为读 storage 崩掉就没法用了。
 *
 * `fallback` 默认「我的微信」；固定费用模板传 `PERSONAL_BANK`
 * （房租/社保这类走卡，设计文档 §1.2）。
 */
export function getLastAccount(
  fallback: FinanceAccountCode = DEFAULT_FINANCE_ACCOUNT,
): FinanceAccountCode {
  const store = storage();
  if (!store) return fallback;
  try {
    const saved = store.getStorageSync(FINANCE_ACCOUNT_STORAGE_KEY);
    return isFinanceAccountCode(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

/** 记住本次选的账户；存不下也不影响本次操作 */
export function setLastAccount(code: string): void {
  if (!isFinanceAccountCode(code)) return;
  const store = storage();
  if (!store) return;
  try {
    store.setStorageSync(FINANCE_ACCOUNT_STORAGE_KEY, code);
  } catch {
    // 存不下就按默认账户走，不阻断保存
  }
}

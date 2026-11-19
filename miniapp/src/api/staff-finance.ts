/**
 * 财务 API（员工端 · 仅 ADMIN）
 *
 * 后端接口：`GET /api/v1/admin/finance/dashboard`
 * 注意 `getBaseUrl()` 已经带 `/api/v1`，这里的 `url` 只写 `/admin/...`。
 *
 * 期间口径：
 * - `{ month: '2026-11' }` = 整个 11 月（月报）
 * - `{ from, to }` = 自定义区间（后端裁到起账日 2026-11-01）
 * - 不传 = 本月至今
 *
 * 金额一律是 `number`（元，两位小数），不是 Decimal 字符串。
 */

import { request } from '../utils/api';

/** 后端统一返回 { code, data, message }；财务页直接用 data。 */
async function requestData<T>(options: any): Promise<T> {
  const response = await request<T>(options);
  return response.data as T;
}

/** 支出分类（与 Prisma 的 FinanceExpenseCategory 对齐） */
export type FinanceExpenseCategory =
  | 'RAW_MATERIAL'
  | 'PACKAGING_SUPPLIES'
  | 'PAYROLL'
  | 'RENT'
  | 'UTILITIES'
  | 'NETWORK_COMMUNICATION'
  | 'TECHNICAL_SERVICES'
  | 'LOGISTICS_DELIVERY'
  | 'ADMINISTRATIVE'
  | 'AFTERSALE_LOSS'
  | 'OTHER'
  | 'SUPPLEMENT'
  | 'TAX'
  | 'SOCIAL_INSURANCE'
  | 'EQUIPMENT'
  | 'PAYMENT_FEE';

export interface FinanceDashboardQuery {
  /** `YYYY-MM`，整月；与 from/to 同时传时以后端约定为准（month 优先） */
  month?: string;
  /** `YYYY-MM-DD` */
  from?: string;
  /** `YYYY-MM-DD` */
  to?: string;
}

export interface FinanceDashboardRange {
  /** 上海时区 ISO 字符串，例如 2026-11-01T00:00:00.000+08:00 */
  from: string;
  to: string;
}

export interface FinanceIncomeSummary {
  orderOnline: number;
  orderOffline: number;
  supplement: number;
  customRecipe: number;
  /** 手工记的其他收入 */
  manualIncome: number;
  /** 收入合计（退款前） */
  grossTotal: number;
  /** 区间内成功退款的金额（正数，展示时要减） */
  refundTotal: number;
  /** 对应订单付款日早于起账日的历史退款 */
  historicalRefundTotal: number;
  /** 收入净额 = grossTotal − refundTotal */
  netTotal: number;
  /** 线上收款手续费 */
  fee: number;
}

export interface FinanceExpenseCategoryAmount {
  category: FinanceExpenseCategory;
  label: string;
  amount: number;
}

export interface FinanceExpenseSummary {
  total: number;
  byCategory: FinanceExpenseCategoryAmount[];
}

export interface FinanceDashboard {
  range: FinanceDashboardRange;
  income: FinanceIncomeSummary;
  expense: FinanceExpenseSummary;
  /** 结余 = 收入净额 − 支出合计 */
  balance: number;
  /** 线下收款方式但还没确认收款的订单数 */
  pendingOfflineConfirmCount: number;
}

export const staffFinanceApi = {
  /**
   * 财务首页 / 月报汇总。
   *
   * 页面自己会就地展示错误（骨架 / 错误态），所以这里不弹全局 toast。
   * 后续的明细、手工条目、固定费用接口在各自任务里往这个对象上加。
   */
  getDashboard(params: FinanceDashboardQuery = {}) {
    return requestData<FinanceDashboard>({
      url: '/admin/finance/dashboard',
      method: 'GET',
      data: params,
      quiet: true,
      suppressErrorToast: true,
    });
  },
};

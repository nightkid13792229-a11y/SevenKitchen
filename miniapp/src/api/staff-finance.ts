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

/**
 * 收入类别（与后端 `FINANCE_INCOME_CATEGORY_LABELS` 对齐）。
 * 手工只允许 `OTHER_INCOME`：线上/线下/补剂/定制食谱由系统自动记录，
 * 手工标上去会和订单、手续费口径对不上（设计文档 §6.2）。
 */
export type FinanceIncomeCategory =
  | 'ONLINE_ORDER'
  | 'OFFLINE_ORDER'
  | 'SUPPLEMENT'
  | 'CUSTOM_RECIPE'
  | 'REFUND'
  | 'OTHER_INCOME';

/**
 * 「记一笔」入参：字段名与后端 `CreateManualEntryDto` 一致。
 *
 * 金额只收正数（最多两位小数），方向由 `direction` 决定；
 * 支出填 `category`、收入填 `incomeCategory`，另一侧不传。
 */
export interface CreateManualEntryPayload {
  direction: FinanceEntryDirection;
  /** 元、正数、最多两位小数 */
  amount: number;
  /** 发生日 `YYYY-MM-DD`（上海日历日，最早 2026-11-01、最晚今天） */
  occurredAt: string;
  /** 支出必填（`FinanceExpenseCategory`） */
  category?: FinanceExpenseCategory;
  /** 收入必填；手工只允许 `OTHER_INCOME` */
  incomeCategory?: FinanceIncomeCategory;
  payerType?: FinanceEntryPayerType;
  /** 一句话说明（必填，最多 200 字） */
  title: string;
  /** 备注（选填，与说明合并后不单独传） */
  note?: string;
  /**
   * 凭证照片的 COS key 数组。
   * v1 不做拍照上传（spec §5.3：v1.1 再接），这里与后端 DTO 对齐先留着，
   * 以后接上传不用改提交类型；当前页面不传。
   */
  proofKeys?: string[];
}

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

/** 明细行的来源单据类型（与后端的 `FinanceEntry.sourceType` 对齐） */
export type FinanceEntrySourceType =
  | 'ORDER'
  | 'SUPPLEMENT_ORDER'
  | 'CUSTOM_RECIPE_ORDER'
  | 'ORDER_REFUND'
  | 'PURCHASE'
  | 'SHIPPING'
  | 'BILL'
  | 'FEE'
  | 'MANUAL';

export type FinanceEntryDirection = 'INCOME' | 'EXPENSE';
export type FinanceEntryPayerType = 'COMPANY' | 'PERSONAL';

/**
 * 明细行：金额**带符号**——收入为正；退款是负的收入；手续费冲回是负的支出。
 * UI 只按符号显示，不再自己判断正负。
 */
export interface FinanceEntry {
  id: string;
  /** 上海时区 ISO 字符串（带 +08:00） */
  occurredAt: string;
  direction: FinanceEntryDirection;
  category: string;
  label: string;
  amount: number;
  title: string;
  sourceType: FinanceEntrySourceType;
  sourceId: string;
  sourceNo?: string;
  payerType?: FinanceEntryPayerType;
  isRefund: boolean;
  isHistorical: boolean;
}

export interface FinanceEntriesQuery {
  /** `YYYY-MM`，整月 */
  month?: string;
  /** `YYYY-MM-DD` */
  from?: string;
  /** `YYYY-MM-DD` */
  to?: string;
  direction?: FinanceEntryDirection;
  /** 收入类别 / 支出分类的 code */
  category?: string;
  /** 按付款方筛选：`PERSONAL` 就是「我垫的」 */
  payerType?: FinanceEntryPayerType;
  page?: number;
  pageSize?: number;
}

export interface FinanceEntriesPage {
  items: FinanceEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** 合并后的行数超过后端上限，已截断（提示缩小日期范围） */
  truncated: boolean;
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

  /**
   * 收支明细：各来源合并后按时间倒序，后端分页（默认每页 50，上限 200）。
   *
   * 与首页一致，错误由页面自己展示（骨架 / 错误态 / 触底重试），不弹全局 toast。
   */
  listEntries(params: FinanceEntriesQuery = {}) {
    return requestData<FinanceEntriesPage>({
      url: '/admin/finance/entries',
      method: 'GET',
      data: params,
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /**
   * 记一笔：手工登记系统抓不到的支出/收入。
   *
   * `POST /api/v1/admin/finance/manual-entries`，成功返回新条目 id。
   * 错误不在这里弹 toast（`suppressErrorToast`）：记一笔页要把后端 message
   * 原样 toast 出来，不能吞掉，也不能弹两遍。
   */
  createManualEntry(payload: CreateManualEntryPayload) {
    return requestData<{ id: string }>({
      url: '/admin/finance/manual-entries',
      method: 'POST',
      data: payload,
      quiet: true,
      suppressErrorToast: true,
    });
  },
};

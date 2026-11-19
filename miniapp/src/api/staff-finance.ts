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
  | 'REIMBURSEMENT'
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

/**
 * 固定费用周期：每月 / 每季 / 每年（与后端 `ExpenseTemplateInterval` 对齐）。
 * 季付由后端固定在 1/4/7/10 月生成，页面上不需要再选月份。
 */
export type FinanceExpenseInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/** 固定费用付款方：PERSONAL = 我个人垫的；COMPANY = 公司账户 */
export type FinanceExpensePayerType = FinanceEntryPayerType;

/**
 * 固定费用模板（`GET /admin/finance/templates`，含已停用）。
 *
 * 后端直接返回 Prisma 记录：`defaultAmount` 是 Decimal，JSON 里会变成字符串，
 * 页面统一用 `Number(...)` 转，不要当成 number 直接相加。
 */
export interface FinanceExpenseTemplate {
  id: string;
  name: string;
  /** 账单标题模板，支持 {{year}} / {{month}} 占位 */
  titleTemplate: string;
  category: FinanceExpenseCategory;
  payeeName: string;
  /** 默认金额（元），Decimal 序列化后可能是字符串 */
  defaultAmount: number | string;
  interval: FinanceExpenseInterval;
  /** 每月几号应付（1-31），老数据可能为空 */
  dayOfMonth: number | null;
  /** 年付模板的月份（1-12），月付/季付为空 */
  monthOfYear: number | null;
  /** 服务期月数：年付宽带填 12，账单按月分摊 */
  servicePeriodMonths: number;
  payerType: FinanceExpensePayerType;
  payerUserId?: string | null;
  isActive: boolean;
  note?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 新建/编辑模板入参：字段名与后端 `CreateExpenseTemplateDto` 一致。
 *
 * 小程序表单只采集名称/类别/金额/周期/几号/服务期/付款方，
 * `titleTemplate` 与 `payeeName` 由页面补默认值（后端必填）。
 */
export interface CreateExpenseTemplatePayload {
  name: string;
  /** 账单标题模板 */
  titleTemplate: string;
  category: FinanceExpenseCategory;
  /** 收款方 */
  payeeName: string;
  /** 元，正数、最多两位小数 */
  defaultAmount: number;
  interval: FinanceExpenseInterval;
  /** 每月几号应付（1-31） */
  dayOfMonth: number;
  /** 年付必填（1-12）；月付/季付不传 */
  monthOfYear?: number;
  /** 服务期月数（1-120），默认 1 */
  servicePeriodMonths: number;
  payerType: FinanceExpensePayerType;
}

export type UpdateExpenseTemplatePayload =
  Partial<CreateExpenseTemplatePayload>;

/** 账单状态：后端列表已排除草稿/已取消，正常只会出现前三种 */
export type FinanceExpenseBillStatus =
  | 'PENDING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'DRAFT'
  | 'CANCELLED';

/** 账单上的一笔付款记录（标记已付时写入） */
export interface FinanceExpenseBillPayment {
  id: string;
  paidAmount: number | string;
  paidAt: string;
  payerType?: FinanceExpensePayerType;
}

/**
 * 固定费用账单（`GET /admin/finance/bills?month=YYYY-MM`）。
 *
 * `amount` 付满后会被后端改写成累计实付，所以「剩余应付」必须用
 * `amount − payments 合计` 现算，不能只看状态。
 */
export interface FinanceExpenseBill {
  id: string;
  billNumber: string;
  title: string;
  category: FinanceExpenseCategory;
  status: FinanceExpenseBillStatus;
  payeeName: string;
  /** 账单金额（元），Decimal 序列化后可能是字符串 */
  amount: number | string;
  recognitionStart: string;
  recognitionEnd: string;
  dueAt: string;
  note?: string | null;
  templateId?: string | null;
  payerType: FinanceExpensePayerType;
  payments: FinanceExpenseBillPayment[];
}

/**
 * 标记已付入参（与后端 `PayExpenseBillDto` 对齐）。
 *
 * `paidAmount` 缺省 = 剩余应付；`paidAt` 缺省 = 今天（上海日历日）；
 * `payerType` 缺省继承账单上的付款方。
 */
export interface PayExpenseBillPayload {
  paidAmount?: number;
  /** `YYYY-MM-DD` */
  paidAt?: string;
  payerType?: FinanceExpensePayerType;
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

  /** 固定费用模板列表：停用的也返回，页面要展示启用状态 */
  listTemplates() {
    return requestData<FinanceExpenseTemplate[]>({
      url: '/admin/finance/templates',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 新建固定费用模板；成功返回落库后的模板 */
  createTemplate(payload: CreateExpenseTemplatePayload) {
    return requestData<FinanceExpenseTemplate>({
      url: '/admin/finance/templates',
      method: 'POST',
      data: payload,
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 编辑模板：只影响以后生成的账单，不改历史账单 */
  updateTemplate(id: string, payload: UpdateExpenseTemplatePayload) {
    return requestData<{ id: string }>({
      url: `/admin/finance/templates/${id}`,
      method: 'PATCH',
      data: payload,
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 停用模板：只影响以后，不动已生成的历史账单 */
  deactivateTemplate(id: string) {
    return requestData<{ id: string }>({
      url: `/admin/finance/templates/${id}/deactivate`,
      method: 'POST',
      data: {},
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 某月应计固定费用账单；不传 month = 后端按本月处理 */
  listBills(month?: string) {
    return requestData<FinanceExpenseBill[]>({
      url: '/admin/finance/bills',
      method: 'GET',
      data: month ? { month } : {},
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 标记已付（可改实付金额、可部分付），返回账单最新状态 */
  payBill(id: string, payload: PayExpenseBillPayload) {
    return requestData<FinanceExpenseBill>({
      url: `/admin/finance/bills/${id}/pay`,
      method: 'POST',
      data: payload,
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /**
   * 补生成某月固定费用账单（幂等）；不传 month = 本月。
   *
   * `created` 是本次新建数，`dueCount` 是该月按周期应有的总数：
   * created=0 且 dueCount>0 = 都已生成；dueCount=0 = 本来就没有要生成的。
   */
  generateBills(month?: string) {
    return requestData<{ created: number; dueCount: number }>({
      url: '/admin/finance/bills/generate',
      method: 'POST',
      data: month ? { month } : {},
      quiet: true,
      suppressErrorToast: true,
    });
  },
};

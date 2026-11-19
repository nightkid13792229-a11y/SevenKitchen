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
import type { FinanceAccountCode } from '../utils/finance-account';

/** 后端统一返回 { code, data, message }；财务页直接用 data。 */
async function requestData<T>(options: any): Promise<T> {
  const response = await request<T>(options);
  return response.data as T;
}

/**
 * 支出类别字典（`GET /admin/finance/categories`）。
 *
 * 2026-11-19 起支出类别是**可编辑的字典**，不再用枚举写死：
 * 记账时输入即建，改名影响历史，删除 = 停用，系统类别不可停用。
 */
export interface FinanceCategoryOption {
  id: string;
  name: string;
  /** 系统类别（食材/补剂/包材/快递/支付手续费）：不能合并/停用，可以改名 */
  isSystem: boolean;
  /**
   * 能否出现在记账的候选里（后端 2026-11-20 新增）。
   * 「其它」这类只用于历史数据的类别给 `false`；缺省（老后端）一律视为可选。
   */
  selectable: boolean;
  isActive: boolean;
  /** 被账单 / 模板 / 手工条目引用的总条数（管理页展示用） */
  usageCount: number;
}

/**
 * 旧支出枚举（仅用于兼容历史数据的展示，新写入一律走 `categoryId`）。
 * 后端保留了旧枚举列一版，读老账单/老模板时才可能用到。
 */
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
 * 支出填 `categoryId`（类别字典里的启用类别），收入填 `incomeCategory`，
 * 另一侧不传。`payerAccount` 是「钱从哪个账户进出」，缺省「我的微信」。
 */
export interface CreateManualEntryPayload {
  direction: FinanceEntryDirection;
  /** 元、正数、最多两位小数 */
  amount: number;
  /** 发生日 `YYYY-MM-DD`（上海日历日，最早 2026-11-01、最晚今天） */
  occurredAt: string;
  /** 支出必填：类别字典里的启用类别 id */
  categoryId?: string;
  /** 收入必填；手工只允许 `OTHER_INCOME` */
  incomeCategory?: FinanceIncomeCategory;
  /** 出账/入账账户；缺省 `PERSONAL_WECHAT`（我的微信） */
  payerAccount?: FinanceAccountCode;
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

/**
 * 汇总里的一个支出类别（2026-11-19 改为类别字典口径）。
 *
 * `categoryId` 是字典 id（可用于再查类别），`label` 是类别当前名字
 * （改名后报表直接跟着变），金额单位元。
 */
export interface FinanceExpenseCategoryAmount {
  categoryId: string | null;
  label: string;
  amount: number;
}

export interface FinanceExpenseSummary {
  total: number;
  byCategory: FinanceExpenseCategoryAmount[];
  /**
   * 区间内已生成的固定费用合计（后端 2026-11-20 新增）。
   *
   * 首页直接读它，不再按类别名从 `byCategory` 里凑——
   * 老板把「房租」改名成「房租物业」也不会让这句提示失准。
   * 老后端没有这个字段时按 0 处理（只是提示不显示，金额口径不受影响）。
   */
  fixedCostTotal: number;
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

/**
 * 明细行：金额**带符号**——收入为正；退款是负的收入；手续费冲回是负的支出。
 * UI 只按符号显示，不再自己判断正负。
 *
 * 类别与账户都直接给**显示名**（`categoryLabel` / `payerAccountLabel`），
 * 小程序不再维护 code → 中文的映射：支出类别改名后历史一起变；
 * 收入类别是系统固定文案，没有字典 id（`categoryId = null`）。
 */
export interface FinanceEntry {
  id: string;
  /** 上海时区 ISO 字符串（带 +08:00） */
  occurredAt: string;
  direction: FinanceEntryDirection;
  /** 支出类别字典 id；收入类别没有字典 id（固定 null） */
  categoryId: string | null;
  /** 可直接展示的类别名 */
  categoryLabel: string;
  amount: number;
  title: string;
  sourceType: FinanceEntrySourceType;
  sourceId: string;
  sourceNo?: string;
  /** 收款/付款账户（五个账户 code） */
  payerAccount: FinanceAccountCode;
  /** 账户显示名，明细直接展示 */
  payerAccountLabel: string;
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
  /** 支出类别字典 id（收入类别没有字典 id，不会被这个条件命中） */
  category?: string;
  /** 按账户筛选（五个账户 code）；不传 = 全部账户 */
  account?: FinanceAccountCode;
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
  /** 支出类别字典 id（必填、必须是启用类别） */
  categoryId: string | null;
  /** 旧枚举列（历史数据兼容，新数据不看它） */
  category?: FinanceExpenseCategory | null;
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
  /** 默认出账账户；老数据可能为空（读时按「我的微信」兜底） */
  payerAccount?: FinanceAccountCode | null;
  isActive: boolean;
  note?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 新建/编辑模板入参：字段名与后端 `CreateExpenseTemplateDto` 一致。
 *
 * 小程序表单只采集名称/类别/金额/周期/几号/服务期/账户，
 * `titleTemplate` 与 `payeeName` 由页面补默认值（后端必填）。
 */
export interface CreateExpenseTemplatePayload {
  name: string;
  /** 账单标题模板 */
  titleTemplate: string;
  /** 支出类别字典 id */
  categoryId: string;
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
  /** 默认出账账户；缺省 PERSONAL_BANK（我的银行卡） */
  payerAccount?: FinanceAccountCode;
}

export type UpdateExpenseTemplatePayload = CreateExpenseTemplatePayload;

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
  /** 本次从哪个账户出 */
  payerAccount?: FinanceAccountCode | null;
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
  /** 支出类别字典 id（老账单可能为空，读时按旧枚举兜底） */
  categoryId: string | null;
  /** 旧枚举列（历史数据兼容） */
  category?: FinanceExpenseCategory | null;
  status: FinanceExpenseBillStatus;
  payeeName: string;
  /** 账单金额（元），Decimal 序列化后可能是字符串 */
  amount: number | string;
  recognitionStart: string;
  recognitionEnd: string;
  dueAt: string;
  note?: string | null;
  templateId?: string | null;
  /** 账单的出账账户（从模板带过来，付款时可改） */
  payerAccount?: FinanceAccountCode | null;
  payments: FinanceExpenseBillPayment[];
}

/**
 * 标记已付入参（与后端 `PayExpenseBillDto` 对齐）。
 *
 * `paidAmount` 缺省 = 剩余应付；`paidAt` 缺省 = 今天（上海日历日）；
 * `payerAccount` 缺省取账单上的账户（账单又从模板继承）。
 */
export interface PayExpenseBillPayload {
  paidAmount?: number;
  /** `YYYY-MM-DD` */
  paidAt?: string;
  /** 本次从哪个账户出 */
  payerAccount?: FinanceAccountCode;
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

  /** 启用模板：停用后恢复，只影响以后，不补生成历史账单 */
  activateTemplate(id: string) {
    return requestData<{ id: string }>({
      url: `/admin/finance/templates/${id}/activate`,
      method: 'POST',
      data: {},
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /**
   * 支出类别列表（默认只给启用类别；管理页传 true 才看到停用/已合并的）。
   *
   * 记账页 / 固定费用页的类别选择器用它做候选；管理页用它带出使用次数。
   */
  listCategories(includeInactive = false) {
    return requestData<FinanceCategoryOption[]>({
      url: '/admin/finance/categories',
      method: 'GET',
      data: includeInactive ? { includeInactive: 'true' } : {},
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 新建类别（输入即建）：同名（忽略大小写与首尾空格）后端 400 */
  createCategory(name: string) {
    return requestData<{ id: string; name: string }>({
      url: '/admin/finance/categories',
      method: 'POST',
      data: { name },
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 改名：系统类别也允许；历史记录按 categoryId 自动显示新名字 */
  renameCategory(id: string, name: string) {
    return requestData<{ id: string; name: string }>({
      url: `/admin/finance/categories/${id}`,
      method: 'PATCH',
      data: { name },
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 合并：历史账单/模板/手工条目一起搬到目标类别，源类别停用 */
  mergeCategory(id: string, targetId: string) {
    return requestData<{ sourceId: string; targetId: string; moved: number }>({
      url: `/admin/finance/categories/${id}/merge`,
      method: 'POST',
      data: { targetId },
      quiet: true,
      suppressErrorToast: true,
    });
  },

  /** 停用（删除 = 停用）：系统类别后端会拒绝 */
  deactivateCategory(id: string) {
    return requestData<{ id: string; isActive: false }>({
      url: `/admin/finance/categories/${id}/deactivate`,
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

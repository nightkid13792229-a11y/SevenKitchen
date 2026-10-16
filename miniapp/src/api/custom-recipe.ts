/**
 * 定制食谱 · API 层（2026-10-16，批次 2.8）
 *
 * ## 为什么要有这个文件
 *
 * 定制相关的请求此前**散在各个页面里**（`order-detail.vue`、`orders.vue`、
 * `success.vue` 各写各的 `request({ url: '/custom-recipe/...' })`）。
 * 三个后果：
 *   · 同一个接口的返回结构在三个页面各解析一遍，字段名改一处漏两处；
 *   · 接口地址写死在模板逻辑里，改路径要全局搜字符串；
 *   · 页面单测必须 mock 网络，测不了"拿到数据之后怎么渲染"。
 *
 * 抽到这一层之后，页面只调函数、只认类型。
 *
 * ## 与后端「渲染契约」的关系
 *
 * 后端从 2026-10-16 起在订单详情里下发 `renderable`（状态中文、能不能点、
 * 为什么不能点、进度时间轴）。**这里原样透传，不做任何加工** ——
 * 页面拿到就是能直接渲染的东西。
 *
 * ⚠️ `renderable` 是**追加字段**：老版本后端不返回它，所以类型上标成可选，
 * 页面必须有降级路径。等全量上线后再把它改成必填（见批次 5）。
 */

import { request } from '../utils/api';

/** 后端下发的状态（能直接渲染） */
export interface RenderableStatus {
  code: string;
  label: string;
  tone: 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger';
  customerHint?: string | null;
}

/** 后端下发的动作（能不能点是后端算好的） */
export interface RenderableAction {
  code: string;
  label: string;
  enabled: boolean;
  disabledReason?: string | null;
  confirmText?: string | null;
  danger?: boolean;
  style?: 'primary' | 'ghost' | 'line';
}

export interface RenderableProgressStep {
  code: string;
  label: string;
  done: boolean;
  active?: boolean;
  at?: string | null;
  note?: string | null;
}

export interface RenderableProgress {
  current: string;
  timeline: RenderableProgressStep[];
}

/** 渲染契约三件套 */
export interface RenderableOrderView {
  status: RenderableStatus;
  actions: RenderableAction[];
  progress?: RenderableProgress;
}

/** 定制订单详情（只列页面用得到的字段） */
export interface CustomRecipeOrderDetail {
  orderId: string;
  status: string;
  /** 后端下发的可渲染形态；老后端不返回 */
  renderable?: RenderableOrderView | null;
  targetGoal?: string | null;
  scheduledDate?: string | null;
  amount?: number | null;
  creditAmount?: number | null;
  creditUsed?: number | null;
  /** 后端算好的抵扣余额；**前端不要再自己相减** */
  creditRemaining?: number | null;
  recipeId?: string | null;
  recipeName?: string | null;
  recipeCoverImageUrl?: string | null;
  paymentDeadlineAt?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  cancellationReason?: string | null;
  createdAt?: string | null;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
  [key: string]: unknown;
}

/** 定制设置里顾客需要知道的几个（公开子集） */
export interface PublicCustomRecipeConfig {
  feeAmount: number;
  creditAmount: number;
  deliveryWorkDays: number;
  paymentTimeoutMinutes: number;
  orderNotifyTemplateId?: string | null;
  attachmentMaxCount?: number;
  autoCompleteDays?: number;
  requireCustomerConfirm?: boolean;
  aftersaleWindowDays?: number;
  freeRevisionCount?: number;
  freeRevisionWindowDays?: number;
}

/**
 * 取订单详情。
 *
 * `orderId` 是**业务编号**（CR 开头），不是数据库主键 ——
 * 小程序这一路一直在用业务编号，别改成主键。
 */
export async function fetchOrderDetail(
  orderId: string,
): Promise<CustomRecipeOrderDetail | null> {
  const res: any = await request({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}`,
    method: 'GET',
  });
  if (res?.code === 0 && res.data) return res.data as CustomRecipeOrderDetail;
  return null;
}

/**
 * 取定制设置（顾客侧公开的那几个字段）。
 *
 * ⚠️ **失败时抛错，不要静默返回 null。**
 *
 * 第一版我写的是"失败就返回 null，页面用默认值显示，不白屏"，
 * 被自己的测试拦下了 —— 因为这里的默认值包含**定制费与可抵扣金额**：
 * 后台把定制费改成 500，而接口一挂，顾客看到的是默认的 300 并照着下单。
 * **显示一个错误的价格，比显示"加载失败"糟糕得多。**
 *
 * 所以这里如实抛错，由页面提示"加载失败，请重试"。
 */
export async function fetchPublicConfig(): Promise<PublicCustomRecipeConfig> {
  const res: any = await request({
    url: '/custom-recipe-config',
    method: 'GET',
  });
  if (res?.code === 0 && res.data) {
    return res.data as PublicCustomRecipeConfig;
  }
  throw new Error(res?.message || '读取定制设置失败');
}

/**
 * 顾客自助取消。
 *
 * ⚠️ **必须把 `refundStatus` 带回来。**
 * 退款是钱的事：后端在取消响应里已经回了退款进展（PROCESSING / FAILED…），
 * 页面要当场告诉顾客。只回一个 `ok` 的话，退款失败时顾客会以为钱在路上，
 * 直到他自己去翻订单才发现 —— 那可能是几天后了。
 * （我第一版就漏了它，是从页面里搬代码时丢的。）
 */
export async function cancelOrder(orderId: string): Promise<{
  ok: boolean;
  message?: string;
  refundStatus?: string | null;
  refundAmount?: number | null;
  data?: Record<string, unknown>;
}> {
  const res: any = await request({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}/cancel`,
    method: 'POST',
  });
  if (res?.code === 0) {
    return {
      ok: true,
      refundStatus: res.data?.refundStatus ?? null,
      refundAmount: res.data?.refundAmount ?? null,
      data: res.data,
    };
  }
  return { ok: false, message: res?.message };
}

/**
 * 取我的定制订单列表。
 *
 * `options` 原样透传给后端（status / page / pageSize）——
 * 这一层不做过滤，过滤是后端的事。
 */
export async function fetchMyOrders(options?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  orders: CustomRecipeOrderDetail[];
  total?: number;
  [key: string]: unknown;
} | null> {
  const res: any = await request({
    url: '/custom-recipe/my-orders',
    method: 'GET',
    ...(options ? { data: options } : {}),
    quiet: true,
    suppressErrorToast: true,
  });
  if (res?.code === 0 && res.data) return res.data;
  return null;
}

/** 取某只狗的定制健康摘要（带回每日热量与克数） */
export async function fetchDogHealthSummary(
  dogId: string,
): Promise<Record<string, unknown> | null> {
  const res: any = await request({
    url: `/custom-recipe/dogs/${encodeURIComponent(dogId)}/health-summary`,
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  });
  if (res?.code === 0 && res.data) return res.data;
  return null;
}

/**
 * 提交定制单。
 *
 * ⚠️ 刻意**不吞错误**：非 0 会让 `request` reject 并带上服务端 message。
 * 此前按 HTTP 风格的 2xx 判断成功，而后端约定的成功码是 0，
 * 于是出现过"下单成功却提示网络错误"。
 */
export async function submitOrder(
  payload: Record<string, unknown>,
): Promise<{ orderId: string; [key: string]: unknown }> {
  const res: any = await request({
    url: '/custom-recipe/orders',
    method: 'POST',
    data: payload,
  });
  const orderId = res?.data?.orderId;
  if (res?.code !== 0 || !orderId) {
    throw new Error(res?.message || '下单失败，请重试');
  }
  return res.data;
}

/**
 * 从动作清单里取某一个动作。
 *
 * 页面**不该自己判断**"现在能不能取消" —— 那是后端算好的。
 * 但页面需要知道"这个按钮要不要显示"，所以给一个简单的查找函数。
 */
export function findAction(
  view: RenderableOrderView | null | undefined,
  code: string,
): RenderableAction | undefined {
  return view?.actions?.find((action) => action.code === code);
}

/**
 * 把后端的 tone 映射成小程序的样式类名。
 *
 * 这是**唯一**允许的"前端自己判断"：色调 → class 属于纯呈现，
 * 后端不该知道小程序用的是什么类名。映射表本身也不含业务含义。
 */
export function toneToClass(tone: string | undefined): string {
  switch (tone) {
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    case 'progress':
      return 'progress';
    case 'success':
      return 'success';
    case 'danger':
      return 'danger';
    default:
      return 'neutral';
  }
}

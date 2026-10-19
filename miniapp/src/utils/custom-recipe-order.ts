/**
 * 定制食谱订单 · 顾客端展示口径（状态文案 / 目标文案 / 日期金额 / 退款 / 支付时限）
 *
 * 为什么必须抽成公共模块：
 * 这套文案原先在 success.vue、orders.vue、order-detail.vue 里各抄了一份，
 * 结果后端新增 CANCELLED 枚举时两份都没跟上 —— 订单列表把英文枚举名原样显示给
 * 顾客，订单详情则降级成"定制订单"。只要文案还有第二份拷贝，就一定会再漏第三次。
 *
 * 口径基准：与后台（admin-web 的定制订单列表）保持一致 —— PAID 统一叫「已付款」。
 * 小程序详情页原来在「已付款」后面又加了半句排期承诺，那是在替后端许诺：
 * 订单此时只是收了钱、还没进制作，顾客看到会以为"已经在做了"。
 * 宁可少说一句，也不替后端许诺。
 *
 * 这里只放**纯函数**（不碰 uni API、不发请求），这样可以在 node 环境里直接单测；
 * 需要网络的部分留在各页面里。
 */

/**
 * ⚠️ **状态与目标的文案不在这里了**（2026-10-16 批次 5.1 搬走）。
 *
 * 这里原有三份本地表：`CUSTOM_RECIPE_STATUS_TEXT` / `_CLASS` /
 * `CUSTOM_RECIPE_GOAL_TEXT`。它们当初解决了"三个页面各抄一份"的问题，
 * 但**没解决"后端加枚举时前端要跟上"** —— 而这件事 2026-10-16 又发生了一次：
 * 后端加 `COMPLETED`（已完成）时这三份表都没跟上，
 * 顾客点完「确认收到」再回订单列表，**看到的是英文 `COMPLETED`**。
 *
 * 与 2026-10-04 加「已取消」时漏了两处半是同一个毛病：
 * **只要中文还有第二份拷贝，就一定会再漏一次。**
 *
 * 现在状态与目标的中文只存在于后端的**选项字典**里，
 * 页面一律用 `utils/option-set.ts` 来取。
 *
 * 这个文件只剩"与文案无关的东西"：金额/日期格式化、退款进展文案、
 * 支付时限推算。那些是**纯格式化**，不含枚举映射。
 */

/**
 * 把状态码统一成大写、去掉空格。
 *
 * 原来它在被删掉的那一段里（状态文案表旁边），但退款文案也在用 ——
 * 它是**纯格式化**，与"文案有没有第二份拷贝"无关，所以留下。
 * （删表时差点把它一起删掉，是架构守卫报出来的。）
 */
function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

export function formatAmount(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * 日期展示（YYYY-MM-DD，本地时区）。
 *
 * 本地时区是刻意的：后端把 scheduledDate / estimatedDeliveryDate 按当天零点存，
 * 用 UTC 格式化会让北京时间凌晨的单显示成前一天。
 */
export function formatDate(value?: string | null, fallback = ''): string {
  const date = toDate(value);
  if (!date) return fallback;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 只要月日（如「10 月 8 日」）：交付日一般就在几天内，带上年份反而更难读 */
export function formatMonthDay(value?: string | Date | null): string {
  const date = value instanceof Date ? value : toDate(value);
  if (!date) return '';
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/** 只要时分（如「14:35」）：用于"请在 X 前完成支付" */
export function formatClock(value?: string | number | Date | null): string {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'number'
        ? new Date(value)
        : toDate(value);
  if (!date) return '';
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ==================== 退款展示 ====================

export interface CustomRecipeRefundLike {
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
}

export interface CustomRecipeRefundDisplay {
  text: string;
  /** 样式档位：处理中 / 已到账 / 未成功 */
  tone: 'processing' | 'done' | 'failed';
}

/**
 * 退款状态 → 顾客看得懂的一句话。
 *
 * 后端会下发的口径是 PROCESSING / REFUNDED / FAILED，这里额外兼容微信侧可能出现的
 * PENDING / SUCCESS / ABNORMAL / CLOSED —— 退款是钱的事，宁可多认几个别名，
 * 也不能因为枚举名叫法略有出入就让顾客看不到结果。
 *
 * 认不出来的状态返回 null（不显示）：退款进度不能靠猜，猜错比不显示更糟。
 */
export function describeCustomRecipeRefund(
  order: CustomRecipeRefundLike | null | undefined,
): CustomRecipeRefundDisplay | null {
  const status = normalizeKey(order?.refundStatus);
  if (!status) return null;

  const amount = Number(order?.refundAmount ?? 0);
  const amountText = Number.isFinite(amount) && amount > 0
    ? ` ¥${formatAmount(amount)}`
    : '';

  if (['REFUNDED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(status)) {
    return { text: `已退款${amountText}`, tone: 'done' };
  }

  if (['PROCESSING', 'PENDING', 'IN_PROGRESS', 'REFUNDING'].includes(status)) {
    return { text: `退款中${amountText}`, tone: 'processing' };
  }

  if (['FAILED', 'ABNORMAL', 'CLOSED', 'ERROR'].includes(status)) {
    // 退款失败时最要紧的是"顾客能看懂并知道找谁"，不是展示原始枚举
    return { text: '退款未成功，请联系客服', tone: 'failed' };
  }

  return null;
}

// ==================== 支付时限 ====================

export interface PaymentDeadlineInput {
  /** 后端下发的支付截止时间（ISO 字符串，可能为 null） */
  paymentDeadlineAt?: string | null;
  /** 下单时间：没有 paymentDeadlineAt 时用它 + 超时分钟数估算 */
  createdAt?: string | null;
  /** 后台配置的支付超时分钟数；0 = 不自动关单 */
  paymentTimeoutMinutes?: number | null;
  /** 便于单测注入"现在"，不传则取当前时间 */
  now?: number;
}

function resolveNow(now?: number): number {
  return Number.isFinite(now) ? Number(now) : Date.now();
}

/**
 * 解析支付截止时间（epoch ms）。两个口径都拿不到就返回 null。
 *
 * 优先用后端给的 paymentDeadlineAt —— 那是权威值；
 * 退而求其次才用 createdAt + paymentTimeoutMinutes 估算（页面先渲染、订单详情还没回来时）。
 */
export function resolvePaymentDeadlineAt(
  input: PaymentDeadlineInput,
): number | null {
  const explicit = toDate(input.paymentDeadlineAt ?? null);
  if (explicit) return explicit.getTime();

  const minutes = Number(input.paymentTimeoutMinutes ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  const created = toDate(input.createdAt ?? null);
  if (!created) return null;

  return created.getTime() + minutes * 60 * 1000;
}

/**
 * 支付截止时间是否已经过去（2026-10-19）。
 *
 * 截止时间是业务规则，不等待后台定时关单；
 * 页面到点就应隐藏支付入口/待付款提醒。
 */
export function isPaymentExpired(
  deadlineAt: number | string | null | undefined,
  now = Date.now(),
): boolean {
  if (deadlineAt === null || deadlineAt === undefined || deadlineAt === '') {
    return false;
  }
  const timestamp =
    typeof deadlineAt === 'number'
      ? deadlineAt
      : new Date(deadlineAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now;
}

/**
 * 剩余时间文案（如「12 分钟」）。
 * 已过期返回空串 —— 由调用方决定怎么说"已经超时了"。
 */
export function formatRemainingMinutes(
  deadlineAt: number,
  now?: number,
): string {
  const remaining = deadlineAt - resolveNow(now);
  if (remaining <= 0) return '';
  if (remaining < 60 * 1000) return '不到 1 分钟';
  return `${Math.ceil(remaining / (60 * 1000))} 分钟`;
}

/**
 * 支付时限提示（提交成功页 / 订单详情 / 首页待付款提醒共用）。
 *
 * 三种口径，绝不瞎猜：
 *   · 有截止时间 → "请在 14:35 前完成支付（还剩 12 分钟），超时订单会自动取消"
 *   · 只有配置的分钟数 → "请在 30 分钟内完成支付，超时订单会自动取消"
 *   · 两个都没有 → 返回空串，页面不显示时限文案
 */
export function buildPaymentTimeoutHint(input: PaymentDeadlineInput): string {
  const now = resolveNow(input.now);
  const deadline = resolvePaymentDeadlineAt({ ...input, now });

  if (deadline !== null) {
    if (deadline <= now) {
      return '已超过支付时限，订单可能已被自动取消';
    }
    const remaining = formatRemainingMinutes(deadline, now);
    return `请在 ${formatClock(deadline)} 前完成支付${
      remaining ? `（还剩 ${remaining}）` : ''
    }，超时订单会自动取消`;
  }

  const minutes = Number(input.paymentTimeoutMinutes ?? 0);
  if (Number.isFinite(minutes) && minutes > 0) {
    return `请在 ${minutes} 分钟内完成支付，超时订单会自动取消`;
  }

  return '';
}

/**
 * 提交前的"预计交付日"估算：从今天起往后数 N 个工作日（跳过周六周日）。
 *
 * 为什么前端也敢算：顾客在**提交前**必须看到一个大致的日子，否则"预计交付"这栏
 * 只是一句空话。真正的排期（含节假日、当天约满顺延）由后端算，所以页面上
 * 必须同时写明"以订单为准"—— 这里只负责给个量级正确、不误导的参考值。
 */
export function estimateDeliveryDate(
  workDays: number,
  from: Date = new Date(),
): Date | null {
  const days = Number(workDays);
  if (!Number.isFinite(days) || days <= 0) return null;

  const date = new Date(from.getTime());
  let remaining = Math.floor(days);
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }
  return date;
}

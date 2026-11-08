/**
 * 日期格式化工具（MiniApp端）
 * 统一处理日期显示格式
 * 自动转换为浏览器本地时区（中国用户为UTC+8）
 */

/**
 * 今天的日期（YYYY-MM-DD，**按本地时区**算）。
 *
 * ⚠️ 不能用 `new Date().toISOString().slice(0, 10)` —— 那是 UTC，
 * 东八区凌晨 0~8 点会差一天（这个项目在临时脚本里踩过好几次）。
 *
 * 2026-10-09 从当时的疫苗板块提到这里（多处都要用它算"今天"，
 * 两处各写一份迟早不一致）。
 */
function formatLocalDateText(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayDateText(): string {
  return formatLocalDateText(new Date());
}

/**
 * 顾客可预约的最早制作日期（YYYY-MM-DD，按本地时区算）。
 *
 * 老板 2026-11-08 定：顾客仍按老规矩 —— 每天早上 6 点前下单可约当天，
 * 6 点起最早次日制作。管理员 / 客服代客下单不受这条限制，调用方按角色决定。
 */
export function earliestCustomerProductionDate(now: Date = new Date()): string {
  const date = new Date(now);
  if (date.getHours() >= 6) {
    date.setDate(date.getDate() + 1);
  }
  return formatLocalDateText(date);
}

export interface ProductionDatePickerState {
  /** 选择器允许的最早日期 */
  minDate: string;
  /** 选择器打开时的初始值：订单自己的日期，只有订单日期早于今天才兜底到今天 */
  selectedDate: string;
  /** 当前订单日期是否还允许通过选择器修改 */
  canChange: boolean;
}

/**
 * 订单详情页「修改制作日期」选择器的初始状态。
 *
 * 关键：初始值必须取订单自己的日期，不能取“最早可选日”。
 * 否则一张今天制作的订单，在 6 点后打开选择器会被顶到明天，
 * 顾客点「修改 → 确定」就会在没改日期的情况下把订单推迟一天。
 */
export function resolveProductionDatePickerState(options: {
  orderDate?: string | null;
  isAdmin: boolean;
  now?: Date;
}): ProductionDatePickerState {
  const now = options.now ?? new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayText = formatLocalDateText(today);
  const minDate = options.isAdmin
    ? todayText
    : earliestCustomerProductionDate(now);

  let orderDateText = '';
  if (options.orderDate) {
    const orderDate = new Date(options.orderDate);
    if (!Number.isNaN(orderDate.getTime())) {
      orderDate.setHours(0, 0, 0, 0);
      orderDateText = formatLocalDateText(orderDate);
    }
  }

  const selectedDate =
    orderDateText && orderDateText >= todayText ? orderDateText : todayText;

  return {
    minDate,
    selectedDate,
    canChange: !orderDateText || orderDateText >= minDate,
  };
}

/**
 * 格式化为完整日期时间（YYYY/MM/DD HH:mm）
 * 用于订单详情页
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hour}:${minute}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}

/**
 * 格式化为短日期时间（MM-DD HH:mm）
 * 用于订单列表页
 */
export function formatShortDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '';

  try {
    const date = new Date(isoString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '';
  }
}

/**
 * 格式化为纯日期（YYYY-MM-DD）
 * 用于生产标签、日期选择器
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}

/**
 * 格式化为中文日期（X月X日）
 * 用于采购管理
 */
export function formatChineseDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}

/**
 * 格式化为中文日期时间（X月X日 HH:mm）
 * 用于采购管理详情
 */
export function formatChineseDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}

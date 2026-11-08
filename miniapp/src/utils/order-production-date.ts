/**
 * 鲜食订单「预约制作日期」的管理员改期准入（2026-11-08）。
 *
 * 老板定：员工端/管理员端的鲜食订单详情里，给**管理员**一个改期入口，
 * 但只在**还没开始采购**之前 —— 采购一开始，制作日期就锁死。
 *
 * 这里的判断必须和后端 `order.assertTargetDateEditable()` 对得上：
 *   采购中 / 生产中 / 急冻中 / 已发货 / 已完成 / 已取消 / 售后中 都不能改；
 *   试吃装是现货，本来就没有制作日期。
 *
 * 放在纯函数里单独测，避免页面上一堆 if 拼错状态、员工点了才报错。
 */

export interface ProductionDateEditOrder {
  status?: string | null;
  type?: string | null;
}

/** 采购开始前的三种状态：初始 / 待支付 / 已付款 */
const PRODUCTION_DATE_EDITABLE_STATUSES = ['INIT', 'PENDING_PAYMENT', 'PAID'];

/**
 * 订单当前是否允许改预约制作日。
 * 注意：调用方还要自己判断「当前登录人是不是管理员」——员工端不放开。
 */
export function canAdminEditOrderProductionDate(
  order: ProductionDateEditOrder | null | undefined,
): boolean {
  if (!order) return false;

  // 试吃装是现货，没有制作日期可改
  if (order.type === 'TASTING_PACK') return false;

  return PRODUCTION_DATE_EDITABLE_STATUSES.includes(String(order.status || ''));
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 预约制作日怎么显示给店员看：「2026年11月9日 周一」。
 *
 * 这个字段是"某一天"，不是某个时刻：后端按当天零点存（UTC），直接截 ISO
 * 字符串、或者用手机本地时区取年月日，都可能差一天。统一按东八区取。
 */
export function formatProductionDateLabel(value?: string | null): string {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const shanghai = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return `${shanghai.getUTCFullYear()}年${shanghai.getUTCMonth() + 1}月${shanghai.getUTCDate()}日 ${WEEKDAY_LABELS[shanghai.getUTCDay()]}`;
}

export type ProductionDateSelection = 'before-min' | 'unchanged' | 'ok';

/**
 * 管理员选完日期后、发请求前的两道检查。
 *
 * 「点开选择器直接确定」也会触发一次选择 —— 如果原日期本身不可选（比如已经
 * 过去了），不拦就会在管理员什么都没改的情况下把订单推迟一天。
 */
export function checkProductionDateSelection(options: {
  selectedDate: string;
  minDate: string;
  currentDate?: string | null;
}): ProductionDateSelection {
  const selected = String(options.selectedDate || '');
  const minDate = String(options.minDate || '');
  const current = String(options.currentDate || '');

  if (!selected || (minDate && selected < minDate)) return 'before-min';
  if (current && selected === current) return 'unchanged';
  return 'ok';
}

/** 后台说"这单已经锁了"时，对应的中文说法 */
const LOCKED_STATUS_COPY: Record<string, string> = {
  PURCHASING: '这一单已经开始采购，制作日期不能再改',
  IN_PRODUCTION: '这一单已经排产制作，制作日期不能再改',
  FREEZING: '这一单已经制作完成，制作日期不能再改',
  SHIPPED: '这一单已经发货，制作日期不能再改',
  COMPLETED: '这一单已经完成，制作日期不能再改',
  CANCELLED: '这一单已经取消，制作日期不能再改',
  AFTERSALE: '这一单正在售后处理中，制作日期不能再改',
};

export interface ProductionDateUpdateErrorCopy {
  /** 给店员/管理员看的一句话 */
  text: string;
  /** 后台明确拒绝（状态已翻、没权限）→ 顺手刷新，让「改期」入口消失 */
  shouldRefresh: boolean;
}

/**
 * 后台改期接口的报错翻译（2026-11-08）。
 *
 * 状态刚翻到采购中时，后端抛的是英文
 * `Cannot update target production date for order in status: PURCHASING`；
 * 微信 toast 只有两行，直接把英文怼上去就是半句天书。这里统一翻成人话，
 * 并区分「要不要刷新」——日期本身不合规（超过 90 天等）刷新也没用，不刷。
 */
export function describeProductionDateUpdateError(
  message?: string | null,
): ProductionDateUpdateErrorCopy {
  const text = String(message || '').trim();
  if (!text) return { text: '改期失败，请重试', shouldRefresh: false };

  // 统一转小写再匹配：项目里的「调用了却没定义」守卫会把 /.../i.exec 误认成
  // 调用了 i()，所以这里不用正则的 i 标记。
  const lower = text.toLowerCase();

  const statusMatch =
    /cannot update target production date for order in status:\s*([a-z_]+)/.exec(
      lower,
    );
  if (statusMatch) {
    const status = statusMatch[1].toUpperCase();
    return {
      text: LOCKED_STATUS_COPY[status] || '这一单已经不能再改制作日期了',
      shouldRefresh: true,
    };
  }

  if (/permission to modify/.test(lower)) {
    return { text: '只有管理员能改制作日期', shouldRefresh: true };
  }

  // 后台这两句本来就是中文，但都属于「这单已经锁了」，要刷新让入口消失
  if (/采购已开始/.test(text) || /试吃装是现货/.test(text)) {
    return { text, shouldRefresh: true };
  }

  // 日期本身不合规（早于今天 / 超过 90 天 / 不合法）：原样提示，不用刷新
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return { text, shouldRefresh: false };
  }

  return { text: '改期失败，请重试', shouldRefresh: false };
}


/**
 * 顾客端订单进度（2026-10-30）。
 *
 * 顾客要的不是十个状态码，是"这单走到哪一步、下一步等我做什么"。
 * 三类订单（鲜食 / 补剂 / 定制）的状态码互相不重叠，但都能收敛到
 * 同一条四步线：付款 → 制作 → 发货 → 收货（定制叫"交付"）。
 *
 * 放在 utils 而不是页面里，是为了让"我的订单"卡片和后续的详情页
 * 共用同一套映射 —— 以前列表按状态给一句话，详情页用另一套六步条，
 * 两边对不上。
 */

export type OrderKind = 'food' | 'supplement' | 'custom';

export type OrderStepKey = 'PAID' | 'MAKING' | 'SHIPPED' | 'RECEIVED';

export interface OrderStep {
  key: OrderStepKey;
  label: string;
}

export interface OrderProgress {
  /** 固定四步，未命中的状态也返回四步，方便模板无条件渲染 */
  steps: OrderStep[];
  /** 当前所在步的下标（0 起）；无进度语义时为 0 */
  currentIndex: number;
  /** 已完成的步数；等于 4 表示整单走完 */
  doneCount: number;
  /** 是否显示进度线：已取消 / 售后中 / 未知状态不显示 */
  showProgress: boolean;
  /**
   * 待付款：第一步还没发生。
   * 此时第一步的标签是「待付款」而不是「已付款」—— 否则顾客会以为
   * 自己已经付过钱了。
   */
  isWaiting: boolean;
}

const STEP_KEYS: OrderStepKey[] = ['PAID', 'MAKING', 'SHIPPED', 'RECEIVED'];

const STEP_LABELS: Record<OrderKind, [string, string, string, string]> = {
  food: ['已付款', '制作中', '已发货', '已签收'],
  supplement: ['已付款', '分装中', '已发货', '已签收'],
  custom: ['已付款', '定制中', '已交付', '已完成'],
};

interface ProgressState {
  currentIndex: number;
  doneCount: number;
}

/**
 * 状态 → 步位。
 *
 * 注意"锁定期"那几个状态（采购中 / 生产中 / 急冻中）：对顾客来说都是
 * "在做了"，落在同一步，不再各自给一个词。
 */
const PROGRESS_BY_STATUS: Record<OrderKind, Record<string, ProgressState>> = {
  food: {
    PENDING_PAYMENT: { currentIndex: 0, doneCount: 0 },
    PAID: { currentIndex: 1, doneCount: 1 },
    PURCHASING: { currentIndex: 1, doneCount: 1 },
    IN_PRODUCTION: { currentIndex: 1, doneCount: 1 },
    FREEZING: { currentIndex: 1, doneCount: 1 },
    SHIPPED: { currentIndex: 2, doneCount: 2 },
    COMPLETED: { currentIndex: 3, doneCount: 4 },
  },
  supplement: {
    PENDING_PAYMENT: { currentIndex: 0, doneCount: 0 },
    PAID: { currentIndex: 1, doneCount: 1 },
    PACKING: { currentIndex: 1, doneCount: 1 },
    PACKED: { currentIndex: 1, doneCount: 1 },
    SHIPPED: { currentIndex: 2, doneCount: 2 },
    COMPLETED: { currentIndex: 3, doneCount: 4 },
  },
  custom: {
    PENDING_PAYMENT: { currentIndex: 0, doneCount: 0 },
    PAID: { currentIndex: 1, doneCount: 1 },
    IN_PROGRESS: { currentIndex: 1, doneCount: 1 },
    DELIVERED: { currentIndex: 2, doneCount: 2 },
    COMPLETED: { currentIndex: 3, doneCount: 4 },
  },
};

export function resolveOrderProgress(input: {
  kind: OrderKind;
  status: string;
}): OrderProgress {
  const labels = STEP_LABELS[input.kind] || STEP_LABELS.food;
  const isWaiting = input.status === 'PENDING_PAYMENT';
  const steps = STEP_KEYS.map((key, index) => ({
    key,
    label: isWaiting && index === 0 ? '待付款' : labels[index],
  }));
  const state = PROGRESS_BY_STATUS[input.kind]?.[input.status];

  // 已取消 / 售后中 / 未知状态：不画进度线，由卡片改用状态条表达
  if (!state) {
    return {
      steps,
      currentIndex: 0,
      doneCount: 0,
      showProgress: false,
      isWaiting: false,
    };
  }

  return {
    steps,
    currentIndex: state.currentIndex,
    doneCount: state.doneCount,
    showProgress: true,
    isWaiting,
  };
}

/** 北京时间偏移：后端给的是 UTC ISO，日期要按上海口径算，避免差一天 */
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatMonthDay(iso?: string | null): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '';

  const shifted = new Date(time + SHANGHAI_OFFSET_MS);
  return `${shifted.getUTCMonth() + 1}月${shifted.getUTCDate()}日`;
}

/**
 * 进度下面那一行"什么时候到"。
 *
 * 没排产就说"等待排期"，不要拼出"预计 月 日"这种半截话；
 * 已完成的单返回空串，模板据此不占这一行的空间。
 */
export function formatEtaText(input: {
  kind: OrderKind;
  status: string;
  estimatedShippingDate?: string | null;
  scheduledDate?: string | null;
}): string {
  const { kind, status } = input;
  const progress = resolveOrderProgress({ kind, status });

  if (!progress.showProgress || status === 'COMPLETED') return '';

  if (status === 'PENDING_PAYMENT') {
    if (kind === 'custom') return '付款后开始定制';
    if (kind === 'supplement') return '付款后开始分装';
    return '付款后开始制作';
  }

  if (kind === 'custom') {
    if (status === 'DELIVERED') return '已交付，等待你确认';
    const day = formatMonthDay(input.scheduledDate);
    return day ? `预计 ${day} 交付` : '等待排期';
  }

  if (status === 'SHIPPED') return '已发出，等待签收';

  const day = formatMonthDay(input.estimatedShippingDate);
  if (day) return `预计 ${day} 发出`;

  return kind === 'supplement' ? '等待安排发货' : '等待排期';
}

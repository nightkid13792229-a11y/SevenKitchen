/**
 * 定制排期 · 日历规则（2026-10-16，批次 4.2）
 *
 * ## 此前的问题
 *
 * 排期只有"具体某一天"一层（`custom_recipe_schedule`），于是：
 *   · 想设「每周日休息」得**一天一天手动关**，关完下周还得再关一遍；
 *   · 只有接单容量，没有**交付容量** —— 而"收钱"和"交货"对一个人来说
 *     是两件事：一天能收 4 单不等于一天能交出 4 份。
 *
 * ## 三层优先级
 *
 * ```
 * 具体某天（custom_recipe_schedule）  ← 最高，临时调整用
 *      ↓ 没有这一天
 * 按星期规则（custom_recipe_weekday_rule）
 *      ↓ 没有这一星期几
 * 全局配置（custom_recipe_config）
 * ```
 *
 * 为什么具体某天优先：老板临时想"下周三多接两单"，
 * 不该被"每周三休息"的规则挡住 —— **越具体的设置越该说话算数**。
 *
 * ## 为什么是纯函数
 *
 * 日历的错都是"某一天算错了"，而那一天可能是三个月后的某个周三。
 * 抽成纯函数之后可以**把一整年的每一天都跑一遍**，
 * 用几条不变式去验（见测试）—— 靠人想例子必然漏。
 */

/** 星期几的中文（0 = 周日，与 JS `getDay()` 一致） */
export const WEEKDAY_LABELS = [
  '周日',
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
] as const;

/** 按星期的规则（来自 `custom_recipe_weekday_rule`） */
export interface WeekdayRule {
  /** 0 = 周日 … 6 = 周六 */
  weekday: number;
  isOpen: boolean;
  /** 留空表示用全局值 */
  capacity?: number | null;
  deliveryCapacity?: number | null;
  note?: string | null;
}

/** 具体某天的设置（来自 `custom_recipe_schedule`） */
export interface DateOverride {
  isAvailable: boolean;
  capacity: number;
  bookedCount: number;
  deliveryCapacity: number;
  deliveryCount: number;
  isPublicHoliday: boolean;
}

export interface ResolveDayInput {
  date: Date;
  /** 具体某天的设置；没有就传 null */
  override?: DateOverride | null;
  /** 该星期几的规则；没有就传 null */
  weekdayRule?: WeekdayRule | null;
  /** 全局默认（来自配置） */
  defaultCapacity: number;
  defaultDeliveryCapacity: number;
}

export interface ResolvedDay {
  date: Date;
  /** 这一天开不开（休息日 / 假期 / 已满都算不开） */
  isOpen: boolean;
  capacity: number;
  bookedCount: number;
  remaining: number;
  deliveryCapacity: number;
  deliveryCount: number;
  deliveryRemaining: number;
  isPublicHoliday: boolean;
  /** 是"按星期规则"决定的还是"具体某天"决定的（排查用） */
  source: 'override' | 'weekday' | 'default';
  /** 不开的原因，人能看懂 */
  closedReason?: string | null;
  note?: string | null;
}

/**
 * 算某一天能不能接单/交付。
 *
 * ⚠️ **接单与交付是两套独立的容量**，任一满了这一天就接不了新单：
 * 接了单交不出来，比不接单更糟（顾客等着收货）。
 */
export function resolveDay(input: ResolveDayInput): ResolvedDay {
  const weekday = input.date.getDay();

  // ---- 具体某天优先 ----
  if (input.override) {
    const o = input.override;
    const remaining = Math.max(0, o.capacity - o.bookedCount);
    const deliveryRemaining = Math.max(
      0,
      o.deliveryCapacity - o.deliveryCount,
    );

    let isOpen = o.isAvailable && remaining > 0 && deliveryRemaining > 0;
    let closedReason: string | null = null;
    if (o.isPublicHoliday) {
      isOpen = false;
      closedReason = '这天是公众假期';
    } else if (!o.isAvailable) {
      closedReason = '这天已设为不接单';
    } else if (remaining <= 0) {
      closedReason = '这天的接单名额已满';
    } else if (deliveryRemaining <= 0) {
      closedReason = '这天的交付名额已满（做了也交不出来）';
    }

    return {
      date: input.date,
      isOpen,
      capacity: o.capacity,
      bookedCount: o.bookedCount,
      remaining,
      deliveryCapacity: o.deliveryCapacity,
      deliveryCount: o.deliveryCount,
      deliveryRemaining,
      isPublicHoliday: o.isPublicHoliday,
      source: 'override',
      closedReason,
      note: null,
    };
  }

  // ---- 按星期规则 ----
  if (input.weekdayRule) {
    const r = input.weekdayRule;
    const capacity = positiveOr(r.capacity, input.defaultCapacity);
    const deliveryCapacity = positiveOr(
      r.deliveryCapacity,
      input.defaultDeliveryCapacity,
    );

    return {
      date: input.date,
      isOpen: r.isOpen,
      capacity,
      bookedCount: 0,
      remaining: r.isOpen ? capacity : 0,
      deliveryCapacity,
      deliveryCount: 0,
      deliveryRemaining: r.isOpen ? deliveryCapacity : 0,
      isPublicHoliday: false,
      source: 'weekday',
      closedReason: r.isOpen
        ? null
        : `${WEEKDAY_LABELS[weekday]}固定休息`,
      note: r.note ?? null,
    };
  }

  // ---- 全局默认 ----
  return {
    date: input.date,
    isOpen: true,
    capacity: input.defaultCapacity,
    bookedCount: 0,
    remaining: input.defaultCapacity,
    deliveryCapacity: input.defaultDeliveryCapacity,
    deliveryCount: 0,
    deliveryRemaining: input.defaultDeliveryCapacity,
    isPublicHoliday: false,
    source: 'default',
    closedReason: null,
    note: null,
  };
}

/**
 * 默认的按星期规则（**不落库**，只在库里没配时用来兜底）。
 *
 * 为什么兜底也是"全开"而不是"周日休息"：
 * 默认值是一种**主张**。不打招呼就替老板决定"周日休息"，
 * 他哪天想周日也接单，会发现周日约不上却不知道为什么。
 * 库里有配置时以库里为准；库里没有，就按全局配置全周开放。
 */
export function defaultWeekdayRules(
  defaultCapacity: number,
  defaultDeliveryCapacity: number,
): WeekdayRule[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday,
    isOpen: true,
    capacity: defaultCapacity,
    deliveryCapacity: defaultDeliveryCapacity,
    note: null,
  }));
}

function positiveOr(
  value: number | null | undefined,
  fallback: number,
): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

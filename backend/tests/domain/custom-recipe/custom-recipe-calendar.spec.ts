import {
  WEEKDAY_LABELS,
  defaultWeekdayRules,
  resolveDay,
  type DateOverride,
  type WeekdayRule,
} from '../../../src/domain/custom-recipe/custom-recipe.calendar';

/**
 * 排期日历规则 · 测试（2026-10-16，批次 4.2）
 *
 * ## 为什么要把一整年跑一遍
 *
 * 日历的错都是"**某一天**算错了"，而那一天可能是三个月后的某个周三。
 * 靠人想例子必然漏（"周日休息"遇上"五一假期"遇上"那天名额满了"）。
 *
 * 所以下面除了逐条边界，还有一组**不变式**：
 * 把一整年的每一天都算一遍，检查这些性质**天天都成立**。
 * 一年 365 天覆盖了全部七种星期几的所有组合，比手写七个用例可靠得多。
 */

function override(overrides: Partial<DateOverride> = {}): DateOverride {
  return {
    isAvailable: true,
    capacity: 4,
    bookedCount: 0,
    deliveryCapacity: 4,
    deliveryCount: 0,
    isPublicHoliday: false,
    ...overrides,
  };
}

function weekdayRule(overrides: Partial<WeekdayRule> = {}): WeekdayRule {
  return {
    weekday: 0,
    isOpen: true,
    capacity: null,
    deliveryCapacity: null,
    note: null,
    ...overrides,
  };
}

/** 2026-10-18 是周日 */
const SUNDAY = new Date('2026-10-18T00:00:00+08:00');
const MONDAY = new Date('2026-10-19T00:00:00+08:00');

function base(overrides: Record<string, unknown> = {}) {
  return {
    date: MONDAY,
    override: null,
    weekdayRule: null,
    defaultCapacity: 4,
    defaultDeliveryCapacity: 3,
    ...overrides,
  };
}

describe('resolveDay · 三层优先级', () => {
  it('哪层都没有 → 用全局配置，全开', () => {
    const day = resolveDay(base());

    expect(day.isOpen).toBe(true);
    expect(day.capacity).toBe(4);
    expect(day.deliveryCapacity).toBe(3);
    expect(day.source).toBe('default');
  });

  it('只有按星期规则 → 用它', () => {
    const day = resolveDay(
      base({
        date: SUNDAY,
        weekdayRule: weekdayRule({ weekday: 0, isOpen: false }),
      }),
    );

    expect(day.isOpen).toBe(false);
    expect(day.source).toBe('weekday');
    expect(day.closedReason).toContain('周日固定休息');
  });

  it('★ 具体某天压过按星期规则（临时调整要说话算数）', () => {
    const day = resolveDay(
      base({
        date: SUNDAY,
        // 周日固定休息……
        weekdayRule: weekdayRule({ weekday: 0, isOpen: false }),
        // ……但老板临时开了这一天
        override: override({ isAvailable: true, capacity: 2 }),
      }),
    );

    expect(day.isOpen).toBe(true);
    expect(day.capacity).toBe(2);
    expect(day.source).toBe('override');
  });

  it('按星期规则没写容量时用全局值', () => {
    const day = resolveDay(
      base({ weekdayRule: weekdayRule({ capacity: null }) }),
    );

    expect(day.capacity).toBe(4);
    expect(day.deliveryCapacity).toBe(3);
  });

  it('按星期规则写了容量时用它', () => {
    const day = resolveDay(
      base({
        weekdayRule: weekdayRule({ capacity: 6, deliveryCapacity: 2 }),
      }),
    );

    expect(day.capacity).toBe(6);
    expect(day.deliveryCapacity).toBe(2);
  });
});

describe('resolveDay · 关闭的原因要说清楚', () => {
  it('公众假期', () => {
    const day = resolveDay(
      base({ override: override({ isPublicHoliday: true }) }),
    );
    expect(day.isOpen).toBe(false);
    expect(day.closedReason).toContain('公众假期');
  });

  it('手动设为不接单', () => {
    const day = resolveDay(
      base({ override: override({ isAvailable: false }) }),
    );
    expect(day.closedReason).toContain('已设为不接单');
  });

  it('接单名额已满', () => {
    const day = resolveDay(
      base({ override: override({ capacity: 4, bookedCount: 4 }) }),
    );
    expect(day.isOpen).toBe(false);
    expect(day.closedReason).toContain('接单名额已满');
  });

  it('★ 交付名额满也算关：接了单交不出来，比不接单更糟', () => {
    const day = resolveDay(
      base({
        override: override({
          capacity: 4,
          bookedCount: 0, // 接单还有位置
          deliveryCapacity: 2,
          deliveryCount: 2, // 但交不出来
        }),
      }),
    );

    expect(day.isOpen).toBe(false);
    expect(day.closedReason).toContain('交付名额已满');
  });

  it('假期优先于"名额满了"（先说是假期，别让人以为是被抢光了）', () => {
    const day = resolveDay(
      base({
        override: override({
          isPublicHoliday: true,
          capacity: 4,
          bookedCount: 4,
        }),
      }),
    );
    expect(day.closedReason).toContain('公众假期');
  });
});

describe('★ 不变式：把一整年跑一遍', () => {
  /** 造一个"周日休息、周六只接 2 单"的典型配置 */
  const rules = new Map<number, WeekdayRule>([
    [0, weekdayRule({ weekday: 0, isOpen: false })],
    [6, weekdayRule({ weekday: 6, capacity: 2, deliveryCapacity: 1 })],
  ]);

  const year = Array.from({ length: 365 }, (_, index) => {
    const date = new Date('2026-01-01T00:00:00+08:00');
    date.setDate(date.getDate() + index);
    return date;
  });

  it('每一天都算出结果，不抛异常', () => {
    for (const date of year) {
      const day = resolveDay(
        base({
          date,
          weekdayRule: rules.get(date.getDay()) ?? null,
        }),
      );
      expect(day.date).toEqual(date);
    }
  });

  it('所有周日都不开，且原因都写着周日休息', () => {
    for (const date of year) {
      if (date.getDay() !== 0) continue;
      const day = resolveDay(
        base({ date, weekdayRule: rules.get(date.getDay()) ?? null }),
      );
      expect(day.isOpen).toBe(false);
      expect(day.closedReason).toContain('周日');
    }
  });

  it('周六容量是 2，其它工作日是 4', () => {
    for (const date of year) {
      const day = resolveDay(
        base({ date, weekdayRule: rules.get(date.getDay()) ?? null }),
      );
      if (date.getDay() === 6) expect(day.capacity).toBe(2);
      if (date.getDay() >= 1 && date.getDay() <= 5) {
        expect(day.capacity).toBe(4);
      }
    }
  });

  it('★ 剩余量永远不为负（超卖是最难看的 bug）', () => {
    for (const date of year) {
      // 故意造出"已超卖"的数据，看剩余量会不会变成负数
      const day = resolveDay(
        base({
          date,
          override: override({ capacity: 2, bookedCount: 5 }),
        }),
      );
      expect(day.remaining).toBeGreaterThanOrEqual(0);
      expect(day.deliveryRemaining).toBeGreaterThanOrEqual(0);
    }
  });

  it('★ 剩余量加上已用量永远等于容量（不多不少）', () => {
    for (const date of year) {
      const day = resolveDay(
        base({
          date,
          override: override({ capacity: 3, bookedCount: 2 }),
        }),
      );
      expect(day.remaining + day.bookedCount).toBe(day.capacity);
      expect(day.deliveryRemaining + day.deliveryCount).toBe(
        day.deliveryCapacity,
      );
    }
  });

  it('★ 开着的日子一定有剩余名额（不然就是自相矛盾）', () => {
    for (const date of year) {
      const day = resolveDay(
        base({ date, weekdayRule: rules.get(date.getDay()) ?? null }),
      );
      if (day.isOpen) {
        expect(day.remaining).toBeGreaterThan(0);
        expect(day.deliveryRemaining).toBeGreaterThan(0);
        expect(day.closedReason).toBeNull();
      }
    }
  });

  it('★ 不开放的日子一定说得清为什么', () => {
    for (const date of year) {
      const day = resolveDay(
        base({
          date,
          weekdayRule: rules.get(date.getDay()) ?? null,
          override: date.getDate() === 15 ? override({ isAvailable: false }) : null,
        }),
      );
      if (!day.isOpen) {
        expect(day.closedReason).toBeTruthy();
      }
    }
  });
});

describe('defaultWeekdayRules', () => {
  it('七天都造出来，且默认全开', () => {
    const rules = defaultWeekdayRules(4, 3);
    expect(rules).toHaveLength(7);
    expect(rules.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('★ 默认全开，不替老板决定"周日休息"', () => {
    /**
     * 默认值是一种**主张**。不打招呼就替老板决定周日休息，
     * 他哪天想周日接单，会发现约不上却不知道为什么。
     */
    const rules = defaultWeekdayRules(4, 3);
    expect(rules.every((r) => r.isOpen)).toBe(true);
  });
});

describe('WEEKDAY_LABELS', () => {
  it('0 是周日（与 JS getDay() 一致，避免转换出错）', () => {
    expect(WEEKDAY_LABELS[0]).toBe('周日');
    expect(WEEKDAY_LABELS[6]).toBe('周六');
    // 用真实日期验证一遍：2026-10-18 是周日
    expect(WEEKDAY_LABELS[new Date('2026-10-18T12:00:00+08:00').getDay()]).toBe(
      '周日',
    );
  });
});

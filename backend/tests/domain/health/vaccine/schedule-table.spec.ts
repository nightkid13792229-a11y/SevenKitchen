import { classifyVaccineKinds } from '../../../../src/domain/health/vaccine/products';
import {
  CORE_SCHEDULE,
  LEPTO_SCHEDULE,
  RABIES_SCHEDULE,
  SCHEDULE_STEPS,
  VACCINE_KIND_LABELS,
  VACCINE_KIND_LAYERS,
  findScheduleStep,
  type ScheduleStepSpec,
  type VaccineKind,
} from '../../../../src/domain/health/vaccine/schedule-table';
import {
  addDays,
  addWeeks,
  addYears,
  materializeSteps,
  matchRecords,
  toDateText,
  type VaccineRecordLike,
} from '../../../../src/domain/health/vaccine/engine';

/**
 * 免疫程序表 · 用例从表生成（技术方案 5.1）。
 *
 * ── 为什么这么写 ─────────────────────────────────────────────
 * **用例从表生成，不是从代码反推** —— 读代码写测试，代码错了测试会跟着错。
 * 所以这个文件：
 *   ① 遍历 `SCHEDULE_STEPS` 的**每一行**（这张表就是需求附录 A 的代码版）
 *   ② 用需求 A.1 的三个公式（AGE / FLEX / GRACE）**自己把窗口算一遍**
 *      —— 不从引擎拿任何数字
 *   ③ 拿算出来的窗口要求引擎：起点 −1 天 = 还没到、窗口内 = 待接种、
 *      终点 +1 天 = 尽快补种
 *
 * 表改一行 → 这里的期望跟着变；引擎与表不一致 → 红。
 *
 * ⚠️ 三条**故意断言**的口径（需求 A.3 / 5.2）：
 *   · 一针未打、而这一类第一步的窗口已经过去 → 窗口挪到今天 + 带出原窗口，
 *     状态写"尽快补种" → 这就是"终点 +1 天"那一档
 *   · 已满 26 周、没打到 16 周那一针 → **只补一针**（`core-catchup`）
 *   · 钩端上一针 ≥18 个月 → **重启免疫 2 针**（`lepto-restart-1/2`）
 */

const TODAY = new Date('2026-10-15T00:00:00');

type Row = ScheduleStepSpec;

function rowOf(key: string): Row {
  const row = findScheduleStep(key);
  if (!row) throw new Error(`程序表里没有这一行：${key}`);
  return row;
}

/** 展开后的一步（测试自己算的，不来自引擎） */
interface Instance {
  key: string;
  row: Row;
  kind: VaccineKind;
  start: Date;
  end: Date;
  /** 理想接种日（需求 A.3 第 2 条）：AGE / GRACE = 窗口起点，FLEX = 窗口终点 */
  anchor: Date;
}

/** 用表里的参数算一步的窗口（AGE / FLEX / GRACE，需求 A.1 的通用公式） */
function windowFromParameters(
  row: Row,
  birthday: Date,
  previousAnchor: Date | null,
): { start: Date; end: Date } {
  if (row.windowKind === 'AGE') {
    const start = addWeeks(birthday, row.ageWeeks ?? 0);
    const end =
      row.windowDays !== undefined
        ? addDays(start, row.windowDays)
        : addWeeks(start, row.windowWeeks ?? 0);
    return { start, end };
  }

  const anchor = previousAnchor as Date;
  if (row.windowKind === 'GRACE') {
    const start = addYears(anchor, row.intervalYears ?? 0);
    return { start, end: addDays(start, row.graceDays ?? 0) };
  }

  // FLEX：上一针 +2~+4 周
  //
  // ⚠️ 核心首免的"最后一针不早于 16 周龄"**不在这里夹取**，而由下面的展开规则实现：
  //    一直往后排，直到有一针的**窗口起点**落在 16 周龄或以后 —— 那一针就是最后一针
  //    （需求 A.2"系列结束条件"：起始越晚，针数越少；起始 ≥16 周 → 只需 1 针）。
  return {
    start: addWeeks(anchor, row.minIntervalWeeks ?? 0),
    end: addWeeks(anchor, row.maxIntervalWeeks ?? 0),
  };
}

/**
 * 按程序表把某一类的步骤**整条算出来**（纯测试侧实现）。
 *
 * 这就是"从表生成"的核心：针数由"直到有一针 ≥16 周龄"决定，
 * 每一步的窗口由上一针的理想日 + 该行的间隔参数决定。
 */
function walkKind(kind: VaccineKind, birthday: Date): Instance[] {
  const instances: Instance[] = [];
  const push = (key: string, row: Row, anchor: Date | null) => {
    const { start, end } = windowFromParameters(row, birthday, anchor);
    const instance: Instance = {
      key,
      row,
      kind,
      start,
      end,
      anchor: row.windowKind === 'FLEX' ? end : start,
    };
    instances.push(instance);
    return instance;
  };

  if (kind === 'core_early') {
    push('core-early-1', rowOf('core-early-1'), null);
    return instances;
  }

  if (kind === 'core') {
    let anchor: Date | null = null;
    const floor = addWeeks(birthday, CORE_SCHEDULE.finishWeeks);
    for (let index = 1; index <= 8; index += 1) {
      const row = index === 1 ? rowOf('core-puppy-1') : rowOf('core-puppy-n');
      const instance = push(`core-puppy-${index}`, row, anchor);
      anchor = instance.anchor;
      if (instance.start.getTime() >= floor.getTime()) break;
    }
    const booster = push('core-26w', rowOf('core-26w'), null);
    let adultAnchor = booster.start;
    for (let index = 1; index <= CORE_SCHEDULE.adultMaxRepeats; index += 1) {
      const instance = push(
        `core-adult-${index}`,
        rowOf('core-adult-n'),
        adultAnchor,
      );
      adultAnchor = instance.anchor;
    }
    return instances;
  }

  if (kind === 'rabies') {
    const first = push('rabies-1', rowOf('rabies-1'), null);
    let anchor = first.anchor;
    for (let index = 2; index <= RABIES_SCHEDULE.maxDoses + 1; index += 1) {
      const instance = push(`rabies-${index}`, rowOf('rabies-n'), anchor);
      anchor = instance.anchor;
    }
    return instances;
  }

  // lepto
  const first = push('lepto-primary-1', rowOf('lepto-primary-1'), null);
  const second = push(
    'lepto-primary-2',
    rowOf('lepto-primary-2'),
    first.anchor,
  );
  let anchor = second.anchor;
  for (let index = 1; index <= LEPTO_SCHEDULE.maxRepeats; index += 1) {
    const instance = push(
      `lepto-repeat-${index}`,
      rowOf('lepto-repeat-n'),
      anchor,
    );
    anchor = instance.anchor;
  }
  return instances;
}

/** 哪支苗用来记"这一步打过了"（字面归类就够，不依赖产品库） */
const NAME_BY_KIND: Record<string, string> = {
  core: '卫佳伍',
  rabies: '狂犬疫苗',
  lepto: '钩端螺旋体',
  core_early: '宠必威幼犬保',
};

/**
 * 把某一行变成一个可跑的用例：
 *   生日取"目标窗口正好落在今天"的那一天，
 *   目标之前的同类步骤**都按程序记成打过**（记录日期 = 那一步的理想接种日）。
 *
 * 这样目标步骤的窗口与"按表算出来的"完全一致，
 * 而且已经打过的针不会被挪到今天 —— 我们才能观察窗口本身。
 */
function scenarioFor(rowKey: string, targetKey: string) {
  const kind = rowOf(rowKey).kind;
  const placeholder = new Date('2000-01-01T00:00:00');
  const probe = walkKind(kind, placeholder).find(
    (item) => item.key === targetKey,
  );
  if (!probe) throw new Error(`算不出这一步：${targetKey}`);

  // 目标窗口起点距生日多少天 → 把它挪到今天
  const offsetDays = Math.round(
    (probe.start.getTime() - placeholder.getTime()) / 86400000,
  );
  const birthday = addDays(TODAY, -offsetDays);

  const instances = walkKind(kind, birthday);
  const index = instances.findIndex((item) => item.key === targetKey);
  if (index < 0) throw new Error(`这一步不存在：${targetKey}`);
  const target = instances[index];
  const earlier = instances.slice(0, index);

  const records: VaccineRecordLike[] = earlier.map((item) => ({
    id: `seed-${item.key}`,
    vaccineName: NAME_BY_KIND[item.kind],
    vaccinationDate: toDateText(item.anchor),
  }));

  return { birthday, target, records, earlier };
}

/** 通用行：窗口起点 −1 天 / 起点 / 终点 / 终点 +1 天 */
const GENERIC_ROWS: Array<{ rowKey: string; targetKey: string }> = [
  { rowKey: 'core-puppy-1', targetKey: 'core-puppy-1' },
  { rowKey: 'core-puppy-n', targetKey: 'core-puppy-3' },
  { rowKey: 'core-puppy-last', targetKey: 'core-puppy-4' },
  { rowKey: 'core-26w', targetKey: 'core-26w' },
  { rowKey: 'core-adult-n', targetKey: 'core-adult-1' },
  { rowKey: 'rabies-1', targetKey: 'rabies-1' },
  { rowKey: 'rabies-n', targetKey: 'rabies-2' },
  { rowKey: 'lepto-primary-1', targetKey: 'lepto-primary-1' },
  { rowKey: 'lepto-primary-2', targetKey: 'lepto-primary-2' },
  { rowKey: 'lepto-repeat-n', targetKey: 'lepto-repeat-1' },
];

describe('免疫程序表 · 用例从表生成（技术方案 5.1）', () => {
  it('表里每一行都有档案：类别 / 层级 / 依据 / 窗口参数', () => {
    for (const row of SCHEDULE_STEPS) {
      expect(VACCINE_KIND_LAYERS[row.kind]).toBe(row.layer);
      expect(VACCINE_KIND_LABELS[row.kind]).toBeTruthy();
      expect(row.basis.length).toBeGreaterThan(10);
      expect(row.label.length).toBeGreaterThan(0);
      if (row.windowKind === 'AGE') {
        expect(row.ageWeeks).toBeDefined();
        expect(
          row.windowWeeks !== undefined || row.windowDays !== undefined,
        ).toBe(true);
      }
      if (row.windowKind === 'FLEX') {
        expect(row.minIntervalWeeks).toBeDefined();
        expect(row.maxIntervalWeeks).toBeDefined();
      }
      if (row.windowKind === 'GRACE') {
        expect(row.intervalYears).toBeDefined();
        expect(row.graceDays).toBeDefined();
      }
    }
  });

  it('每一行都会被生成用例覆盖（新增一行忘了加用例 → 红）', () => {
    const covered = new Set([
      ...GENERIC_ROWS.map((item) => item.rowKey),
      'core-catchup',
      'lepto-restart-1',
      'lepto-restart-2',
      'core-early-1',
    ]);
    for (const row of SCHEDULE_STEPS) {
      expect(covered.has(row.key)).toBe(true);
    }
  });

  it('只有核心疫苗可以被抗体检测替代（需求 R9 / 附录 A 的 R9 依据）', () => {
    for (const row of SCHEDULE_STEPS) {
      expect(row.titerable).toBe(row.kind === 'core');
    }
  });

  it('宽限期：核心成年加强 90 天，狂犬（首针与每年）30 天，钩端 30 天（需求 A.2）', () => {
    expect(CORE_SCHEDULE.adultGraceDays).toBe(90);
    expect(RABIES_SCHEDULE.graceDays).toBe(30);
    expect(RABIES_SCHEDULE.firstWindowDays).toBe(30);
    expect(LEPTO_SCHEDULE.graceDays).toBe(30);
  });

  it('早期核心疫苗不进默认计划（需求第四节：不主动推）', () => {
    expect(findScheduleStep('core-early-1')?.inDefaultPlan).toBe(false);
    for (const row of SCHEDULE_STEPS) {
      if (row.key === 'core-early-1') continue;
      expect(row.inDefaultPlan).toBe(true);
    }
  });

  for (const { rowKey, targetKey } of GENERIC_ROWS) {
    const row = rowOf(rowKey);
    describe(`程序表行 · ${rowKey}（${row.kind} / ${row.windowKind}）`, () => {
      const scenario = scenarioFor(rowKey, targetKey);

      it('窗口与表算出来的一致（引擎不许自己发明窗口）', () => {
        const steps = materializeSteps({
          birthday: scenario.birthday,
          records: scenario.records,
          today: TODAY,
        });
        const target = steps.find((step) => step.key === targetKey);
        expect(target).toBeDefined();
        expect(toDateText(target!.windowStart)).toBe(
          toDateText(scenario.target.start),
        );
        expect(toDateText(target!.windowEnd)).toBe(
          toDateText(scenario.target.end),
        );
        expect(target!.kind).toBe(row.kind);
        expect(target!.layer).toBe(row.layer);
      });

      it('窗口起点 −1 天：还没到；窗口内：待接种；终点 +1 天：尽快补种', () => {
        const statusAt = (today: Date) => {
          const steps = matchRecords(
            materializeSteps({
              birthday: scenario.birthday,
              records: scenario.records,
              today,
            }),
            scenario.records,
            { today },
          );
          return steps.find((step) => step.key === targetKey)?.status ?? null;
        };

        expect(statusAt(addDays(scenario.target.start, -1))).toBe('UPCOMING');
        expect(statusAt(scenario.target.start)).toBe('DUE');
        expect(statusAt(scenario.target.end)).toBe('DUE');
        // 一针未打的第一步会被挪到今天（A.3 第 1 条）—— 期望仍然是"尽快补种"
        expect(statusAt(addDays(scenario.target.end, 1))).toBe('OVERDUE');
      });
    });
  }
});

describe('程序表 · 三条硬口径的专项断言（需求 A.3 / 5.2）', () => {
  it('一针未打、起针窗口已过 → 窗口挪到今天，宽度不变，并带出原窗口', () => {
    const birthday = addWeeks(TODAY, -20); // 20 周龄、零记录
    const steps = matchRecords(
      materializeSteps({ birthday, records: [], today: TODAY }),
      [],
      { today: TODAY },
    );
    const first = steps.find((step) => step.key === 'core-puppy-1');
    expect(first).toBeDefined();
    expect(toDateText(first!.windowStart)).toBe(toDateText(TODAY));
    expect(toDateText(first!.windowEnd)).toBe(toDateText(addWeeks(TODAY, 2)));
    expect(first!.missedWindowStart).toBeDefined();
    expect(toDateText(first!.missedWindowStart as Date)).toBe(
      toDateText(addWeeks(birthday, CORE_SCHEDULE.startWeeks)),
    );
    expect(toDateText(first!.missedWindowEnd as Date)).toBe(
      toDateText(addWeeks(birthday, CORE_SCHEDULE.startWeeks + 2)),
    );
    expect(first!.status).toBe('OVERDUE');
    expect(first!.statusLabel).toBe('尽快补种');
  });

  it('窗口还开着的狗 → 不挪、也不带原窗口', () => {
    const birthday = addWeeks(TODAY, -6); // 6 周龄
    const steps = materializeSteps({ birthday, records: [], today: TODAY });
    const first = steps.find((step) => step.key === 'core-puppy-1');
    expect(first!.missedWindowStart).toBeUndefined();
    expect(toDateText(first!.windowStart)).toBe(toDateText(TODAY));
  });

  it('打了几针之后，后续窗口按**实际接种日**滚动（需求 A.3 第 2 条）', () => {
    const birthday = addWeeks(TODAY, -20);
    // 第一针实打在第 9 周（比理想日晚 3 周）
    const records: VaccineRecordLike[] = [
      {
        id: 'r1',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 9)),
      },
    ];
    const steps = materializeSteps({ birthday, records, today: TODAY });
    const second = steps.find((step) => step.key === 'core-puppy-2');
    expect(toDateText(second!.windowStart)).toBe(
      toDateText(addWeeks(birthday, 11)),
    );
    expect(toDateText(second!.windowEnd)).toBe(
      toDateText(addWeeks(birthday, 13)),
    );
  });

  it('8/12/16 周三针即完成首免 —— 打过 16 周龄那一针就不再排第 4 针', () => {
    // 幼犬（还没满 26 周）才看得到首免系列的步骤
    const birthday = addWeeks(TODAY, -20);
    const records: VaccineRecordLike[] = [
      {
        id: 'r1',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 8)),
      },
      {
        id: 'r2',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 12)),
      },
      {
        id: 'r3',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 16)),
      },
    ];
    const steps = matchRecords(
      materializeSteps({ birthday, records, today: TODAY }),
      records,
      { today: TODAY },
    );
    const puppy = steps.filter(
      (step) => step.series === 'PRIMARY' && step.kind === 'core',
    );
    expect(puppy.length).toBe(3); // 8 / 12 / 16 周各一针，没有第 4 针
    expect(puppy.every((step) => step.status === 'DONE')).toBe(true);
    // 下一件该做的事是 26 周补强，不是"再补一针首免"
    const next = steps.find((step) => step.key === 'core-26w');
    expect(next?.status).toBe('UPCOMING');
  });

  it('8/12/14 周（最后一针太早）→ 仍然要补一针到 ≥16 周龄', () => {
    const birthday = addWeeks(TODAY, -20);
    const records: VaccineRecordLike[] = [
      {
        id: 'r1',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 8)),
      },
      {
        id: 'r2',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 12)),
      },
      {
        id: 'r3',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 14)),
      },
    ];
    const steps = matchRecords(
      materializeSteps({ birthday, records, today: TODAY }),
      records,
      { today: TODAY },
    );
    const pendingPuppy = steps.filter(
      (step) =>
        step.series === 'PRIMARY' &&
        step.kind === 'core' &&
        step.status !== 'DONE',
    );
    expect(pendingPuppy.length).toBe(1);
    // 窗口起点不早于 16 周龄
    expect(pendingPuppy[0].windowStart.getTime()).toBeGreaterThanOrEqual(
      addWeeks(birthday, CORE_SCHEDULE.finishWeeks).getTime(),
    );
  });

  it('成年犬、系列已完成 → 直接进"每 3 年"（不再回头催首免）', () => {
    const birthday = addWeeks(TODAY, -60);
    const records: VaccineRecordLike[] = [
      {
        id: 'r1',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 8)),
      },
      {
        id: 'r2',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 12)),
      },
      {
        id: 'r3',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(addWeeks(birthday, 16)),
      },
    ];
    const view = matchRecords(
      materializeSteps({ birthday, records, today: TODAY }),
      records,
      { today: TODAY },
    );
    expect(view.some((step) => step.key === 'core-catchup')).toBe(false);
    const adult = view.find((step) => step.key === 'core-adult-1');
    expect(adult).toBeDefined();
    // 成年加强 = 最后一针实际接种日 + 3 年
    expect(toDateText(adult!.windowStart)).toBe(
      toDateText(
        addYears(addWeeks(birthday, 16), CORE_SCHEDULE.adultIntervalYears),
      ),
    );
  });

  it('钩端上一针 ≥18 个月 → 重启（2 针），第 1 针从今天起', () => {
    const birthday = addWeeks(TODAY, -160);
    const records: VaccineRecordLike[] = [
      {
        id: 'r1',
        vaccineName: '钩端螺旋体',
        vaccinationDate: toDateText(addMonthsHelper(TODAY, -20)),
      },
    ];
    const steps = materializeSteps({ birthday, records, today: TODAY });
    const restartOne = steps.find((step) => step.key === 'lepto-restart-1');
    const restartTwo = steps.find((step) => step.key === 'lepto-restart-2');
    expect(restartOne).toBeDefined();
    expect(restartTwo).toBeDefined();
    expect(toDateText(restartOne!.windowStart)).toBe(toDateText(TODAY));
    expect(toDateText(restartOne!.windowEnd)).toBe(
      toDateText(addWeeks(TODAY, 2)),
    );
    expect(toDateText(restartTwo!.windowStart)).toBe(
      toDateText(addWeeks(TODAY, 2)),
    );
    expect(toDateText(restartTwo!.windowEnd)).toBe(
      toDateText(addWeeks(TODAY, 4)),
    );
    expect(restartOne!.label).toContain('重启免疫');
  });

  it('早期核心疫苗：没登记过就不出现，登记过才认（需求第四节）', () => {
    const birthday = addWeeks(TODAY, -5);
    const without = materializeSteps({ birthday, records: [], today: TODAY });
    expect(without.find((step) => step.key === 'core-early-1')).toBeUndefined();

    const records: VaccineRecordLike[] = [
      {
        id: 'r1',
        vaccineName: '宠必威幼犬保',
        vaccinationDate: toDateText(addWeeks(birthday, 4)),
      },
    ];
    const withEarly = matchRecords(
      materializeSteps({ birthday, records, today: TODAY }),
      records,
      { today: TODAY },
    );
    const early = withEarly.find((step) => step.key === 'core-early-1');
    expect(early).toBeDefined();
    expect(early!.status).toBe('DONE');
  });

  it('已满 26 周、零记录 → 只补一针（`core-catchup`），窗口从今天起、带原窗口', () => {
    const birthday = addWeeks(TODAY, -220);
    const view = matchRecords(
      materializeSteps({ birthday, records: [], today: TODAY }),
      [],
      { today: TODAY },
    );
    const catchUp = view.find((step) => step.key === 'core-catchup');
    expect(catchUp).toBeDefined();
    expect(catchUp!.label).toBe(CORE_SCHEDULE.catchUpLabel);
    expect(toDateText(catchUp!.windowStart)).toBe(toDateText(TODAY));
    expect(catchUp!.status).toBe('OVERDUE');
    // 原窗口 = 首免第 1 针的窗口（6~8 周龄），不是"今天"
    expect(toDateText(catchUp!.missedWindowStart as Date)).toBe(
      toDateText(addWeeks(birthday, CORE_SCHEDULE.startWeeks)),
    );
    expect(toDateText(catchUp!.missedWindowEnd as Date)).toBe(
      toDateText(addWeeks(birthday, CORE_SCHEDULE.startWeeks + 2)),
    );
    // 程序表里没有"第 1 针"那种幼犬步骤出现在将来
    expect(
      view.some(
        (step) => step.key.startsWith('core-puppy-') && step.status !== 'DONE',
      ),
    ).toBe(false);
  });
});

/** 测试里用的小工具：往前推 N 个月 */
function addMonthsHelper(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

describe('字面归类 · 名字不再猜核心/早期（2026-10-30 #3 收紧）', () => {
  it('"犬二联 / 犬三联" 名字不判核心，也不判早期', () => {
    expect(classifyVaccineKinds('犬二联')).not.toContain('core');
    expect(classifyVaccineKinds('犬三联')).not.toContain('core');
    expect(classifyVaccineKinds('犬二联')).not.toContain('core_early');
  });

  it('"四联及以上" 名字也不再算核心；产品库认得的才算', () => {
    expect(classifyVaccineKinds('犬四联')).not.toContain('core');
    expect(classifyVaccineKinds('六联')).not.toContain('core');
    expect(classifyVaccineKinds('卫佳伍')).toContain('core');
  });
});

describe('程序表 · 短话（hint）与依据（basis）分工', () => {
  it('每一行都有 hint，而且 hint 是"一句话"（首屏小字，不许塞长文）', () => {
    for (const step of SCHEDULE_STEPS) {
      expect(step.hint).toBeTruthy();
      expect(step.hint.length).toBeLessThanOrEqual(40);
      // 不许把依据原文抄进 hint（那就又变成一堵墙了）
      expect(step.hint).not.toBe(step.basis);
    }
  });

  it('需要引经据典的那几类，basis 明显比 hint 长（长的留给"查看详情"）', () => {
    const withCitation = SCHEDULE_STEPS.filter((step) =>
      /WSAVA|动物防疫法/.test(step.basis),
    );
    expect(withCitation.length).toBeGreaterThan(0);
    for (const step of withCitation) {
      expect(step.basis.length).toBeGreaterThan(step.hint.length);
    }
  });
});

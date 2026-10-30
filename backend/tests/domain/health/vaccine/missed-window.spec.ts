import {
  buildPlanView,
  materializeSteps,
  matchRecords,
  toDateText,
  type VaccineRecordLike,
  type VaccinePlanView,
} from '../../../../src/domain/health/vaccine/engine';

/**
 * **修法 A**（2026-10-16，E3 走查唯一一条验收不通过 · 验收表 R15）：
 *
 * > 一个步骤**最终是"逾期"**、而且它**确实有过一个已经过去的建议窗口**时，
 * > 就把那一段窗口记进 `missedWindowStart / missedWindowEnd`。
 *
 * 前端（`miniapp/src/domain/vaccine/status.ts`）**本来就认这两个字段**：
 * 有值就写「建议尽快补种（原建议时间 X，已过）」，没有值才写「建议尽快安排」。
 * 所以这一修**一行前端代码都不用动**。
 *
 * ── 为什么原来没有 ────────────────────────────────────────────
 * 这两个字段以前只有一条路会写 —— `moveToTodayIfMissed`（首针逾期、窗口被挪到今天）。
 * 而**加强针的窗口本来就不挪**：一只狂犬漏了两年的狗，状态算得出"逾期"，
 * 窗口也还留在原处（`windowStart/windowEnd` 就是那一段），只是没人把它标成"原建议时间"，
 * 于是页面上只能写「建议尽快安排」✗（真机受影响：测25、测15、测22、测21、测49）。
 *
 * ── 两条不能越过的线（第二组断言专门钉这个）────────────────────
 *   ① **被挪到今天的那种不许补**：它的窗口是"今天起算"的（`windowStart = 今天`），
 *      补上去就会写出「原建议时间（今天）~（今天+宽限），已过」——
 *      凭空说一个**还没过去的窗口**"已过"是错的。它真正错过的那个窗口在挪的时候
 *      就存好了，这里只许原样保留、不许改写。
 *   ② **窗口没过去的不许补**：窗口还开着 / 还没到的是"待接种"，不是"逾期"。
 *
 * 两条线落进代码就是一句判据：**这一步最终是 OVERDUE，而且窗口终点真的在今天之前**。
 * （"窗口起点在过去、且不等于今天"是同一件事的另一种说法：终点都过去了，起点自然也在过去。）
 *
 * ⚠️ 用例里的日期都是能手工验算的：下面每处 `originalWindow` 都写清了它从哪一针滚出来。
 */

const rec = (
  id: string,
  vaccineName: string,
  vaccinationDate: string,
  extra: Partial<VaccineRecordLike> = {},
): VaccineRecordLike => ({ id, vaccineName, vaccinationDate, ...extra });

const view = (
  birthday: string,
  records: VaccineRecordLike[],
  today: Date,
  extra: Record<string, unknown> = {},
): VaccinePlanView =>
  buildPlanView({ dogId: 'dog-1', birthday, records, today, ...extra });

/** 完整步骤表（含不在计划里的步骤）—— 不变量用例要逐条看 */
const allSteps = (
  birthday: string,
  records: VaccineRecordLike[],
  today: Date,
) =>
  matchRecords(
    materializeSteps({
      birthday: new Date(`${birthday}T00:00:00`),
      records,
      today,
    }),
    records,
    { today },
  );

const row = (plan: VaccinePlanView['plan'], key: string) =>
  plan.find((step) => step.key === key);

const step = (steps: ReturnType<typeof allSteps>, key: string) =>
  steps.find((item) => item.key === key);

/* ===========================================================================
 * ① 逾期 + 窗口真的过去了 → 说出"原来该打的时间"
 * =========================================================================== */

describe('修法 A · 加强针逾期 → 带出它自己那一段"原建议时间"（验收 R15）', () => {
  const TODAY = new Date('2026-10-15T00:00:00');

  it('原型 I：狂犬漏了两年 → 下一针带出 2025/08/01 ~ 08/31（就是原来的窗口，不是今天）', () => {
    const plan = view('2023-08-30', [rec('r1', '狂犬疫苗', '2024-08-01')], TODAY);

    // 窗口从"上一针实际接种日 2024-08-01 + 1 年"滚出来：2025-08-01 ~ +30 天
    expect(plan.next!.key).toBe('rabies-2');
    expect(plan.next!.status).toBe('OVERDUE');
    expect(plan.next!.windowStart).toBe('2025-08-01');
    expect(plan.next!.windowEnd).toBe('2025-08-31');
    expect(plan.next!.missedWindowStart).toBe('2025-08-01');
    expect(plan.next!.missedWindowEnd).toBe('2025-08-31');
    // 不是"今天" —— 前端那句话说「已过」必须是真的
    expect(plan.next!.missedWindowStart).not.toBe(toDateText(TODAY));

    // 计划里那一行同样带出来（前端计划行的小字：`原建议时间 2025/08 已过`）
    const rabiesRow = row(plan.plan, 'rabies-2');
    expect(rabiesRow).toBeDefined();
    expect(rabiesRow!.missedWindowStart).toBe('2025-08-01');
    expect(rabiesRow!.missedWindowEnd).toBe('2025-08-31');
  });

  it('真狗 测25（生日 2022-10-16，最后一针狂犬 2023-09-17）→ 原窗口 2024-09-17 ~ 2024-10-17', () => {
    const plan = view(
      '2022-10-16',
      [
        rec('r1', '宠必威锐必威', '2023-09-17', { kinds: ['rabies'] }),
        rec('r2', '卫佳捌', '2023-01-08', { kinds: ['core', 'lepto'] }),
        rec('r3', '卫佳伍', '2022-11-27', { kinds: ['core'] }),
      ],
      new Date('2026-10-16T00:00:00'),
    );

    expect(plan.next!.key).toBe('rabies-2');
    expect(plan.next!.windowStart).toBe('2024-09-17');
    expect(plan.next!.missedWindowStart).toBe('2024-09-17');
    expect(plan.next!.missedWindowEnd).toBe('2024-10-17');
  });

  it('真狗 测15（20 周、2 针卫佳伍）→ 补一针，带出下一步的原窗口', () => {
    const plan = view(
      '2026-05-24',
      [
        rec('r1', '卫佳伍', '2026-07-26', { kinds: ['core'] }),
        rec('r2', '卫佳伍', '2026-07-05', { kinds: ['core'] }),
      ],
      new Date('2026-10-16T00:00:00'),
    );

    // 上一针 2026-07-26 → 第 3 针窗口 = +2 周 ~ +4 周 = 08-09 ~ 08-23
    // 20 周、明显落后 → 按 CORE_LATE_START 补一针；原窗口仍来自第 3 针
    expect(plan.next!.key).toBe('core-catchup');
    expect(plan.next!.label).toBe('补一针');
    expect(plan.next!.missedWindowStart).toBe('2026-08-09');
    expect(plan.next!.missedWindowEnd).toBe('2026-08-23');
    expect(plan.next!.status).toBe('OVERDUE');
  });

  it('钩端年度加强逾期（上一针 2025-05-10，还没到 18 个月）→ 原窗口 2026-05-10 ~ 06-09', () => {
    const plan = view(
      '2021-06-01',
      [
        rec('r1', '优乐康', '2021-09-01', { kinds: ['lepto'] }),
        rec('r2', '优乐康', '2021-09-22', { kinds: ['lepto'] }),
        rec('r3', '优乐康', '2024-06-01', { kinds: ['lepto'] }),
        rec('r4', '优乐康', '2025-05-10', { kinds: ['lepto'] }),
      ],
      new Date('2026-10-16T00:00:00'),
    );

    const lepto = plan.plan.find((item) => item.kind === 'lepto');
    expect(lepto!.key).toBe('lepto-repeat-1');
    expect(lepto!.label).toBe('每年一次');
    expect(lepto!.status).toBe('OVERDUE');
    expect(lepto!.missedWindowStart).toBe('2026-05-10');
    expect(lepto!.missedWindowEnd).toBe('2026-06-09');
  });

  it('核心成年加强（每 3 年）逾期 → 原窗口 = 上一针 +3 年 ~ +90 天', () => {
    const plan = view(
      '2022-08-30',
      [
        rec('r1', '卫佳伍', '2022-10-20', { kinds: ['core'] }),
        rec('r2', '卫佳伍', '2022-11-10', { kinds: ['core'] }),
        rec('r3', '卫佳伍', '2022-12-01', { kinds: ['core'] }),
        rec('r4', '卫佳伍', '2023-01-05', { kinds: ['core'] }),
        rec('r6', '卫佳伍', '2023-03-01', { kinds: ['core'] }),
        rec('r5', '狂犬疫苗', '2025-09-01', { kinds: ['rabies'] }),
      ],
      new Date('2026-10-16T00:00:00'),
    );

    const adult = row(plan.plan, 'core-adult-1');
    expect(adult).toBeDefined();
    expect(adult!.status).toBe('OVERDUE');
    expect(adult!.windowStart).toBe('2026-03-01'); // = 26 周那一针 2023-03-01 + 3 年
    expect(adult!.missedWindowStart).toBe('2026-03-01');
    expect(adult!.missedWindowEnd).toBe('2026-05-30'); // +90 天
  });

  it('真狗 测49 的早期核心（4 周龄那一针没打上）→ 原窗口 2026-07-05 ~ 07-19', () => {
    const plan = view(
      '2026-06-07',
      [rec('r1', '宠必威幼犬保', '2026-04-05', { kinds: ['core_early'] })],
      new Date('2026-10-16T00:00:00'),
    );

    expect(plan.next!.key).toBe('core-early-1');
    expect(plan.next!.status).toBe('OVERDUE');
    expect(plan.next!.missedWindowStart).toBe('2026-07-05'); // 生日 + 4 周
    expect(plan.next!.missedWindowEnd).toBe('2026-07-19'); // 生日 + 6 周（窗口宽度 2 周）
  });
});

/* ===========================================================================
 * ② 两条不能越过的线：挪到今天的不许补、没过去的不许补
 * =========================================================================== */

describe('修法 A · 不许碰的两类（挪到今天 / 窗口还没过去）', () => {
  it('B 屏：一针未打的成年狗 —— 这三步的原窗口**还是挪的时候存好的那一份**，一个字没变', () => {
    // 原型 B 输入（`docs/prototypes/2026-10-15-vaccine-tab-prototype.html`）
    const TODAY = new Date('2026-10-15T00:00:00');
    const plan = view('2020-08-30', [], TODAY);

    // 三步都被"挪到今天"（一针未打 + 起针窗口早过了）——
    // ⚠️ 它们的窗口**就是今天起算的**：谁要是把"当前窗口"当成"原建议时间"补上去，
    //    页面上就会写出「原建议时间 2026/10/15 ~ ...，已过」这种假话。
    const moved = [
      ['core-catchup', '2020-10-11', '2020-10-25'], // 6~8 周龄那一针
      ['rabies-1', '2020-11-22', '2020-12-22'], // 12 周龄起 30 天
      ['lepto-primary-1', '2020-10-25', '2020-11-22'], // 8~12 周龄
    ] as const;

    for (const [key, start, end] of moved) {
      const item = row(plan.plan, key)!;
      expect(item.status).toBe('OVERDUE');
      // 窗口起点 = 今天（"挪到今天"这件事本身没变）
      expect(item.windowStart).toBe(toDateText(TODAY));
      // 原窗口 = 当年那一段，**不是今天**
      expect(item.missedWindowStart).toBe(start);
      expect(item.missedWindowEnd).toBe(end);
      expect(item.missedWindowStart).not.toBe(toDateText(TODAY));
    }
  });

  it('全量不变量：带 missedWindow 的步骤一定"逾期"，且那一段窗口**真的已经过去**', () => {
    const TODAY = new Date('2026-10-16T00:00:00');
    const todayText = toDateText(TODAY);
    const cases: Array<[string, VaccineRecordLike[]]> = [
      // 一针未打（从 2 周到 6 岁，各种"挪到今天"）
      ['2026-09-27', []],
      ['2026-08-30', []],
      ['2026-06-07', []],
      ['2025-10-12', []],
      ['2022-10-16', []],
      // 原型 B / I / C / K
      ['2020-08-30', []],
      ['2023-08-30', [rec('r1', '狂犬疫苗', '2024-08-01', { kinds: ['rabies'] })]],
      [
        '2023-08-30',
        [
          rec('r1', '狂犬疫苗', '2025-11-20', { kinds: ['rabies'] }),
          rec('r2', '卫佳伍', '2024-01-15', { kinds: ['core'] }),
          rec('r3', '钩端螺旋体', '2026-03-10', { kinds: ['lepto'] }),
        ],
      ],
      [
        '2014-08-30',
        [
          rec('r1', '狂犬疫苗', '2025-06-02', { kinds: ['rabies'] }),
          rec('r2', '卫佳伍', '2024-04-18', { kinds: ['core'] }),
        ],
      ],
      // 真狗：测15 / 测21 / 测22 / 测25 / 测49
      [
        '2026-05-24',
        [
          rec('r1', '卫佳伍', '2026-07-05', { kinds: ['core'] }),
          rec('r2', '卫佳伍', '2026-07-26', { kinds: ['core'] }),
        ],
      ],
      [
        '2026-06-07',
        [
          rec('r1', '卫佳伍', '2026-07-19', { kinds: ['core'] }),
          rec('r2', '卫佳伍', '2026-08-09', { kinds: ['core'] }),
          rec('r3', '卫佳伍', '2026-08-30', { kinds: ['core'] }),
          rec('r4', '西诺生物 狂犬病冻干灭活疫苗', '2026-09-27', {
            kinds: ['rabies'],
          }),
        ],
      ],
      [
        '2026-06-07',
        [
          rec('r1', '卫佳伍', '2026-07-19', { kinds: ['core'] }),
          rec('r2', '卫佳捌', '2026-08-30', { kinds: ['core', 'lepto'] }),
          rec('r3', '狂犬', '2026-09-27', { kinds: ['rabies'] }),
        ],
      ],
      [
        '2022-10-16',
        [
          rec('r1', '宠必威锐必威', '2023-09-17', { kinds: ['rabies'] }),
          rec('r2', '卫佳捌', '2023-01-08', { kinds: ['core', 'lepto'] }),
          rec('r3', '卫佳伍', '2022-11-27', { kinds: ['core'] }),
        ],
      ],
      [
        '2026-06-07',
        [
          rec('r1', '宠必威幼犬保', '2026-04-05', { kinds: ['core_early'] }),
          rec('r2', '卫佳伍', '2026-07-19', { kinds: ['core'] }),
          rec('r3', '卫佳伍', '2026-10-16', { kinds: ['core'] }),
        ],
      ],
    ];

    let checked = 0;
    for (const [birthday, records] of cases) {
      for (const item of allSteps(birthday, records, TODAY)) {
        checked += 1;
        const hasMissed = Boolean(item.missedWindowStart);
        if (hasMissed) {
          const missedStart = item.missedWindowStart as Date;
          const missedEnd = item.missedWindowEnd as Date;
          // ① 只有"逾期"才配写"原建议时间"
          expect(item.status).toBe('OVERDUE');
          // ② 写出来的那一段必须**真的过去了**（否则「已过」两个字是假话）
          expect(toDateText(missedEnd) < todayText).toBe(true);
          expect(toDateText(missedStart) < todayText).toBe(true);
          expect(toDateText(missedStart)).not.toBe(todayText);
          expect(missedEnd.getTime() >= missedStart.getTime()).toBe(true);
        } else {
          // ③ 反过来：只要真的逾期了（且不是"挪到今天"那种，它本来就有原窗口），
          //    就必须写出来 —— 这正是这次修的那条缝
          expect(item.status === 'OVERDUE' && !item.movedToToday).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(200); // 确实逐条走过（不是空转）
  });

  it('窗口还开着的（6 周幼犬第 1 针）→ 不带原窗口（那是"待接种"，不是"逾期"）', () => {
    const TODAY = new Date('2026-10-15T00:00:00');

    // ① 窗口起点**正好是今天**（生日 = 今天 − 6 周）→ 起点"在今天"，判据必须排除它
    const justOpened = step(allSteps('2026-09-03', [], TODAY), 'core-puppy-1')!;
    expect(justOpened.status).toBe('DUE');
    expect(toDateText(justOpened.windowStart)).toBe(toDateText(TODAY));
    expect(justOpened.missedWindowStart).toBeUndefined();
    expect(justOpened.missedWindowEnd).toBeUndefined();

    // ② 原型 A 那只（生日 2026-08-30，窗口 10/11 ~ 10/25 正开着）→ 同样不带
    const open = step(allSteps('2026-08-30', [], TODAY), 'core-puppy-1')!;
    expect(open.status).toBe('DUE');
    expect(toDateText(open.windowStart)).toBe('2026-10-11');
    expect(open.missedWindowStart).toBeUndefined();
    expect(open.missedWindowEnd).toBeUndefined();
  });

  it('打得晚但仍然算数的（在容差内完成）→ 已完成，不写原窗口', () => {
    // 第 1 针实打 2026-10-12；第 2 针窗口 = 上一针 +2~4 周 = 10-26 ~ 11-09，
    // 实打 2026-11-20（晚 11 天，仍在 4 周容差内）→ 算第 2 针，且不算"逾期"
    const steps = allSteps(
      '2026-08-30',
      [
        rec('r1', '卫佳伍', '2026-10-12', { kinds: ['core'] }),
        rec('r2', '卫佳伍', '2026-11-20', { kinds: ['core'] }),
      ],
      new Date('2027-01-10T00:00:00'),
    );
    const second = step(steps, 'core-puppy-2')!;
    expect(second.status).toBe('DONE');
    expect(second.missedWindowStart).toBeUndefined();
    // 没打完的后续针照旧（第 3 针 = 11-20 +2~4 周 = 12-04 ~ 12-18，窗口已过 → 带原窗口）
    const third = step(steps, 'core-puppy-3')!;
    expect(third.status).toBe('OVERDUE');
    expect(third.missedWindowStart).toBeDefined();
  });

  it('原型 C（记录齐全的 3 岁）→ 一个字都没变：窗口、状态、没有原窗口', () => {
    const TODAY = new Date('2026-10-15T00:00:00');
    const plan = view(
      '2023-08-30',
      [
        rec('r1', '狂犬疫苗', '2025-11-20', { kinds: ['rabies'] }),
        rec('r2', '卫佳伍', '2024-01-15', { kinds: ['core'] }),
        rec('r3', '钩端螺旋体', '2023-11-20', { kinds: ['lepto'] }),
        rec('r4', '钩端螺旋体', '2023-12-10', { kinds: ['lepto'] }),
        rec('r5', '钩端螺旋体', '2026-03-10', { kinds: ['lepto'] }),
        rec('r8', '钩端螺旋体', '2026-04-01', { kinds: ['lepto'] }),
        rec('r6', '卫佳伍', '2023-10-20', { kinds: ['core'] }),
        rec('r7', '卫佳伍', '2024-03-01', { kinds: ['core'] }),
      ],
      TODAY,
    );
    expect(
      plan.plan.map((item) => [item.kind, item.label, item.windowStart]),
    ).toEqual([
      ['rabies', '每年一次', '2026-11-20'],
      ['core', '加强（每 3 年）', '2027-03-01'],
      ['lepto', '每年一次', '2027-04-01'],
    ]);
    expect(plan.plan.every((item) => !item.missedWindowStart)).toBe(true);
    expect(plan.next!.missedWindowStart).toBeUndefined();
  });
});

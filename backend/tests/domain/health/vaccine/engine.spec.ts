import {
  addDays,
  addWeeks,
  addYears,
  buildPlanView,
  materializeSteps,
  matchRecords,
  pickNext,
  toDateText,
  type VaccineRecordLike,
} from '../../../../src/domain/health/vaccine/engine';
import { CORE_SCHEDULE } from '../../../../src/domain/health/vaccine/schedule-table';

/**
 * 引擎的四个纯函数 · 行为断言（技术方案 2.2 / 需求 5.2 与 R5、R6、R7、R9、R13）。
 *
 * 这个文件承接老用例里**仍然成立**的那些口径（逐条裁决见文件末尾的说明），
 * 钉住的是新规格：按类别判定、只给当前一步、忽略不下发但计数真实、
 * 抗体检测只替代核心、冲突只剩三条。
 */

const TODAY = new Date('2026-10-15T00:00:00');
const dog = (birthdayWeeksAgo: number) => addWeeks(TODAY, -birthdayWeeksAgo);

const record = (
  id: string,
  vaccineName: string,
  date: Date,
  extra: Partial<VaccineRecordLike> = {},
): VaccineRecordLike => ({
  id,
  vaccineName,
  vaccinationDate: toDateText(date),
  ...extra,
});

const build = (birthday: Date, records: VaccineRecordLike[] = [], extra = {}) =>
  buildPlanView({
    dogId: 'dog-1',
    birthday: toDateText(birthday),
    records,
    today: TODAY,
    ...extra,
  });

describe('引擎 · 按疫苗类别判定，不按狗的年龄标签（需求 5.2）', () => {
  it('6 岁、零记录 → "补一针"，**绝不出现"第 1 针"**（验收 R1）', () => {
    const view = build(dog(320));
    expect(view.next).not.toBeNull();
    expect(view.next!.kind).toBe('core');
    expect(view.next!.label).toBe('补一针');
    expect(view.next!.statusLabel).toBe('尽快补种');
    expect(view.next!.missedWindowStart).toBeDefined();
    expect(
      view.plan.some(
        (step) => step.kind === 'core' && step.label.includes('第 1 针'),
      ),
    ).toBe(false);
  });

  it('8 周幼犬、零记录 → 首免系列（第 1 针在 6~8 周龄窗口里）', () => {
    const birthday = dog(8);
    const view = build(birthday);
    expect(view.next!.kind).toBe('core');
    expect(view.next!.label).toBe('第 1 针');
    expect(view.next!.windowStart).toBe(toDateText(addWeeks(birthday, 6)));
    expect(view.next!.windowEnd).toBe(toDateText(addWeeks(birthday, 8)));
  });

  it('狂犬没有首免系列：12 周起首针 → 每年一次', () => {
    const birthday = dog(13);
    const view = build(birthday);
    const rabies = view.plan.find((step) => step.kind === 'rabies');
    expect(rabies!.label).toBe('首针');
    expect(rabies!.windowStart).toBe(toDateText(addWeeks(birthday, 12)));
    // 首针窗口 = 12 周龄起 30 天（指南"不早于 12 周" + 说明书常见的 30 天）
    expect(rabies!.windowEnd).toBe(
      toDateText(new Date(addWeeks(birthday, 12).getTime() + 30 * 86400000)),
    );
  });

  it('狂犬记不清就是没打过：一条记录都没有 → 现在打首针（逾期）', () => {
    const view = build(dog(320));
    const rabies = view.plan.find((step) => step.kind === 'rabies');
    expect(rabies!.label).toBe('首针');
    expect(rabies!.status).toBe('OVERDUE');
    expect(rabies!.missedWindowStart).toBeDefined();
  });

  it('钩端首免 2 针（间隔 2~4 周）→ 之后每年一次', () => {
    const birthday = dog(30);
    const view = build(birthday);
    const lepto = view.plan.filter((step) => step.kind === 'lepto');
    // 计划里只给"当前一步"（第 1 针）；第 2 针要等第 1 针打完
    expect(lepto.length).toBe(1);
    expect(lepto[0].label).toBe('第 1 针');
  });

  it('钩端上一针 20 个月前 → 重启（2 针），标"重启免疫"', () => {
    const birthday = dog(320);
    const last = addWeeks(TODAY, -87); // 约 20 个月前
    const steps = materializeSteps({
      birthday,
      records: [record('r1', '钩端螺旋体', last)],
      today: TODAY,
    });
    const restartOne = steps.find((step) => step.key === 'lepto-restart-1');
    const restartTwo = steps.find((step) => step.key === 'lepto-restart-2');
    expect(restartOne?.label).toBe('重启免疫 第 1 针');
    expect(restartTwo?.label).toBe('重启免疫 第 2 针');
    expect(toDateText(restartOne!.windowStart)).toBe(toDateText(TODAY));
  });

  it('钩端首免打完、上一针半年前 → 照常"每年一次"，不许乱加针', () => {
    const birthday = dog(320);
    const last = addWeeks(TODAY, -26);
    const steps = materializeSteps({
      birthday,
      records: [
        record('r1', '钩端螺旋体', addWeeks(birthday, 8)),
        record('r2', '钩端螺旋体', addWeeks(birthday, 12)),
        record('r3', '钩端螺旋体', last),
      ],
      today: TODAY,
    });
    expect(steps.some((step) => step.key.startsWith('lepto-restart'))).toBe(
      false,
    );
    const next = steps.find(
      (step) => step.kind === 'lepto' && step.windowStart > last,
    );
    expect(next?.label).toBe('每年一次');
    expect(toDateText(next!.windowStart)).toBe(toDateText(addYears(last, 1)));
  });

  it('狂犬年度加强 = 上一针 + 1 年 ~ +30 天（记录齐全的 3 岁犬）', () => {
    const birthday = dog(160);
    const lastRabies = addWeeks(TODAY, -47);
    const view = build(birthday, [record('r1', '狂犬疫苗', lastRabies)]);
    const rabies = view.plan.find((step) => step.kind === 'rabies');
    expect(rabies!.label).toBe('每年一次');
    expect(rabies!.windowStart).toBe(toDateText(addYears(lastRabies, 1)));
    expect(rabies!.windowEnd).toBe(
      toDateText(addYears(lastRabies, 1 + 0)).replace(/$/, '').length === 10
        ? toDateText(
            new Date(addYears(lastRabies, 1).getTime() + 30 * 86400000),
          )
        : '',
    );
  });
});

describe('引擎 · 匹配规则（需求第五节 + 技术方案 2.2）', () => {
  it('没核对过的记录不参与匹配，但计入 pendingReview', () => {
    const birthday = dog(20);
    const unverified = record('r1', '狂犬疫苗', addWeeks(birthday, 12), {
      productVerified: false,
    });
    const view = build(birthday, [unverified]);
    const rabies = view.plan.find((step) => step.kind === 'rabies');
    expect(rabies!.status).not.toBe('DONE');
    expect(view.pendingReview).toBe(1);
  });

  it('点过"我已对照本子核对"之后才算数', () => {
    const birthday = dog(20);
    const verified = record('r1', '狂犬疫苗', addWeeks(birthday, 12), {
      productVerified: true,
    });
    const steps = matchRecords(
      materializeSteps({ birthday, records: [verified], today: TODAY }),
      [verified],
      { today: TODAY },
    );
    expect(steps.find((step) => step.key === 'rabies-1')!.status).toBe('DONE');
    expect(build(birthday, [verified]).pendingReview).toBe(0);
  });

  it('归不出类别的记录不算数（kinds 为空 → 一条步骤都匹配不上）', () => {
    const birthday = dog(20);
    const unknown = record('r1', '拜宠清', addWeeks(birthday, 12));
    const view = build(birthday, [unknown]);
    expect(view.plan.every((step) => step.status !== 'DONE')).toBe(true);
  });

  it('一支组合苗可以同时顶两类（卫佳捌 = 核心 + 钩端）', () => {
    const birthday = dog(20);
    const combo = record('r1', '卫佳捌', addWeeks(birthday, 16));
    const steps = matchRecords(
      materializeSteps({ birthday, records: [combo], today: TODAY }),
      [combo],
      { today: TODAY },
    );
    const stepsDone = steps.filter((step) => step.status === 'DONE');
    expect(
      new Set(stepsDone.map((step) => step.kind)).size,
    ).toBeGreaterThanOrEqual(2);
  });

  it('细小单苗（卫佳细）顶不上核心首免 —— 记了也要继续提醒', () => {
    const birthday = dog(20);
    const single = record('r1', '卫佳细', addWeeks(birthday, 8));
    const view = build(birthday, [single]);
    const core = view.plan.find((step) => step.kind === 'core');
    expect(core!.status).not.toBe('DONE');
  });

  it('可选疫苗（犬窝咳）不进计划，也不顶任何一步', () => {
    const birthday = dog(60);
    const kennel = record('r1', '犬窝咳', addWeeks(birthday, 10));
    const view = build(birthday, [kennel]);
    expect(view.plan.some((step) => step.kind === 'other')).toBe(false);
    expect(view.plan.every((step) => step.status !== 'DONE')).toBe(true);
  });

  it('接种日在未来的记录不参与计划，并留一条"请核对"', () => {
    const birthday = dog(60);
    const future = record('r1', '狂犬疫苗', addWeeks(TODAY, 2));
    const view = build(birthday, [future]);
    const rabies = view.plan.find((step) => step.kind === 'rabies');
    expect(rabies!.status).not.toBe('DONE');
    const conflict = view.conflicts.find((item) => item.recordId === 'r1');
    expect(conflict?.reason).toContain('还没到');
  });

  it('事实优先于忽略：打了针就是已完成，哪怕之前点过"不做"', () => {
    const birthday = dog(20);
    const dose = record('r1', '狂犬疫苗', addWeeks(birthday, 12));
    const view = build(birthday, [dose], {
      decisions: { 'rabies-1': { decision: 'SKIP', reason: 'NOT_NOW' } },
    });
    const steps = matchRecords(
      materializeSteps({ birthday, records: [dose], today: TODAY }),
      [dose],
      {
        decisions: { 'rabies-1': { decision: 'SKIP', reason: 'NOT_NOW' } },
        today: TODAY,
      },
    );
    expect(steps.find((step) => step.key === 'rabies-1')!.status).toBe('DONE');
    expect(view.ignored.count).toBe(0);
  });
});

describe('引擎 · 忽略（需求 R5 / 冲突 A1）', () => {
  const birthday = dog(320); // 6 岁零记录 → 核心补一针 / 狂犬首针 / 钩端第 1 针

  it('SKIP 的步骤不下发，但 ignored.count 是**真实值**，reason 原样带出', () => {
    const view = build(birthday, [], {
      decisions: {
        'core-catchup': { decision: 'SKIP', reason: 'STOPPED' },
        'rabies-1': { decision: 'SKIP', reason: 'NOT_NOW' },
      },
    });
    expect(view.ignored.count).toBe(2);
    expect(view.ignored.items.map((item) => item.key).sort()).toEqual([
      'core-catchup',
      'rabies-1',
    ]);
    expect(
      view.ignored.items.find((item) => item.key === 'rabies-1')?.reason,
    ).toBe('NOT_NOW');
    expect(
      view.ignored.items.find((item) => item.key === 'core-catchup')?.kindLabel,
    ).toBe('核心疫苗（犬瘟、细小、腺病毒）');
    expect(view.plan.some((step) => step.key === 'core-catchup')).toBe(false);
    expect(view.plan.some((step) => step.key === 'rabies-1')).toBe(false);
  });

  it('三项都忽略 → next 为空、节奏那句话改成"已设为不做"（原型 K）', () => {
    const view = build(birthday, [], {
      decisions: {
        'core-catchup': { decision: 'SKIP', reason: 'STOPPED' },
        'rabies-1': { decision: 'SKIP', reason: 'STOPPED' },
        'lepto-primary-1': { decision: 'SKIP', reason: 'STOPPED' },
      },
    });
    expect(view.ignored.count).toBe(3);
    expect(view.next).toBeNull();
    expect(view.plan.every((step) => step.status === 'DONE')).toBe(true);
    expect(view.rhythm).toContain('已设为不做');
  });

  it('ACCEPT / DEFER 不影响下发（推迟不是不做）', () => {
    const view = build(birthday, [], {
      decisions: { 'rabies-1': { decision: 'DEFER' } },
    });
    expect(view.plan.some((step) => step.key === 'rabies-1')).toBe(true);
    expect(view.ignored.count).toBe(0);
  });
});

describe('引擎 · 抗体检测（需求 R9 / 技术方案 1.2）', () => {
  const birthday = dog(160);
  const rabies = record('r1', '狂犬疫苗', addWeeks(TODAY, -47));
  const core = record('r2', '卫佳伍', addWeeks(TODAY, -140));

  it('CORE 合格 → 核心那一针标"已完成（评估）"，下次评估 = nextReviewAt', () => {
    const view = build(birthday, [rabies, core], {
      antibodyTests: [
        {
          id: 't1',
          testedAt: toDateText(TODAY),
          targets: ['CORE'],
          result: 'PASS',
          nextReviewAt: toDateText(addYears(TODAY, 1)),
        },
      ],
    });
    const coreStep = view.plan.find((step) => step.kind === 'core');
    expect(coreStep!.status).toBe('DONE');
    expect(coreStep!.label).toBe('评估');
    expect(coreStep!.windowStart).toBe(toDateText(addYears(TODAY, 1)));
    expect(coreStep!.basis).toContain('抗体检测');
    // 狂犬与钩端不受影响
    expect(view.plan.find((step) => step.kind === 'rabies')!.status).not.toBe(
      'DONE',
    );
  });

  it('RABIES 合格 → 只记录，不影响计划', () => {
    const view = build(birthday, [rabies, core], {
      antibodyTests: [
        {
          id: 't1',
          testedAt: toDateText(TODAY),
          targets: ['RABIES'],
          result: 'PASS',
        },
      ],
    });
    expect(view.plan.find((step) => step.kind === 'rabies')!.status).not.toBe(
      'DONE',
    );
    expect(view.plan.find((step) => step.kind === 'core')!.label).not.toBe(
      '评估',
    );
  });

  it('结果不是 PASS（FAIL / UNKNOWN）→ 不影响计划', () => {
    for (const result of ['FAIL', 'UNKNOWN'] as const) {
      const view = build(birthday, [rabies, core], {
        antibodyTests: [
          { id: 't1', testedAt: toDateText(TODAY), targets: ['CORE'], result },
        ],
      });
      expect(view.plan.find((step) => step.kind === 'core')!.label).not.toBe(
        '评估',
      );
    }
  });

  it('20 周龄之前做的抗体检测不算数，并报一条冲突（指南：20 周龄以上才指示保护）', () => {
    const youngBirthday = dog(18);
    const view = build(youngBirthday, [], {
      antibodyTests: [
        {
          id: 't1',
          testedAt: toDateText(addWeeks(youngBirthday, 17)),
          targets: ['CORE'],
          result: 'PASS',
        },
      ],
    });
    expect(view.plan.find((step) => step.kind === 'core')!.label).not.toBe(
      '评估',
    );
    expect(view.conflicts.some((item) => item.recordId === 't1')).toBe(true);
  });

  it('检测日早于最后一次核心接种 → 旧证据不算数', () => {
    const tested = addWeeks(TODAY, -100);
    const laterDose = record('r3', '卫佳伍', addWeeks(TODAY, -50));
    const view = build(birthday, [rabies, core, laterDose], {
      antibodyTests: [
        {
          id: 't1',
          testedAt: toDateText(tested),
          targets: ['CORE'],
          result: 'PASS',
        },
      ],
    });
    expect(view.plan.find((step) => step.kind === 'core')!.label).not.toBe(
      '评估',
    );
  });
});

describe('引擎 · 冲突提示（需求 R13 / R15 / 冲突 A7）', () => {
  it('核心苗打在 4 周龄之前 → 提示（含"是否计数交给兽医"）', () => {
    const birthday = dog(20);
    const tooEarly = record('r1', '卫佳伍', addWeeks(birthday, 3));
    const view = build(birthday, [tooEarly]);
    const conflict = view.conflicts.find((item) => item.recordId === 'r1');
    expect(conflict?.reason).toContain('4 周龄之前');
    expect(conflict?.suggestion).toContain('兽医');
  });

  it('正好 4 周龄那一针不报"过早"（指南里的正规产品就从 4 周起）', () => {
    const birthday = dog(20);
    const early = record('r1', '卫佳伍', addWeeks(birthday, 4));
    const view = build(birthday, [early]);
    expect(view.conflicts.some((item) => item.recordId === 'r1')).toBe(false);
  });

  it('接种日早于生日 → 说"比生日还早"（多半是年份写错）', () => {
    const birthday = dog(20);
    const before = record('r1', '卫佳伍', addWeeks(birthday, -1));
    const view = build(birthday, [before]);
    const conflict = view.conflicts.find((item) => item.recordId === 'r1');
    expect(conflict?.reason).toContain('比狗狗生日还早');
  });

  it('狂犬两针间隔不足一年 → 提示（11 个月也要报）', () => {
    const birthday = dog(160);
    const first = record('r1', '狂犬疫苗', addWeeks(TODAY, -59));
    const second = record('r2', '狂犬疫苗', addWeeks(TODAY, -11));
    const view = build(birthday, [first, second]);
    const conflict = view.conflicts.find((item) => item.recordId === 'r2');
    expect(conflict?.reason).toContain('短于一年');
  });

  it('冲突的 kind 按记录自己的归类填（不再硬编码）', () => {
    const birthday = dog(160);
    const first = record('r1', '狂犬疫苗', addWeeks(TODAY, -59));
    const second = record('r2', '狂犬疫苗', addWeeks(TODAY, -11));
    const view = build(birthday, [first, second]);
    expect(view.conflicts.find((item) => item.recordId === 'r2')?.kind).toBe(
      'rabies',
    );
  });

  it('措辞里不出现"必须""立刻"（需求 R14）', () => {
    const birthday = dog(20);
    const tooEarly = record('r1', '卫佳伍', addWeeks(birthday, 3));
    const view = build(birthday, [tooEarly]);
    for (const conflict of view.conflicts) {
      expect(conflict.reason).not.toContain('必须');
      expect(conflict.suggestion).not.toContain('必须');
      expect(conflict.suggestion).not.toContain('立刻');
    }
  });

  it('没有记录时不会凭空造出冲突', () => {
    expect(build(dog(320)).conflicts).toEqual([]);
  });
});

describe('引擎 · 安全边界', () => {
  it('没有出生日期 → 返回空计划而不是报错', () => {
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: '',
      records: [],
      today: TODAY,
    });
    expect(view.plan).toEqual([]);
    expect(view.next).toBeNull();
    expect(view.ageWeeks).toBeNull();
  });

  it('一条记录都没有 → noRecordAtAll 为真（界面据此换措辞）', () => {
    expect(build(dog(20)).noRecordAtAll).toBe(true);
    expect(
      build(dog(20), [record('r1', '狂犬疫苗', addWeeks(TODAY, -1))])
        .noRecordAtAll,
    ).toBe(false);
  });

  it('每一条依据都写明出处（顾客和审核的人都要能查）', () => {
    const view = build(dog(8));
    for (const step of view.plan) {
      expect(String(step.basis || '').length).toBeGreaterThan(10);
    }
  });

  it('`plan` 由后端按时间从近到远排好（前端不再排序）', () => {
    const view = build(dog(8));
    const starts = view.plan.map((step) => step.windowStart);
    expect([...starts].sort()).toEqual(starts);
  });

  it('pickNext：逾期 → 到窗口 → 未来，同级取窗口最早的', () => {
    const steps = matchRecords(
      materializeSteps({ birthday: dog(320), records: [], today: TODAY }),
      [],
      { today: TODAY },
    );
    const next = pickNext(steps);
    expect(next?.status).toBe('OVERDUE');
    expect(next?.kind).toBe('core');
  });
});

describe('引擎 · 常见产品（兽医审核意见第 5、6 条）', () => {
  it('每一步的"常见的有…"最多 3 个，且一个国产苗都不出现', () => {
    const view = build(dog(8));
    for (const step of view.plan) {
      expect(step.products.length).toBeLessThanOrEqual(3);
    }
    const all = view.plan.flatMap((step) => step.products);
    expect(all).not.toContain('犬四联（中牧江西）');
  });

  it('狂犬那一步只推狂犬苗', () => {
    const view = build(dog(13));
    const rabies = view.plan.find((step) => step.kind === 'rabies');
    expect(rabies!.products.length).toBeGreaterThan(0);
    expect(rabies!.products).toContain('宠必威锐必威');
  });

  it('antibody 替代掉的那一行不再推产品（推了会误导）', () => {
    const birthday = dog(160);
    const view = build(
      birthday,
      [
        record('r1', '狂犬疫苗', addWeeks(TODAY, -47)),
        record('r2', '卫佳伍', addWeeks(TODAY, -140)),
      ],
      {
        antibodyTests: [
          {
            id: 't1',
            testedAt: toDateText(TODAY),
            targets: ['CORE'],
            result: 'PASS',
            nextReviewAt: toDateText(addYears(TODAY, 1)),
          },
        ],
      },
    );
    const coreStep = view.plan.find((step) => step.kind === 'core');
    expect(coreStep!.products).toEqual([]);
  });
});

describe('引擎 · 合并接种（需求 R11 / 冲突 A5）', () => {
  it('两类窗口真的重叠、且有一支同时含两类的苗 → 给出 combo', () => {
    const birthday = dog(8);
    const view = build(birthday);
    const core = view.plan.find((step) => step.kind === 'core');
    const lepto = view.plan.find((step) => step.kind === 'lepto');
    const combos = [core, lepto].filter((step) => step?.combo);
    expect(combos.length).toBeGreaterThan(0);
    expect(combos[0]!.combo!.products.length).toBeGreaterThan(0);
    expect(combos[0]!.combo!.hint).toContain('一起打');
  });

  it('产品列表**不截断**（同时覆盖核心+钩端的 4 支苗一支都不能少）', () => {
    const birthday = dog(8);
    const view = build(birthday);
    const withCombo = view.plan.find((step) => step.combo)?.combo;
    expect(withCombo!.products.length).toBeGreaterThan(3);
  });

  it('窗口不重叠 → 不给 combo（哪怕产品能覆盖这两类）', () => {
    // 只记过核心的成年犬：核心下一次在 3 年后，与钩端不重叠
    const birthday = dog(60);
    const view = build(birthday);
    const core = view.plan.find((step) => step.kind === 'core');
    const lepto = view.plan.find((step) => step.kind === 'lepto');
    if (core && lepto) {
      const overlap =
        core.windowStart <= lepto.windowEnd &&
        lepto.windowStart <= core.windowEnd;
      if (!overlap) {
        expect(core.combo ?? null).toBeNull();
      }
    }
  });

  it('每步最多一个 combo', () => {
    const view = build(dog(8));
    // 类型上只有一个；这里再确认它不会把同一类重复列出来
    for (const step of view.plan) {
      if (step.combo) {
        expect(step.combo.withKind).not.toBe(step.kind);
      }
    }
  });
});

describe('引擎 · 补一针的窗口宽度沿用"那一针原本的窗口"', () => {
  it('零记录成年犬：补一针的窗口宽度 = 首针窗口宽度（2 周）', () => {
    const birthday = dog(320);
    const view = build(birthday);
    const catchUp = view.plan.find((step) => step.label === '补一针');
    const width =
      (new Date(catchUp!.windowEnd).getTime() -
        new Date(catchUp!.windowStart).getTime()) /
      86400000;
    expect(width).toBe(CORE_SCHEDULE.firstWindowWeeks * 7);
  });
});

describe('引擎 · 「不再接种了」是长期决定（需求 R5 验收：忽略后不再催）', () => {
  /**
   * 两个选项在**当天**看不出区别（都只是不再催当前那一步）；
   * 差别要等下一针的窗口到了才见分晓 —— 所以这两条用例都把时间往前推一年。
   */
  const birthday = dog(160);
  const rabiesDone = record('r1', '狂犬疫苗', addWeeks(birthday, 14));
  const aYearLater = addYears(TODAY, 1);

  const rabiesPending = (view: ReturnType<typeof build>) =>
    view.plan.filter((step) => step.kind === 'rabies' && step.status !== 'DONE');

  it('STOPPED → 一年后那一针也不再来催（这一类长期安静）', () => {
    const first = build(birthday, [rabiesDone]);
    const nextRabies = first.plan.find(
      (step) => step.kind === 'rabies' && step.status !== 'DONE',
    )!;
    expect(nextRabies).toBeDefined();

    const later = build(birthday, [rabiesDone], {
      today: aYearLater,
      decisions: { [nextRabies.key]: { decision: 'SKIP', reason: 'STOPPED' } },
    });

    expect(rabiesPending(later)).toHaveLength(0);
  });

  it('NOT_NOW → 只跳过当时那一步；一年后该来的还会来', () => {
    const first = build(birthday, [rabiesDone]);
    const nextRabies = first.plan.find(
      (step) => step.kind === 'rabies' && step.status !== 'DONE',
    )!;

    const later = build(birthday, [rabiesDone], {
      today: aYearLater,
      decisions: { [nextRabies.key]: { decision: 'SKIP', reason: 'NOT_NOW' } },
    });

    // 被跳过的还是那一步；但新的一针（下一年）照常提醒
    expect(rabiesPending(later)).toHaveLength(1);
    expect(rabiesPending(later)[0].key).not.toBe(nextRabies.key);
  });
});

describe('引擎 · 抗体检测替代那一针（原型 F）', () => {
  it('替代后：短话换成"这次不用打…"，并带上 titer（时间含义变成下次评估）', () => {
    const birthday = dog(60); // 60 周龄
    const coreRecord = record('c1', '卫佳伍', addWeeks(birthday, 30));
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: toDateText(birthday),
      records: [coreRecord],
      antibodyTests: [
        {
          id: 't1',
          testedAt: '2026-10-15',
          targets: ['CORE'],
          result: 'PASS',
          // ⚠️ 用项目的 toDateText（本地时区），别用 toISOString().slice(0,10)
          //    —— 东八区会整体差一天（这个项目踩过）
          nextReviewAt: toDateText(addYears(new Date('2026-10-15T00:00:00'), 1)),
        },
      ],
      today: TODAY,
    });

    const covered = view.plan.find((step) => step.key.includes('core'));
    expect(covered).toBeDefined();
    // ⚠️ 这条最容易漏：换了 basis 忘了换 hint，界面上就会继续写"幼犬从 6~8 周开始…"
    expect(covered!.hint).toContain('抗体检测合格');
    expect(covered!.hint).not.toContain('6~8 周');
    expect(covered!.titer).toBeDefined();
    expect(covered!.titer!.testedAt).toBe('2026-10-15');
    /**
     * ⚠️ 2026-10-17 老板定：抗体合格**改成 1 年后复查**（原来是从疫苗免疫期平移来的 3 年）——
     * 指南里没有"抗体管几年"的说法，宁可复查勤一点也不漏掉。
     */
    expect(covered!.titer!.nextReviewAt).toBe('2027-10-15');
    expect(view.rhythm).toContain('每年复查抗体')
  });
});

describe('引擎 · 抗体检测那条路的年龄下限（需求 R9：20 周龄之前不做）', () => {
  it('2 周龄的幼犬 → 卡片上**不该出现**「先做抗体检测」', () => {
    const view = build(dog(2));
    expect(view.next).not.toBeNull();
    expect(view.next!.titerable).toBe(false);
  });

  it('6 周龄、20 周龄这两个边界也照这条判', () => {
    expect(build(dog(6)).next!.titerable).toBe(false);
    // 20 周龄已经可以测（判据是"这一步窗口开始时满 20 周"）
    expect(build(dog(30)).next!.titerable).toBe(true);
  });

  it('成年犬照样能给这条路（不要一刀切关掉）', () => {
    const view = build(dog(200));
    expect(view.next!.titerable).toBe(true);
  });
});

describe('引擎 · 抗体检测的第二个条件：最后一针之后至少 4 周（需求 R9 依据栏）', () => {
  const birthday = dog(60);
  const lastDose = addWeeks(birthday, 30);
  const coreRecord = record('c1', '卫佳伍', lastDose);
  const buildWithTest = (testedAt: Date) =>
    buildPlanView({
      dogId: 'dog-1',
      birthday: toDateText(birthday),
      records: [coreRecord],
      antibodyTests: [
        {
          id: 't1',
          testedAt: toDateText(testedAt),
          targets: ['CORE'],
          result: 'PASS',
          nextReviewAt: toDateText(addYears(testedAt, 1)),
        },
      ],
      today: new Date(
        Math.max(TODAY.getTime(), addDays(testedAt, 1).getTime()),
      ),
    });

  it('打完针第 3 天就测 → **不算**（拿刚打进去的抗体证明不用打这一针，自相矛盾）', () => {
    const view = buildWithTest(addDays(lastDose, 3));
    expect(view.plan.some((step) => step.titer)) .toBe(false);
  });

  it('打完针第 27 天测 → 也还不算（差一天）', () => {
    const view = buildWithTest(addDays(lastDose, 27));
    expect(view.plan.some((step) => step.titer)).toBe(false);
  });

  it('打完针满 28 天测 → 算数，且下一次评估 = 检测日 + 1 年', () => {
    const testedAt = addDays(lastDose, 28);
    const view = buildWithTest(testedAt);
    const covered = view.plan.find((step) => step.titer);
    expect(covered).toBeDefined();
    expect(covered!.titer!.testedAt).toBe(toDateText(testedAt));
    expect(covered!.titer!.nextReviewAt).toBe(toDateText(addYears(testedAt, 1)));
  });
});

describe('引擎 · 抗体检测不作数时要**说清为什么**（不然家长以为记了没反应）', () => {
  const birthday = dog(60);
  const lastDose = addWeeks(birthday, 30);
  const coreRecord = record('c1', '卫佳伍', lastDose);
  const buildWithTest = (testedAt: Date) =>
    buildPlanView({
      dogId: 'dog-1',
      birthday: toDateText(birthday),
      records: [coreRecord],
      antibodyTests: [
        {
          id: 't1',
          testedAt: toDateText(testedAt),
          targets: ['CORE'],
          result: 'PASS',
          nextReviewAt: toDateText(addYears(testedAt, 1)),
        },
      ],
      today: new Date(Math.max(TODAY.getTime(), addDays(testedAt, 1).getTime())),
    });

  it('离上一针不满 4 周 → 报一条冲突，并说明"刚打完测到的是那一针的抗体"', () => {
    const view = buildWithTest(addDays(lastDose, 3));
    const conflict = view.conflicts.find((item) =>
      String(item.reason).includes('不满 4 周'),
    );
    expect(conflict).toBeDefined();
    expect(String(conflict!.suggestion)).toContain('满 4 周后复查');
  });

  it('满 4 周 → 不再报这条冲突', () => {
    const view = buildWithTest(addDays(lastDose, 28));
    expect(
      view.conflicts.some((item) => String(item.reason).includes('不满 4 周')),
    ).toBe(false);
  });
});

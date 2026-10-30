import {
  buildPlanView,
  materializeSteps,
  matchRecords,
  type VaccineRecordLike,
} from '../../../../src/domain/health/vaccine/engine';
import { classifyVaccineKinds } from '../../../../src/domain/health/vaccine/products';

/**
 * 原型 A~K · 11 个场景变成 11 组断言（技术方案 5.2）。
 *
 * 输入取自 `docs/prototypes/2026-10-15-vaccine-tab-prototype.html`：
 * 参考日 **2026-10-15**、6 周幼犬的生日 **2026-08-30**，
 * 期望输出对齐原型上写的 `next` / 计划顺序与状态 / `ignored.count`
 * （窗口里的日期都是原型上印着的真值）。
 *
 * ⚠️ D / E / H 三屏是**录入侧**的画面，所以那三组断言钉的是"后端怎么认这条记录"：
 *    · D 只写"六联" + 日期 → 归得出类别、进得了计划
 *    · E 识别结果只有名称 + 日期，狂犬要"待核对"（不算进计划）
 *    · H 一支同时含两类的联苗 → 一次记完，两类同时完成
 */

const TODAY = new Date('2026-10-15T00:00:00');

const build = (
  birthday: string,
  records: VaccineRecordLike[] = [],
  extra: Record<string, unknown> = {},
) =>
  buildPlanView({ dogId: 'dog-1', birthday, records, today: TODAY, ...extra });

const rec = (
  id: string,
  name: string,
  date: string,
  extra: Partial<VaccineRecordLike> = {},
): VaccineRecordLike => ({
  id,
  vaccineName: name,
  vaccinationDate: date,
  ...extra,
});

const labels = (plan: ReturnType<typeof build>['plan']) =>
  plan.map((step) => `${step.kindLabel} · ${step.label}`);

describe('原型 A · 6 周幼犬，没打过（生日 2026-08-30）', () => {
  const view = build('2026-08-30');

  it('下一针 = 核心疫苗 · 第 1 针 · 10/11 ~ 10/25', () => {
    expect(view.next).not.toBeNull();
    expect(view.next!.kindLabel).toBe('核心疫苗（犬瘟、细小、腺病毒）');
    expect(view.next!.label).toBe('第 1 针');
    expect(view.next!.windowStart).toBe('2026-10-11');
    expect(view.next!.windowEnd).toBe('2026-10-25');
    expect(view.next!.statusLabel).toBe('待接种');
    expect(view.next!.layer).toBe('MUST');
  });

  it('计划按时间排：4 针首免 + 狂犬首针 + 26 周补强（原型上印着的 7 行）', () => {
    expect(
      view.plan.map((step) => [step.label, step.windowStart, step.windowEnd]),
    ).toEqual([
      ['第 1 针', '2026-10-11', '2026-10-25'],
      ['第 2 针', '2026-10-25', '2026-11-08'],
      ['第 1 针', '2026-10-25', '2026-11-22'], // 钩端（强烈建议）
      ['第 3 针', '2026-11-22', '2026-12-06'],
      ['首针', '2026-11-22', '2026-12-22'], // 狂犬
      ['第 4 针', '2026-12-20', '2027-01-03'],
      ['26 周补强', '2027-02-28', '2027-03-28'],
    ]);
    // 声明的顺序 = 时间顺序（后端已经排好，前端不再排）
    const starts = view.plan.map((step) => step.windowStart);
    expect([...starts].sort()).toEqual(starts);
  });

  it('节奏那一句话 + 没有忽略项', () => {
    expect(view.rhythm).toBe('之后：狂犬与钩端每年一次，核心疫苗每 3 年一次');
    expect(view.ignored.count).toBe(0);
    expect(view.noRecordAtAll).toBe(true);
    expect(view.ageWeeks).toBe(6);
  });
});

describe('原型 B · 6 岁，一条记录都没有（生日 2020-08-30）', () => {
  const view = build('2020-08-30');

  it('下一针 = 核心疫苗 · 补一针 · 尽快补种（**绝不出现"第一针"**）', () => {
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

  it('三件事都能在同一趟办完：核心补一针 + 狂犬首针 + 钩端第 1 针', () => {
    expect(labels(view.plan)).toEqual([
      '核心疫苗（犬瘟、细小、腺病毒） · 补一针',
      '狂犬疫苗 · 首针',
      '钩端螺旋体 · 第 1 针',
    ]);
    expect(view.plan.every((step) => step.status === 'OVERDUE')).toBe(true);
  });
});

describe('原型 C · 3 岁，记录齐全（生日 2023-08-30）', () => {
  const view = build('2023-08-30', [
    rec('r1', '狂犬疫苗', '2025-11-20'),
    rec('r2', '卫佳伍', '2024-01-15'),
    rec('r3', '钩端螺旋体', '2023-11-20'),
    rec('r4', '钩端螺旋体', '2023-12-10'),
    rec('r5', '钩端螺旋体', '2026-03-10'),
    rec('r8', '钩端螺旋体', '2026-04-01'),
    rec('r6', '卫佳伍', '2023-10-20'),
    rec('r7', '卫佳伍', '2024-03-01'),
  ]);

  it('下一针 = 狂犬 · 年度加强 · 2026/11/20 ~ 12/20（上一次 2025/11/20）', () => {
    expect(view.next!.kind).toBe('rabies');
    expect(view.next!.label).toBe('每年一次');
    expect(view.next!.windowStart).toBe('2026-11-20');
    expect(view.next!.windowEnd).toBe('2026-12-20');
    expect(view.next!.status).toBe('UPCOMING');
  });

  it('每类各给"下一次"：核心 2027/03/01（+3 年）、钩端 2027/03/10（+1 年）', () => {
    const rows = view.plan.map((step) => [
      step.kind,
      step.label,
      step.windowStart,
    ]);
    expect(rows).toContainEqual(['core', '加强（每 3 年）', '2027-03-01']);
    expect(rows).toContainEqual(['lepto', '每年一次', '2027-04-01']);
    expect(view.rhythm).toBe('之后：狂犬与钩端每年一次，核心疫苗每 3 年一次');
  });
});

describe('原型 D · 手动记一条（最短路径：只写名称 + 日期）', () => {
  it('产品库里的名字（卫佳伍）能归类；六联要补成分', () => {
    expect(classifyVaccineKinds('六联')).not.toContain('core');
    expect(classifyVaccineKinds('卫佳伍')).toContain('core');
  });

  it('写下"卫佳伍 + 日期"就落到核心首免那一步上', () => {
    const birthday = '2026-08-30';
    const dose = rec('r1', '卫佳伍', '2026-10-12');
    const steps = matchRecords(
      materializeSteps({
        birthday: new Date(`${birthday}T00:00:00`),
        records: [dose],
        today: TODAY,
      }),
      [dose],
      { today: TODAY },
    );
    expect(steps.find((step) => step.key === 'core-puppy-1')!.status).toBe(
      'DONE',
    );

    // 打完第 1 针，核心的"当前一步"就往后滚到"上一针 +2~4 周"
    const view = build(birthday, [dose]);
    const core = view.plan.find((step) => step.kind === 'core');
    expect(core!.label).toBe('第 2 针');
    expect(core!.windowStart).toBe('2026-10-26');
    expect(core!.windowEnd).toBe('2026-11-09');
  });
});

describe('原型 E · 拍疫苗本 → 逐条确认（只有名称 + 日期）', () => {
  it('狂犬那一针"待核对"时不算进计划，并计入 pendingReview', () => {
    const view = build('2023-08-30', [
      rec('r1', '狂犬疫苗', '2026-10-01', { productVerified: false }),
    ]);
    expect(view.pendingReview).toBe(1);
    expect(view.plan.find((step) => step.kind === 'rabies')!.status).not.toBe(
      'DONE',
    );
  });

  it('核对通过之后立刻算数（狂犬首针变已完成）', () => {
    const view = build('2023-08-30', [
      rec('r1', '狂犬疫苗', '2026-10-01', { productVerified: true }),
    ]);
    expect(view.pendingReview).toBe(0);
    // 3 岁的狗、2026-10-01 打了狂犬 → 下一次是 2027-10-01
    const rabies = view.plan.find((step) => step.kind === 'rabies');
    expect(rabies!.windowStart).toBe('2027-10-01');
  });
});

describe('原型 F · 录了抗体检测之后（同一只 3 岁的狗）', () => {
  const view = build(
    '2023-08-30',
    [
      rec('r1', '狂犬疫苗', '2025-11-20'),
      rec('r2', '卫佳伍', '2024-01-15'),
      rec('r3', '钩端螺旋体', '2023-11-20'),
      rec('r4', '钩端螺旋体', '2023-12-10'),
      rec('r5', '钩端螺旋体', '2026-03-10'),
      rec('r6', '钩端螺旋体', '2026-04-01'),
    ],
    {
      antibodyTests: [
        {
          id: 't1',
          testedAt: '2026-10-15',
          targets: ['CORE'],
          result: 'PASS',
          nextReviewAt: '2027-10-15',
        },
      ],
    },
  );

  it('核心那一针变成"评估"：这次不用打、下次评估 2027/10/15', () => {
    const core = view.plan.find((step) => step.kind === 'core');
    expect(core!.label).toBe('评估');
    expect(core!.status).toBe('DONE');
    expect(core!.windowStart).toBe('2027-10-15');
    expect(core!.basis).toContain('抗体检测');
  });

  it('狂犬与钩端不受影响；节奏那句话改成"核心疫苗每年复查抗体"', () => {
    expect(view.plan.find((step) => step.kind === 'rabies')!.windowStart).toBe(
      '2026-11-20',
    );
    expect(view.plan.find((step) => step.kind === 'lepto')!.windowStart).toBe(
      '2027-04-01',
    );
    expect(view.rhythm).toBe(
      '之后：狂犬与钩端每年一次，核心疫苗每年复查抗体',
    );
  });
});

describe('原型 G · 点开"下一针"（依据 / 常见产品 / 两针一起打）', () => {
  const view = build('2023-08-30', [
    rec('r1', '狂犬疫苗', '2025-11-20'),
    rec('r2', '卫佳伍', '2024-01-15'),
    rec('r3', '钩端螺旋体', '2023-11-20'),
    rec('r4', '钩端螺旋体', '2023-12-10'),
    rec('r5', '钩端螺旋体', '2026-03-10'),
    rec('r7', '钩端螺旋体', '2026-04-01'),
    rec('r6', '卫佳伍', '2024-03-01'),
  ]);

  it('每一步都能给出依据与常见产品（抗体检测那一项标 titerable）', () => {
    for (const step of view.plan) {
      expect(String(step.basis || '').length).toBeGreaterThan(10);
    }
    const core = view.plan.find((step) => step.kind === 'core');
    expect(core!.titerable).toBe(true);
    expect(view.plan.find((step) => step.kind === 'rabies')!.titerable).toBe(
      false,
    );
    expect(view.plan.find((step) => step.kind === 'lepto')!.titerable).toBe(
      false,
    );
  });

  it('两类窗口重叠时给出"可以和 X 一起打"和联苗', () => {
    const withCombo = view.plan.find((step) => step.combo);
    expect(withCombo).toBeDefined();
    expect(withCombo!.combo!.hint).toContain('一起打');
    expect(withCombo!.combo!.windowStart <= withCombo!.combo!.windowEnd).toBe(
      true,
    );
  });

  it('选择"先做抗体检测"这条路：核心那一项带 titerable（前端据此显示入口）', () => {
    expect(view.plan.find((step) => step.kind === 'core')!.titerable).toBe(
      true,
    );
  });
});

describe('原型 H · 记录这一针（一支联苗一次记完）', () => {
  it('卫佳捌（核心 + 钩端）一次让两类都完成', () => {
    const birthday = '2023-08-30';
    const view = build(birthday, [
      rec('r1', '卫佳捌', '2026-10-15'),
      rec('r2', '狂犬疫苗', '2025-11-20'),
    ]);
    // 钩端：首免那两针已经打过（这一针卫佳捌算首免第 1 针）
    const leptoSteps = view.plan.filter((step) => step.kind === 'lepto');
    expect(leptoSteps.length).toBeGreaterThan(0);
    /**
     * 成年犬补一针已打过 → 核心下一次 = 那一针 + 3 年 = 2029/10/15。
     * ⚠️ 这个 3 年是**核心疫苗本身的加强周期**（WSAVA：此后不高于每 3 年一次），
     *    与"抗体复查 1 年"是两回事 —— 2026-10-17 改口径时我一度把这里也误改成 1 年 ✗，
     *    被这条断言挡回来了 ✓ 别动它。
     */
    const core = view.plan.find((step) => step.kind === 'core');
    expect(core!.windowStart).toBe('2029-10-15');
  });
});

describe('原型 I · 狂犬过期两年（生日 2023-08-30，上一针 2024-08-01）', () => {
  const view = build('2023-08-30', [rec('r1', '狂犬疫苗', '2024-08-01')]);

  it('下一针 = 狂犬 · 每年一次 · 尽快补种；原建议时间 2025/08/01 ~ 08/31 已过', () => {
    expect(view.next!.kind).toBe('rabies');
    expect(view.next!.label).toBe('每年一次');
    expect(view.next!.status).toBe('OVERDUE');
    expect(view.next!.statusLabel).toBe('尽快补种');
    expect(view.next!.windowStart).toBe('2025-08-01');
    expect(view.next!.windowEnd).toBe('2025-08-31');
  });
});

describe('原型 J · 点「忽略」之后（问一句原因）', () => {
  it('忽略狂犬年度加强 → 它从计划里消失，ignored.count = 1，reason 带出来', () => {
    const base = build('2023-08-30', [rec('r1', '狂犬疫苗', '2024-08-01')]);
    const rabiesKey = base.plan.find((step) => step.kind === 'rabies')!.key;
    const view = build('2023-08-30', [rec('r1', '狂犬疫苗', '2024-08-01')], {
      decisions: { [rabiesKey]: { decision: 'SKIP', reason: 'STOPPED' } },
    });
    expect(view.ignored.count).toBe(1);
    expect(view.ignored.items[0]).toMatchObject({
      key: rabiesKey,
      kindLabel: '狂犬疫苗',
      label: '每年一次',
      reason: 'STOPPED',
    });
    expect(view.plan.some((step) => step.key === rabiesKey)).toBe(false);
    // 不再催它
    expect(view.next?.kind).not.toBe('rabies');
  });
});

describe('原型 K · 把该做的都设为不做之后（12 岁）', () => {
  const birthday = '2014-08-30';
  const records = [
    rec('r1', '狂犬疫苗', '2025-06-02'),
    rec('r2', '卫佳伍', '2024-04-18'),
  ];

  it('三项都忽略 → 暂无需要接种的项目，且 ignored.count = 3', () => {
    const base = build(birthday, records);
    const decisions = Object.fromEntries(
      base.plan
        .filter((step) => step.status !== 'DONE')
        .map((step) => [step.key, { decision: 'SKIP', reason: 'STOPPED' }]),
    );
    const view = build(birthday, records, { decisions });

    expect(view.ignored.count).toBe(3);
    expect(view.next).toBeNull();
    expect(view.plan.every((step) => step.status === 'DONE')).toBe(true);
    expect(view.rhythm).toBe('已设为不做的项目，可以在上面那一行点开');
  });

  it('恢复（清掉决定）之后计划照旧回来', () => {
    const view = build(birthday, records);
    expect(view.next).not.toBeNull();
    expect(view.ignored.count).toBe(0);
  });
});

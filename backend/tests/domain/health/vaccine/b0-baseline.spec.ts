import {
  buildPlanView,
  type VaccinePlanView,
} from '../../../../src/domain/health/vaccine/engine';
import { classifyRecordKinds } from '../../../../src/domain/health/vaccine/products';

/**
 * B0 · 现状基线（2026-10-28）
 *
 * ⚠️ **这个文件断言的是"现在会怎样"，不是"应该怎样"。**
 * 它的作用是给 B1–B4 的修复立一个"改前照片"：
 *   · 现在全绿 = 现状被钉住了；
 *   · 修完以后某条变红 = 提醒你"这条行为变了"，请把断言**翻成期望行为**（不是直接删）。
 *
 * 7 个案例对应审核报告的可视化页（2026-10-28-vaccine-schedule-cases.html）：
 *   V1 抗体过期 / V2 26 周补强消失 / V3 抗体不合格 / V4 单苗算核心 /
 *   V5 钩端旧第 2 针 / V10 太早记录无解释 / V11 抗体替代两行。
 *
 * 修复顺序：B1（V1/V3/V11）→ B2（V2）→ B3（V4/V10）→ B4（V5）。
 */

const TODAY = new Date('2026-10-28T00:00:00');

const rec = (
  id: string,
  name: string,
  date: string,
  extra: Record<string, unknown> = {},
) => ({ id, vaccineName: name, vaccinationDate: date, ...extra });

const build = (
  birthday: string,
  records: ReturnType<typeof rec>[] = [],
  extra: Record<string, unknown> = {},
): VaccinePlanView =>
  buildPlanView({
    dogId: 'b0-dog',
    birthday,
    records,
    today: TODAY,
    ...extra,
  });

const coreSteps = (view: VaccinePlanView) =>
  view.plan.filter((step) => step.kind === 'core');

describe('B0 · 现状基线（断言的是当前行为，修复时请翻成期望行为）', () => {
  it('V1：抗体合格过期后，核心仍停在“已完成”，不再进入下一针', () => {
    const view = build('2023-01-01', [rec('a', '卫佳伍', '2023-04-01')], {
      antibodyTests: [
        { id: 't', testedAt: '2024-05-01', targets: ['CORE'], result: 'PASS' },
      ],
    });

    const core = coreSteps(view)[0];
    expect(core).toBeDefined();
    // 现状：复查日 2025-05-01 早就过了，但状态还是 DONE / 已完成
    expect(core.status).toBe('DONE');
    expect(core.label).toBe('评估');
    expect(core.titer?.nextReviewAt).toBe('2025-05-01');
    expect(core.windowStart).toBe('2025-05-01');
    // 现状：下一针是狂犬，核心从此不再出现
    expect(view.next?.kind).toBe('rabies');
    expect(view.rhythm).toContain('核心疫苗每年复查抗体');
  });

  it('V2：16 周打完首免、没打 26 周补强，满 1 岁后补强被静默取消', () => {
    const view = build('2025-09-01', [
      rec('a', '卫佳伍', '2025-11-01'),
      rec('b', '卫佳伍', '2025-12-01'),
      rec('c', '卫佳伍', '2025-12-22'),
    ]);

    // 现状：计划里根本没有 26 周补强
    expect(view.plan.some((step) => step.key === 'core-26w')).toBe(false);
    const core = coreSteps(view)[0];
    expect(core.label).toBe('加强（每 3 年）');
    // 现状：下一次核心要等到 2028-12-22（最后一针 + 3 年）
    expect(core.windowStart).toBe('2028-12-22');
  });

  it('V3：抗体“不合格”被静默忽略，核心仍按 2027 年到期', () => {
    const view = build(
      '2024-01-01',
      [
        rec('a', '卫佳伍', '2024-03-20'),
        rec('b', '卫佳伍', '2024-04-20'),
        rec('c', '卫佳伍', '2024-05-10'),
        rec('d', '卫佳伍', '2024-05-24'),
      ],
      {
        antibodyTests: [
          { id: 't', testedAt: '2026-09-01', targets: ['CORE'], result: 'FAIL' },
        ],
      },
    );

    const core = coreSteps(view)[0];
    expect(core.label).toBe('加强（每 3 年）');
    expect(core.windowStart).toBe('2027-05-24');
    // 现状：没有任何冲突/提示
    expect(view.conflicts).toHaveLength(0);
    expect(view.plan.some((step) => step.label.includes('补一针'))).toBe(false);
  });

  it('V4：单病种“细小单苗”被当成完整核心一针', () => {
    // 归类层面：只含细小的自由文本，现在会归成 core
    expect(classifyRecordKinds({ vaccineName: '细小单苗' })).toEqual(['core']);

    // 这个案例的“今天”是打完针的第二天（2026-06-27），不是基线默认的 10-28
    const view = buildPlanView({
      dogId: 'b0-dog',
      birthday: '2026-05-01',
      records: [rec('a', '细小单苗', '2026-06-26')],
      today: new Date('2026-06-27T00:00:00'),
    });
    // 现状：核心第 1 针被算完成，计划直接从第 2 针开始
    expect(view.plan.some((step) => step.key === 'core-puppy-1')).toBe(false);
    expect(coreSteps(view)[0].key).toBe('core-puppy-2');
    expect(view.next?.kind).toBe('lepto');
  });

  it('V5：钩端旧的第 2 针盖住真正该打的针', () => {
    const view = build('2020-01-01', [
      rec('a', '卫佳捌', '2023-09-01'),
      rec('b', '宠必威乐必妥', '2025-06-01'),
    ]);

    // 现状：下一针是 2023 年的“第 2 针”，而不是 2025 重启后的第 2 针
    expect(view.next?.kind).toBe('lepto');
    expect(view.next?.label).toBe('第 2 针');
    expect(view.next?.windowStart).toBe('2023-09-15');
    expect(view.plan.some((step) => step.label.includes('重启免疫'))).toBe(false);
  });

  it('V10：太早打的记录不算数，但没有任何解释', () => {
    const view = build('2026-08-01', [
      rec('a', '卫佳伍', '2026-09-05'), // 5 周龄
      rec('b', '狂犬疫苗', '2026-10-10'), // 10 周龄
    ]);

    // 现状：两条都不算数，但 conflicts 是空的
    expect(view.conflicts).toHaveLength(0);
    // 现状：核心第 1 针仍逾期，狂犬首针仍待接种
    expect(view.next?.kind).toBe('core');
    expect(view.next?.status).toBe('OVERDUE');
    expect(view.plan.find((step) => step.kind === 'rabies')?.status).toBe('DUE');
  });

  it('V17：25 周晚起步被套 6~8 周首免，还排了 2 天后的 26 周补强', () => {
    const view = build('2026-05-01', []);
    expect(view.ageWeeks).toBe(25);
    // 现状：下一针写“第 1 针”，原建议 2026-06-12（6~8 周窗口）
    expect(view.next?.label).toBe('第 1 针');
    expect(view.next?.missedWindowStart).toBe('2026-06-12');
    // 现状：还排了 2026-10-30 的“26 周补强”，与第一针只差 2 天
    const booster = view.plan.find((step) => step.key === 'core-26w');
    expect(booster?.windowStart).toBe('2026-10-30');
  });

  it('对照 V17：16 周已打一针的 25 周狗，26 周补强仍保留', () => {
    // 这一条是“1% 兜底”的守卫：V17 修“晚起步”时，不能把 16 周完成首免的 26 周补强也删掉
    const view = build('2026-05-01', [rec('a', '卫佳伍', '2026-08-21')]);
    expect(view.ageWeeks).toBe(25);
    const booster = view.plan.find((step) => step.key === 'core-26w');
    expect(booster).toBeDefined();
    expect(booster?.windowStart).toBe('2026-10-30');
  });

  it('V11：抗体替代后出现两行一模一样的“评估”', () => {
    const view = build('2026-05-01', [], {
      antibodyTests: [
        { id: 't', testedAt: '2026-10-01', targets: ['CORE'], result: 'PASS' },
      ],
    });

    const covered = coreSteps(view).filter((step) => Boolean(step.titer));
    // 现状：2 行，日期和文案完全一样
    expect(covered).toHaveLength(2);
    expect(covered[0].windowStart).toBe('2027-10-01');
    expect(covered[1].windowStart).toBe('2027-10-01');
    expect(covered[0].label).toBe('评估');
    expect(covered[1].label).toBe('评估');
  });
});

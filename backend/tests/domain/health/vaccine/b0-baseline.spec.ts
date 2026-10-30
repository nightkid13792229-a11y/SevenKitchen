import {
  buildPlanView,
  materializeSteps,
  toDateText,
  type VaccinePlanView,
} from '../../../../src/domain/health/vaccine/engine';
import { classifyRecordKinds } from '../../../../src/domain/health/vaccine/products';

/**
 * B0 · 修复后期望（原 2026-10-28 现状基线，已翻面）
 *
 * 这个文件原来钉的是"改前会怎样"；B1–B4/F 落地后，**断言已翻成期望行为**。
 * 它现在的作用：防止以后又把这些问题改回去。
 *
 * 7 个案例对应审核报告的可视化页（2026-10-28-vaccine-schedule-cases.html）：
 *   V1 抗体复查 / V2 26 周补强 / V3 抗体不合格 / V4 单苗不算核心 /
 *   V5 钩端重启第 2 针 / V10 太早记录有解释 / V11 抗体替代只留一行。
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

describe('B0 · 修复后期望（原现状基线已翻面）', () => {
  it('V1：抗体合格过期后，核心进入“建议复查”，不再永远停在已完成', () => {
    const view = build('2023-01-01', [rec('a', '卫佳伍', '2023-04-01')], {
      antibodyTests: [
        { id: 't', testedAt: '2024-05-01', targets: ['CORE'], result: 'PASS' },
      ],
    });

    const core = coreSteps(view)[0];
    expect(core).toBeDefined();
    // 复查日 2025-05-01 早就过了 → 重新进入计划，角标“建议复查”
    expect(core.status).toBe('OVERDUE');
    expect(core.statusLabel).toBe('建议复查');
    expect(core.label).toBe('评估');
    expect(core.titer?.nextReviewAt).toBe('2025-05-01');
    expect(core.windowStart).toBe('2025-05-01');
    // 核心这一行已经回来，而且它就是下一针（复查已过）
    expect(view.next?.kind).toBe('core');
    expect(view.rhythm).toContain('核心疫苗每年复查抗体');
  });

  it('V2：16 周打完首免、没打 26 周补强 → 满 1 岁后仍提示 26 周补强', () => {
    const view = build('2025-09-01', [
      rec('a', '卫佳伍', '2025-11-01'),
      rec('b', '卫佳伍', '2025-12-01'),
      rec('c', '卫佳伍', '2025-12-22'),
    ]);

    // 26 周补强不能被满 1 岁丢掉
    expect(view.plan.some((step) => step.key === 'core-26w')).toBe(true);
    const core = coreSteps(view)[0];
    expect(core.key).toBe('core-26w');
    expect(core.label).toBe('26 周补强');
    expect(core.status).toBe('OVERDUE');
    expect(core.windowStart).toBe('2026-03-02');
  });

  it('V3：抗体“不合格” → 补一针，不再静默忽略', () => {
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
    expect(core.label).toBe('补一针');
    expect(core.titerFail?.testedAt).toBe('2026-09-01');
    expect(core.windowStart).toBe('2026-10-28');
    expect(view.conflicts).toHaveLength(0);
    expect(view.plan.some((step) => step.label.includes('补一针'))).toBe(true);
  });

  it('V4：单病种“细小单苗”不再算完整核心一针', () => {
    // 只含细小的自由文本不再算 core（没有成分/产品时不分入任何类）
    expect(classifyRecordKinds({ vaccineName: '细小单苗' })).toEqual([]);

    // 这个案例的“今天”是打完针的第二天（2026-06-27），不是基线默认的 10-28
    const view = buildPlanView({
      dogId: 'b0-dog',
      birthday: '2026-05-01',
      records: [rec('a', '细小单苗', '2026-06-26')],
      today: new Date('2026-06-27T00:00:00'),
    });
    // 核心第 1 针不能被单苗顶掉
    expect(view.plan.some((step) => step.key === 'core-puppy-1')).toBe(true);
    expect(coreSteps(view)[0].key).toBe('core-puppy-1');
    expect(view.next?.kind).toBe('core');
  });

  it('V5：钩端旧的第 2 针让开，显示重启第 2 针', () => {
    const view = build('2020-01-01', [
      rec('a', '卫佳捌', '2023-09-01'),
      rec('b', '宠必威乐必妥', '2025-06-01'),
    ]);

    // 上一针（2025/06）是重启第 1 针 → 下一步是重启第 2 针
    expect(view.next?.kind).toBe('lepto');
    expect(view.next?.label).toBe('重启免疫 第 2 针');
    expect(view.next?.windowStart).toBe('2025-06-15');
    expect(view.plan.some((step) => step.label.includes('重启免疫'))).toBe(true);
  });

  it('V10：太早打的记录有解释，但计划不变', () => {
    const view = build('2026-08-01', [
      rec('a', '卫佳伍', '2026-09-05'), // 5 周龄
      rec('b', '狂犬疫苗', '2026-10-10'), // 10 周龄
    ]);

    // 两条都不算数，但各有一句解释
    expect(view.conflicts).toHaveLength(2);
    expect(view.conflicts.find((item) => item.recordId === 'a')?.reason).toContain('6 周');
    expect(view.conflicts.find((item) => item.recordId === 'b')?.reason).toContain('12 周');
    // 计划不变：核心第 1 针仍逾期，狂犬首针仍待接种
    expect(view.next?.kind).toBe('core');
    expect(view.next?.status).toBe('OVERDUE');
    expect(view.plan.find((step) => step.kind === 'rabies')?.status).toBe('DUE');
  });

  it('V17：25 周晚起步 → 补一针；26 周那一针与补针至少隔 2 周', () => {
    const view = build('2026-05-01', []);
    expect(view.ageWeeks).toBe(25);
    // 下一针是补一针，原建议 2026-06-12（6~8 周窗口）
    expect(view.next?.label).toBe('补一针');
    expect(view.next?.missedWindowStart).toBe('2026-06-12');
    // 计划先只显示补一针；26 周那一针在打完补针后出现，最早 2026-11-11
    expect(view.plan.some((step) => step.key === 'core-26w')).toBe(false);
    const booster = materializeSteps({
      birthday: new Date('2026-05-01T00:00:00'),
      records: [],
      today: TODAY,
    }).find((step) => step.key === 'core-26w');
    expect(toDateText(booster!.windowStart)).toBe('2026-11-11');
  });

  it('对照 V17：16 周已打一针的 25 周狗，26 周补强仍保留', () => {
    // 这一条是“极少数兜底”的守卫：V17 修“晚起步”时，不能把 16 周完成首免的 26 周补强也删掉
    const view = build('2026-05-01', [rec('a', '卫佳伍', '2026-08-21')]);
    expect(view.ageWeeks).toBe(25);
    const booster = view.plan.find((step) => step.key === 'core-26w');
    expect(booster).toBeDefined();
    expect(booster?.windowStart).toBe('2026-10-30');
  });

  it('V11：抗体替代后只留一行“评估”', () => {
    const view = build('2026-05-01', [], {
      antibodyTests: [
        { id: 't', testedAt: '2026-10-01', targets: ['CORE'], result: 'PASS' },
      ],
    });

    const covered = coreSteps(view).filter((step) => Boolean(step.titer));
    // 只留一个“下次复查”，不是两条同日期同文案
    expect(covered).toHaveLength(1);
    expect(covered[0].windowStart).toBe('2027-10-01');
    expect(covered[0].label).toBe('评估');
  });
});

import {
  addWeeks,
  buildPlanView,
  materializeSteps,
  toDateText,
} from '../../../../src/domain/health/vaccine/engine';

/**
 * B2 · 26 周补强 / 晚起步（2026-10-30，含老板两处纠正）：
 *   · 26 周是给“16 周后母源抗体仍可能干扰的极少数狗”兜底，不是小狗系列专属；
 *   · 16+ 周那一针如果已 ≥26 周，这一针本身已顶 26 周，不再另排；
 *   · 16~26 周之间打的那一针，之后仍要 26 周或以后一针/抗体；
 *   · 26 周是年龄下限，还要**距上一针至少 2 周**（25 周打 → 最早 27 周）。
 */
describe('B2 · 26 周补强 / 晚起步', () => {
  const TODAY = new Date('2026-10-30T00:00:00');

  const birthdayFor = (weeks: number) => addWeeks(TODAY, -weeks);
  const coreAt = (birthday: Date, week: number) => ({
    id: `r-${week}`,
    vaccineName: '卫佳伍',
    vaccinationDate: toDateText(addWeeks(birthday, week)),
    productVerified: true,
  });

  const raw = (birthday: Date, records: any[] = []) =>
    materializeSteps({ birthday, records, today: TODAY });
  const view = (birthday: Date, records: any[] = []) =>
    buildPlanView({
      dogId: 'dog-1',
      birthday: toDateText(birthday),
      records,
      today: TODAY,
    });

  it('25 周零记录：补一针，不再套 6~8 周第 1 针；26 周那针最早 27 周', () => {
    const birthday = birthdayFor(25);
    const plan = view(birthday);
    const core = plan.plan.find((step) => step.kind === 'core');

    expect(core!.key).toBe('core-catchup');
    expect(core!.label).toBe('补一针');
    expect(
      plan.plan
        .filter((step) => step.kind === 'core')
        .some((step) => step.label.startsWith('第 ')),
    ).toBe(false);

    const booster = raw(birthday).find((step) => step.key === 'core-26w');
    expect(toDateText(booster!.windowStart)).toBe(
      toDateText(addWeeks(birthday, 27)),
    );
    expect(toDateText(booster!.windowEnd)).toBe(
      toDateText(addWeeks(birthday, 30)),
    );
  });

  it('20 周零记录：26 周那针从 26 周开始（距这一针 6 周）', () => {
    const birthday = birthdayFor(20);
    const booster = raw(birthday).find((step) => step.key === 'core-26w');
    expect(toDateText(booster!.windowStart)).toBe(
      toDateText(addWeeks(birthday, 26)),
    );
  });

  it('24 周零记录：26 周那针从 26 周开始（正好 2 周）', () => {
    const birthday = birthdayFor(24);
    const booster = raw(birthday).find((step) => step.key === 'core-26w');
    expect(toDateText(booster!.windowStart)).toBe(
      toDateText(addWeeks(birthday, 26)),
    );
  });

  it('23 周零记录：26 周那针仍从 26 周开始（3 周）', () => {
    const birthday = birthdayFor(23);
    const booster = raw(birthday).find((step) => step.key === 'core-26w');
    expect(toDateText(booster!.windowStart)).toBe(
      toDateText(addWeeks(birthday, 26)),
    );
  });

  it('16 周零记录：补一针；26 周那针从 26 周开始', () => {
    const birthday = birthdayFor(16);
    const plan = view(birthday);
    expect(plan.plan.find((step) => step.kind === 'core')!.key).toBe(
      'core-catchup',
    );
    const booster = raw(birthday).find((step) => step.key === 'core-26w');
    expect(toDateText(booster!.windowStart)).toBe(
      toDateText(addWeeks(birthday, 26)),
    );
  });

  it('15 周零记录：还在正常首免表里，不走补一针', () => {
    const birthday = birthdayFor(15);
    const plan = view(birthday);
    const core = plan.plan.find((step) => step.kind === 'core');
    expect(core!.label).toBe('第 1 针');
    expect(plan.plan.some((step) => step.key === 'core-catchup')).toBe(false);
  });

  it('30 周零记录：补一针；这一针已 ≥26 周，不再另排 26 周', () => {
    const birthday = birthdayFor(30);
    const plan = view(birthday);
    const core = plan.plan.find((step) => step.kind === 'core');
    expect(core!.key).toBe('core-catchup');
    expect(core!.label).toBe('补一针');
    expect(raw(birthday).some((step) => step.key === 'core-26w')).toBe(false);
  });

  it('V2：60 周、最后一针 16 周 → 26 周补强不能丢，显示尽快补种', () => {
    const birthday = birthdayFor(60);
    const plan = view(birthday, [coreAt(birthday, 8), coreAt(birthday, 12), coreAt(birthday, 16)]);
    const core = plan.plan.find((step) => step.kind === 'core');
    expect(core!.key).toBe('core-26w');
    expect(core!.label).toBe('26 周补强');
    expect(core!.status).toBe('OVERDUE');
  });

  it('60 周、最后一针 16 周、之后又打了 60 周那一针 → 这一针已顶 26 周，直接成年', () => {
    const birthday = birthdayFor(60);
    const plan = view(birthday, [
      coreAt(birthday, 8),
      coreAt(birthday, 12),
      coreAt(birthday, 16),
      coreAt(birthday, 60),
    ]);
    expect(plan.plan.some((step) => step.key === 'core-26w')).toBe(false);
    expect(plan.plan.find((step) => step.kind === 'core')!.key).toBe(
      'core-adult-1',
    );
  });

  it('25 周补了一针、27 周再看 → 下一步是 27 周起的 26 周补强（隔着 2 周）', () => {
    const birthday = birthdayFor(27);
    const plan = view(birthday, [coreAt(birthday, 25)]);
    const core = plan.plan.find((step) => step.kind === 'core');
    expect(core!.key).toBe('core-26w');
    expect(core!.windowStart).toBe(toDateText(addWeeks(birthday, 27)));
  });

  it('最后一针 26 周或以后 → 不再另排 26 周', () => {
    const birthday = birthdayFor(60);
    const plan = view(birthday, [
      coreAt(birthday, 8),
      coreAt(birthday, 12),
      coreAt(birthday, 26),
    ]);
    expect(plan.plan.some((step) => step.key === 'core-26w')).toBe(false);
    expect(plan.plan.find((step) => step.kind === 'core')!.key).toBe(
      'core-adult-1',
    );
  });
});

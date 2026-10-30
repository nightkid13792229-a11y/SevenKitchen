import { buildPlanView } from '../../../../src/domain/health/vaccine/engine';

/**
 * B1 · 抗体检测的三个边界（2026-10-30）：
 *   V11：合格 → 只留**一个**“评估”行（不再每一步都换一行）；
 *   V1 ：复查日过了 → 这一个“评估”行变成“建议复查”，不是“核心疫苗该打了”；
 *   V3 ：最新一次 CORE 不合格 → 补一针；补了之后信号消失。
 *
 * 另外钉住 Q2 的“只对最新一份生效”：旧 PASS 不能盖过新 FAIL。
 */
describe('B1 · 抗体复查 / 不合格 / 重复行', () => {
  const TODAY = new Date('2026-10-30T00:00:00');
  const ADULT_BIRTHDAY = '2023-01-01';

  const coreRecord = (date: string) => ({
    id: `r-${date}`,
    vaccineName: '卫佳伍',
    vaccinationDate: date,
    components: ['cdv', 'cpv', 'cav'],
    productVerified: true,
  });

  const build = (
    records: any[],
    tests: any[],
    birthday = ADULT_BIRTHDAY,
  ) =>
    buildPlanView({
      dogId: 'dog-1',
      birthday,
      records,
      antibodyTests: tests,
      today: TODAY,
    });

  it('V11：抗体合格只留一个“评估”行，不重复', () => {
    const view = build(
      [coreRecord('2026-08-01')],
      [
        {
          id: 't1',
          testedAt: '2026-10-01',
          targets: ['CORE'],
          result: 'PASS',
        },
      ],
    );

    const coreRows = view.plan.filter((step) => step.kind === 'core');
    expect(coreRows).toHaveLength(1);
    expect(coreRows[0].key).toBe('core-titer-review');
    expect(coreRows[0].label).toBe('评估');
    expect(coreRows[0].status).toBe('DONE');
    expect(coreRows[0].titer?.nextReviewAt).toBe('2027-10-01');
  });

  it('V1：复查日过了 → “建议复查”，不是“核心疫苗该打了”', () => {
    const view = build(
      [coreRecord('2024-09-01')],
      [
        {
          id: 't1',
          testedAt: '2024-10-15',
          targets: ['CORE'],
          result: 'PASS',
        },
      ],
    );

    const coreRows = view.plan.filter((step) => step.kind === 'core');
    expect(coreRows).toHaveLength(1);
    expect(coreRows[0].key).toBe('core-titer-review');
    expect(coreRows[0].status).toBe('OVERDUE');
    expect(coreRows[0].statusLabel).toBe('建议复查');
    expect(coreRows[0].titer?.nextReviewAt).toBe('2025-10-15');
  });

  it('V3：最新 CORE 不合格 → 补一针（只一行）', () => {
    const view = build(
      [coreRecord('2026-08-01')],
      [
        {
          id: 't1',
          testedAt: '2026-10-01',
          targets: ['CORE'],
          result: 'FAIL',
        },
      ],
    );

    const coreRows = view.plan.filter((step) => step.kind === 'core');
    expect(coreRows).toHaveLength(1);
    expect(coreRows[0].key).toBe('core-titer-fail-catchup');
    expect(coreRows[0].label).toBe('补一针');
    expect(coreRows[0].statusLabel).toBe('尽快补种');
    expect(coreRows[0].titerFail?.testedAt).toBe('2026-10-01');
  });

  it('V3：补了一针之后，不合格信号消失，回到正常成年加强', () => {
    const view = build(
      [coreRecord('2026-08-01'), coreRecord('2026-10-20')],
      [
        {
          id: 't1',
          testedAt: '2026-10-01',
          targets: ['CORE'],
          result: 'FAIL',
        },
      ],
    );

    expect(
      view.plan.some((step) => step.key === 'core-titer-fail-catchup'),
    ).toBe(false);
    expect(view.plan.some((step) => step.titerFail)).toBe(false);
  });

  it('只对最新一份生效：旧 PASS 不能盖过新 FAIL', () => {
    const view = build(
      [coreRecord('2026-08-01')],
      [
        {
          id: 'old-pass',
          testedAt: '2026-09-01',
          targets: ['CORE'],
          result: 'PASS',
        },
        {
          id: 'new-fail',
          testedAt: '2026-10-01',
          targets: ['CORE'],
          result: 'FAIL',
        },
      ],
    );

    expect(
      view.plan.some((step) => step.key === 'core-titer-fail-catchup'),
    ).toBe(true);
    expect(view.plan.some((step) => step.titer)).toBe(false);
  });

  it('只对最新一份生效：旧 FAIL 被新 PASS 覆盖', () => {
    const view = build(
      [coreRecord('2026-08-01')],
      [
        {
          id: 'old-fail',
          testedAt: '2026-09-01',
          targets: ['CORE'],
          result: 'FAIL',
        },
        {
          id: 'new-pass',
          testedAt: '2026-10-01',
          targets: ['CORE'],
          result: 'PASS',
        },
      ],
    );

    expect(
      view.plan.some((step) => step.key === 'core-titer-fail-catchup'),
    ).toBe(false);
    expect(view.plan.some((step) => step.key === 'core-titer-review')).toBe(
      true,
    );
  });

  it('不合格但证据不成立（打完不到 4 周）→ 不补，按正常计划', () => {
    const view = build(
      [coreRecord('2026-10-01')],
      [
        {
          id: 't1',
          testedAt: '2026-10-15',
          targets: ['CORE'],
          result: 'FAIL',
        },
      ],
    );

    expect(
      view.plan.some((step) => step.key === 'core-titer-fail-catchup'),
    ).toBe(false);
  });

  it('不合格但不满 20 周 → 不补', () => {
    const view = build(
      [coreRecord('2026-07-01')],
      [
        {
          id: 't1',
          testedAt: '2026-08-01',
          targets: ['CORE'],
          result: 'FAIL',
        },
      ],
      '2026-06-01',
    );

    expect(
      view.plan.some((step) => step.key === 'core-titer-fail-catchup'),
    ).toBe(false);
  });
});

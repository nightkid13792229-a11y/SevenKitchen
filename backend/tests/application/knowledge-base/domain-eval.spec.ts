import {
  LIBRARY_THRESHOLDS,
  aggregateExitCode,
  thresholdsForDomain,
  type LibraryGateSummary,
} from '../../../src/application/knowledge-base/library-eval';

/**
 * 分域门槛（全库计划 Task 11）。
 *
 * CKD 保留 26/6 的强门槛；其他域"整体 ≥90% + 负样本/对抗/表格全过"，
 * 延迟用全库标准 1500/3000，而不是 CKD 的 300/1000。
 */

const summary: LibraryGateSummary = {
  overall: 9,
  total: 10,
  stage3: { passed: 0, total: 0 },
  table: { passed: 1, total: 1 },
  zh: { passed: 2, total: 2 },
  negative: { passed: 1, total: 1 },
  adversarial: { passed: 1, total: 1 },
  coreTables: { passed: 0, total: 0 },
  timing: { p50: 10, p95: 20, max: 30 },
};

describe('thresholdsForDomain', () => {
  it('CKD 沿用 26/6 门槛', () => {
    expect(thresholdsForDomain('ckd', summary)).toBe(LIBRARY_THRESHOLDS);
  });

  it('其他域：整体 90%、类目全过、p95 1500', () => {
    const thresholds = thresholdsForDomain('gi', summary);
    expect(thresholds.overall).toBe(9);
    expect(thresholds.negative).toBe(1);
    expect(thresholds.table).toBe(1);
    expect(thresholds.p95Ms).toBe(1500);
    expect(thresholds.maxMs).toBe(3000);
  });

  it('10 题域整体门槛向上取整', () => {
    expect(
      thresholdsForDomain('oa', { ...summary, total: 11, overall: 10 }).overall,
    ).toBe(10);
  });
});

describe('aggregateExitCode', () => {
  it('任一域不过就返回 1', () => {
    expect(
      aggregateExitCode([
        { domain: 'ckd', passed: true },
        { domain: 'gi', passed: false },
      ]),
    ).toBe(1);
  });

  it('全过返回 0', () => {
    expect(
      aggregateExitCode([
        { domain: 'ckd', passed: true },
        { domain: 'gi', passed: true },
      ]),
    ).toBe(0);
  });
});

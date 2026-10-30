import {
  SEARCH_PLAN_LIBRARIES,
  approveSearchPlan,
  buildPendingSearchPlan,
} from '../../../src/domain/ingredient-creation/search-plan';

const NOW = new Date('2026-10-29T14:00:00.000Z');

const VALID_INPUT = {
  keywords: [
    { term: '鸡蛋清', language: 'zh' },
    { term: 'egg white', language: 'en' },
  ],
  libraries: ['CFCT', 'USDA'],
  findings: 'CFCT 0 条；USDA 3 条（raw / dried）',
  rationale: '英文名在 USDA 更统一',
};

function pendingPlan(input: Record<string, unknown> = {}) {
  const result = buildPendingSearchPlan({ ...VALID_INPUT, ...input }, NOW);
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error}`);
  }
  return result.plan;
}

describe('buildPendingSearchPlan', () => {
  it('把检索方案落成「待确认」，带上生成时间', () => {
    const plan = pendingPlan();

    expect(plan).toMatchObject({
      status: 'PENDING',
      libraries: ['CFCT', 'USDA'],
      findings: VALID_INPUT.findings,
      rationale: VALID_INPUT.rationale,
      proposedAt: NOW.toISOString(),
      approvedAt: null,
      approvedBy: null,
      editedByUser: false,
    });
    expect(plan.keywords).toEqual(VALID_INPUT.keywords);
  });

  it('关键词去空白、按「词 + 语种」去重', () => {
    const plan = pendingPlan({
      keywords: [
        { term: '  鸡蛋清 ', language: 'zh' },
        { term: '鸡蛋清', language: 'zh' },
        { term: 'egg white', language: 'en' },
      ],
    });

    expect(plan.keywords).toEqual([
      { term: '鸡蛋清', language: 'zh' },
      { term: 'egg white', language: 'en' },
    ]);
  });

  it('没有关键词 → 拒绝', () => {
    const result = buildPendingSearchPlan({ ...VALID_INPUT, keywords: [] }, NOW);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('关键词');
  });

  it('目标库不在白名单 → 拒绝', () => {
    const result = buildPendingSearchPlan(
      { ...VALID_INPUT, libraries: ['USDA', 'GOOGLE'] },
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('GOOGLE');
  });

  it('一个库都没选 → 拒绝', () => {
    const result = buildPendingSearchPlan(
      { ...VALID_INPUT, libraries: [] },
      NOW,
    );

    expect(result.ok).toBe(false);
  });

  it('备选记录一并收进方案', () => {
    const plan = pendingPlan({
      candidates: [
        { recordId: 'r1', name: 'Egg, white, raw, fresh', sourceType: 'USDA', state: 'RAW' },
        { name: 'Egg, white, dried', sourceType: 'USDA' },
      ],
    });

    expect(plan.candidates).toHaveLength(2);
    expect(plan.candidates[0]).toMatchObject({
      recordId: 'r1',
      name: 'Egg, white, raw, fresh',
      state: 'RAW',
    });
  });

  it('备选最多 5 条', () => {
    const plan = pendingPlan({
      candidates: Array.from({ length: 8 }, (_, index) => ({
        name: `候选 ${index + 1}`,
      })),
    });

    expect(plan.candidates).toHaveLength(5);
  });

  it('白名单就是 7 个本地库', () => {
    expect(SEARCH_PLAN_LIBRARIES).toEqual([
      'CFCT',
      'TFDA',
      'USDA',
      'CNF',
      'NZFCD',
      'MEXT',
      'KO_RDA',
    ]);
  });
});

describe('approveSearchPlan', () => {
  const APPROVER = { userId: 'admin-1', now: NOW };

  it('确认后变成「已确认」，记下谁、什么时候', () => {
    const result = approveSearchPlan(pendingPlan(), {}, APPROVER);

    expect(result.ok).toBe(true);
    expect(result.ok && result.plan).toMatchObject({
      status: 'APPROVED',
      approvedAt: NOW.toISOString(),
      approvedBy: 'admin-1',
      editedByUser: false,
    });
  });

  it('人改过目标库 → 用改后的库，并标记被人改过', () => {
    const result = approveSearchPlan(
      pendingPlan(),
      { libraries: ['USDA'] },
      APPROVER,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.plan.libraries).toEqual(['USDA']);
    expect(result.ok && result.plan.editedByUser).toBe(true);
  });

  it('已经确认过 → 拒绝重复确认', () => {
    const approved = approveSearchPlan(pendingPlan(), {}, APPROVER);
    const again = approveSearchPlan(
      approved.ok ? approved.plan : pendingPlan(),
      {},
      APPROVER,
    );

    expect(again.ok).toBe(false);
  });

  it('改成非法目标库 → 拒绝，不改原方案', () => {
    const result = approveSearchPlan(
      pendingPlan(),
      { libraries: ['GOOGLE'] },
      APPROVER,
    );

    expect(result.ok).toBe(false);
  });
});

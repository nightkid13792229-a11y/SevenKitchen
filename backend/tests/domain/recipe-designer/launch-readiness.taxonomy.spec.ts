import {
  buildDraftLaunchReadiness,
  type BuildDraftLaunchReadinessInput,
} from 'src/domain/recipe-designer/launch-readiness';

const item = {
  id: 'item-1',
  ingredientId: 'i1',
  name: '三文鱼',
  included: true,
  isSupplement: false,
  preparationMethod: '切块',
  preparationRequired: true,
} as never;

const assessment = {
  overallStatus: 'COMPLIANT',
  totalWeightG: 1000,
  energyDensityKcalPerKg: 1400,
  nutritionReport: null,
} as never;

function input(
  taxonomyLinkCount: number,
  overrides: Partial<BuildDraftLaunchReadinessInput> = {},
): BuildDraftLaunchReadinessInput {
  return {
    draftId: 'd1',
    designMode: 'CATALOG',
    name: '均衡营养｜三文鱼南瓜',
    items: [item],
    productionStepCount: 1,
    assessment,
    reportAvailable: true,
    taxonomyLinkCount,
    ...overrides,
  };
}

const blocks = (seed: BuildDraftLaunchReadinessInput) =>
  buildDraftLaunchReadiness(seed).blockers.some(
    (it) => it.code === 'TAXONOMY_REQUIRED',
  );

describe('上线检查 · 已归类门禁', () => {
  it('产品线草稿没有归属时阻断', () => {
    expect(blocks(input(0))).toBe(true);
  });

  it('挂了一个分类就放行', () => {
    expect(blocks(input(1))).toBe(false);
  });

  it('订单定制设计不计算这条门禁', () => {
    expect(blocks(input(0, { designMode: 'ORDER' }))).toBe(false);
  });

  it('阻断项挂在产品线分支，文案说清去哪补', () => {
    const blocker = buildDraftLaunchReadiness(input(0)).blockers.find(
      (it) => it.code === 'TAXONOMY_REQUIRED',
    );
    expect(blocker?.message).toContain('需求分类');
  });
});

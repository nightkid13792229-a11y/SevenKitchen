import { buildDraftLaunchReadiness } from '../../../src/domain/recipe-designer/launch-readiness';

/**
 * 发布门槛：没有成本的食材（2026-11-07 成本口径归位 · Task 8）。
 *
 * 规则来自老板 2026-11-07：**产品线发布**必须拦住 0 成本食材，
 * **订单「加入待提交」只提醒不拦**（顾客已经下单了再拦更糟）。
 */
describe('发布门槛 · 食材成本', () => {
  const buildInput = (overrides: Record<string, unknown> = {}) => ({
    draftId: 'd1',
    designMode: 'CATALOG',
    name: '鸡肉糙米',
    items: [
      {
        id: 'item1',
        ingredientId: 'i1',
        name: '糙米',
        included: true,
        isSupplement: false,
        preparationMethod: '生',
        preparationRequired: false,
        costPerBaseUnit: 0,
      },
    ],
    productionStepCount: 3,
    assessment: {
      totalWeightG: 1000,
      energyDensityKcalPerKg: 1500,
      dryMatterEnergyDensityKcalPerKg: 4000,
      overallStatus: 'PASS',
      deficientCount: 0,
      excessCount: 0,
      missingDataCount: 0,
      dataGaps: [],
    },
    reportAvailable: true,
    requirePresentation: false,
    ...overrides,
  });

  it('产品线发布：食材成本为 0 时阻断，并指名原料', () => {
    const result = buildDraftLaunchReadiness(buildInput() as any);

    const blocker = result.blockers.find(
      (item: any) => item.code === 'INGREDIENT_COST_MISSING',
    );
    expect(blocker).toBeDefined();
    expect((blocker as any).message).toContain('糙米');
  });

  it('订单加入待提交：同样的数据只提醒，不阻断', () => {
    const result = buildDraftLaunchReadiness(
      buildInput({ designMode: 'ORDER' }) as any,
    );

    expect(
      result.blockers.some((item: any) => item.code === 'INGREDIENT_COST_MISSING'),
    ).toBe(false);
    expect(
      result.warnings.some((item: any) => item.code === 'INGREDIENT_COST_MISSING'),
    ).toBe(true);
  });

  it('食材有成本时不产生任何提示', () => {
    const input = buildInput();
    (input.items[0] as any).costPerBaseUnit = 0.0798;

    const result = buildDraftLaunchReadiness(input as any);

    expect(
      [...result.blockers, ...result.warnings].some(
        (item: any) => item.code === 'INGREDIENT_COST_MISSING',
      ),
    ).toBe(false);
  });
});

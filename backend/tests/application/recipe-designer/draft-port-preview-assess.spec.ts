import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';
import type { AgentNutritionPlan } from '../../../src/application/recipe-designer/agent/propose-plan';

/**
 * 2026-11-24：试算走“候选原料 + 克数”，不写草稿。
 * 与 assess 共用投影，所以缺口/缺数据/计数口径必须一致。
 */
describe('RecipeDraftPort · previewAssessment', () => {
  it('把试算结果投影成与 assess 同口径的摘要，并带上批次', async () => {
    const assessNutritionItemsForAgent = jest.fn().mockResolvedValue({
      contentRevision: 12,
      totalWeightG: 1000,
      assessment: {
        overallStatus: 'NON_COMPLIANT',
        totalEnergyKcal: 1500,
        summary: {
          compliant: 30,
          deficient: 1,
          excess: 0,
          missingData: 2,
        },
        groupedEntries: [
          {
            nutrientKey: 'calcium',
            label: '钙',
            status: 'DEFICIENT',
            unit: '%DM',
            currentValue: 0.5,
            minValue: 0.6,
            maxValue: 1.2,
          },
        ],
      },
    });
    const port = new RecipeDraftPort(
      { assessNutritionItemsForAgent } as any,
      { userId: 'u1' } as any,
      'draft-1',
    );

    const result = await port.previewAssessment([
      { nutritionFoodId: 'nf-1', weightG: 1000 },
    ]);

    expect(assessNutritionItemsForAgent).toHaveBeenCalledWith(
      'draft-1',
      { userId: 'u1' },
      [{ nutritionFoodId: 'nf-1', weightG: 1000 }],
    );
    expect(result.isCompliant).toBe(false);
    expect(result.totalEnergyKcal).toBe(1500);
    expect(result.gaps[0]).toMatchObject({
      key: 'calcium',
      label: '钙',
      status: 'DEFICIENT',
      value: 0.5,
      min: 0.6,
      max: 1.2,
    });
    expect(result.gaps[0].deficit).toBeCloseTo(0.1);
    expect(result.counts).toEqual({
      compliant: 30,
      deficient: 1,
      excess: 0,
      missingData: 2,
    });
    expect(result.allergens).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.batch).toEqual({
      itemCount: 1,
      totalWeightG: 1000,
      energyKcal: 1500,
    });
  });

  it('方案约束引擎算不了时不跑第二遍，只报 unsupported', async () => {
    const assessNutritionItemsForAgent = jest.fn();
    const port = new RecipeDraftPort(
      {
        assessNutritionItemsForAgent,
        getDraftAssessmentTargets: jest.fn().mockResolvedValue([]),
      } as any,
      { userId: 'u1' } as any,
      'draft-1',
    );
    const plan: AgentNutritionPlan = {
      summary: '低磷',
      constraints: [],
      nonNutrient: [],
    };

    const result = await port.previewPlanAssessment(
      [{ nutritionFoodId: 'nf-1', weightG: 1000 }],
      plan,
    );

    expect(result.assessment).toBeNull();
    expect(result.overrides).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(assessNutritionItemsForAgent).not.toHaveBeenCalled();
  });

  it('readNutritionProfiles 直接委托服务，不在端口里二次加工', async () => {
    const readNutritionProfilesForAgent = jest
      .fn()
      .mockResolvedValue([{ nutritionFoodId: 'nf-1' }]);
    const port = new RecipeDraftPort(
      { readNutritionProfilesForAgent } as any,
      { userId: 'u1' } as any,
      'draft-1',
    );

    const result = await port.readNutritionProfiles({
      nutritionFoodIds: ['nf-1'],
      fields: ['minerals.zinc'],
    });

    expect(readNutritionProfilesForAgent).toHaveBeenCalledWith(
      'draft-1',
      { userId: 'u1' },
      {
        nutritionFoodIds: ['nf-1'],
        ingredientId: undefined,
        fields: ['minerals.zinc'],
      },
    );
    expect(result).toEqual([{ nutritionFoodId: 'nf-1' }]);
  });
});

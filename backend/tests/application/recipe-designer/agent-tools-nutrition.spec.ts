import {
  executeTool,
  type ToolExecutionContext,
} from '../../../src/application/recipe-designer/agent/tools';
import type { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';
import type { RecipeCatalogPort } from '../../../src/application/recipe-designer/agent/catalog-port';
import type { KnowledgeGatewayService } from '../../../src/application/knowledge-v3/knowledge-gateway.service';
import type { AgentNutritionPlan } from '../../../src/application/recipe-designer/agent/propose-plan';

/**
 * 2026-11-24：Agent 能看原料营养档案、能在选材阶段试算。
 *
 * 工具层只负责参数归一与转发，营养对错由评估引擎负责；
 * 这里盯住三件事：转发参数、摘要说人话、错误不吞。
 */
describe('agent tools: 营养档案与试算', () => {
  const baseContext = (): ToolExecutionContext => ({
    port: {} as RecipeDraftPort,
    catalog: {} as RecipeCatalogPort,
    knowledge: {} as KnowledgeGatewayService,
    onAsk: jest.fn(),
  });

  it('read_nutrition_profile 把 id 和字段过滤转给端口', async () => {
    const profiles = [
      {
        nutritionFoodId: 'nf-chicken',
        ingredientId: null,
        name: '鸡胸肉',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        category: 'MEAT',
        dataSource: 'USDA',
        status: 'VERIFIED',
        verifiedAt: null,
        basis: 'PER_100_G',
        basisLabel: '每 100 克',
        per100gAvailable: true,
        nutrients: [
          {
            fieldPath: 'macros.crudeProtein',
            label: '粗蛋白',
            unit: 'g',
            valuePer100g: 22.5,
          },
        ],
        missingCount: 12,
        missingFields: ['minerals.iodine'],
        missingLabels: ['碘'],
      },
    ];
    const readNutritionProfiles = jest.fn().mockResolvedValue(profiles);

    const result = await executeTool(
      'read_nutrition_profile',
      { nutritionFoodIds: ['nf-chicken'], fields: ['锌'] },
      {
        ...baseContext(),
        port: { readNutritionProfiles } as unknown as RecipeDraftPort,
      },
    );

    expect(readNutritionProfiles).toHaveBeenCalledWith({
      nutritionFoodIds: ['nf-chicken'],
      ingredientId: undefined,
      fields: ['锌'],
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(profiles);
    expect(result.summary).toContain('鸡胸肉（生）');
    expect(result.summary).toContain('1 项有值');
    expect(result.summary).toContain('缺 12 项');
  });

  it('read_nutrition_profile 两个入口都不给时报错', async () => {
    const readNutritionProfiles = jest.fn();
    const result = await executeTool(
      'read_nutrition_profile',
      {},
      {
        ...baseContext(),
        port: { readNutritionProfiles } as unknown as RecipeDraftPort,
      },
    );

    expect(readNutritionProfiles).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGUMENT');
  });

  it('preview_assessment 转发候选批次并带上方案试算', async () => {
    const summary = {
      isCompliant: false,
      contentRevision: 9,
      totalEnergyKcal: 1680,
      counts: { compliant: 30, deficient: 2, excess: 0, missingData: 1 },
      gaps: [
        {
          key: 'calcium',
          label: '钙',
          status: 'DEFICIENT',
          value: 0.5,
          min: 0.6,
          max: 1.2,
          unit: '%DM',
          deficit: 0.1,
          contributors: [],
        },
      ],
      missingData: [],
      allergens: [],
      warnings: [],
      batch: { itemCount: 2, totalWeightG: 1000, energyKcal: 1680 },
    };
    const previewAssessment = jest.fn().mockResolvedValue(summary);
    const previewPlanAssessment = jest.fn().mockResolvedValue({
      assessment: {
        isCompliant: false,
        counts: { deficient: 1 },
        gaps: [],
      },
      overrides: [],
      unsupported: [],
    });
    const plan: AgentNutritionPlan = {
      summary: '低磷',
      constraints: [],
      nonNutrient: [],
    };

    const result = await executeTool(
      'preview_assessment',
      {
        items: [
          { nutritionFoodId: 'nf-1', weightG: 600 },
          { nutritionFoodId: 'nf-2', weightG: 400 },
        ],
      },
      {
        ...baseContext(),
        port: {
          previewAssessment,
          previewPlanAssessment,
        } as unknown as RecipeDraftPort,
        plan,
      },
    );

    expect(previewAssessment).toHaveBeenCalledWith([
      { nutritionFoodId: 'nf-1', weightG: 600 },
      { nutritionFoodId: 'nf-2', weightG: 400 },
    ]);
    expect(previewPlanAssessment).toHaveBeenCalledWith(
      [
        { nutritionFoodId: 'nf-1', weightG: 600 },
        { nutritionFoodId: 'nf-2', weightG: 400 },
      ],
      plan,
    );
    expect(result.ok).toBe(true);
    expect(result.data.planAssessment).toBeTruthy();
    expect(result.summary).toContain('试算 2 项 / 共 1000g');
    expect(result.summary).toContain('方案专属评估：未通过');
  });

  it('preview_assessment 拒绝空 items 和非法克数', async () => {
    const previewAssessment = jest.fn();
    const empty = await executeTool(
      'preview_assessment',
      { items: [] },
      {
        ...baseContext(),
        port: { previewAssessment } as unknown as RecipeDraftPort,
      },
    );
    expect(empty.ok).toBe(false);
    expect(empty.error?.code).toBe('INVALID_ARGUMENT');

    const badWeight = await executeTool(
      'preview_assessment',
      { items: [{ nutritionFoodId: 'nf-1', weightG: 0 }] },
      {
        ...baseContext(),
        port: { previewAssessment } as unknown as RecipeDraftPort,
      },
    );
    expect(badWeight.ok).toBe(false);
    expect(badWeight.error?.code).toBe('INVALID_ARGUMENT');
    expect(previewAssessment).not.toHaveBeenCalled();
  });
});

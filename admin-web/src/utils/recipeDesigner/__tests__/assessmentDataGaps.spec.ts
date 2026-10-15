/**
 * 「哪个原料缺哪个必填字段」的数据缺口提示。
 *
 * 背景（2026-10-16 生产事故）：油麦菜的营养档案缺 `macros.fiber`，
 * 而犬用 Atwater 能量公式强制要求 水分/粗蛋白/粗脂肪/灰分/膳食纤维 五项。
 * 一个食材缺一项 → 整份食谱能量为 null → 所有「每1000千卡 / 每兆焦」口径的指标
 * 一起变「缺数据」，而界面上看不出是哪个原料缺了什么。
 *
 * 这里锁住：缺口要被点名，且补上之后自动消失。
 */
import { describe, expect, it } from 'vitest';
import { assessRecipeDraft, type DesignRecipeAssessmentInput } from '../assessment';
import type { AssessmentCategory, DesignRecipeAssessmentItemInput } from '../assessmentTypes';
import type { NutritionProfile } from '../nutritionProfileTypes';

const proteinTarget = {
  nutrientKey: 'crudeProtein',
  label: '粗蛋白',
  category: 'MACRO' satisfies AssessmentCategory,
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'g',
  minValue: 45,
  maxValue: null,
  fieldPaths: ['macros.crudeProtein'],
} as const;

function macros(overrides: Record<string, unknown> = {}) {
  return {
    moisture: 70,
    crudeProtein: 20,
    crudeFat: 8,
    ash: 2,
    fiber: 1,
    carbohydrate: 0,
    energyKcal: 150,
    ...overrides,
  };
}

function foodItem(
  id: string,
  name: string,
  macroOverrides: Record<string, unknown> = {},
  weightG = 100,
): DesignRecipeAssessmentItemInput {
  return {
    id,
    name,
    ingredientType: 'FOOD',
    weightG,
    nutritionProfile: {
      meta: { rawBasisType: 'PER_100_G' },
      macros: macros(macroOverrides),
      minerals: {},
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
    } as unknown as NutritionProfile,
  };
}

function run(items: DesignRecipeAssessmentItemInput[]) {
  return assessRecipeDraft({
    scenario: 'ADULT_MER_95',
    targets: [proteinTarget],
    items,
  } as unknown as DesignRecipeAssessmentInput);
}

describe('评估数据缺口点名', () => {
  it('食材缺膳食纤维时，点名到具体原料与字段', () => {
    const result = run([
      foodItem('a', '鸭胸'),
      foodItem('b', '油麦菜', { fiber: null }, 25),
    ]);

    expect(result.dataGaps).toHaveLength(1);
    expect(result.dataGaps[0]).toMatchObject({
      itemId: 'b',
      itemName: '油麦菜',
      fieldPath: 'macros.fiber',
      fieldLabel: '膳食纤维',
      blocksEnergy: true,
    });
  });

  it('缺口确实卡住能量与按能量口径的指标', () => {
    const result = run([
      foodItem('a', '鸭胸'),
      foodItem('b', '油麦菜', { fiber: null }, 25),
    ]);

    expect(result.totalEnergyKcal).toBeNull();
    expect(result.entries[0]?.status).toBe('MISSING_DATA');
  });

  it('补齐膳食纤维后缺口消失、能量与指标恢复', () => {
    const result = run([
      foodItem('a', '鸭胸'),
      foodItem('b', '油麦菜', { fiber: 1.7 }, 25),
    ]);

    expect(result.dataGaps).toEqual([]);
    expect(result.totalEnergyKcal).not.toBeNull();
    expect(result.entries[0]?.status).not.toBe('MISSING_DATA');
  });

  it('多项缺失会逐个列出', () => {
    const result = run([
      foodItem('a', '神秘食材', { moisture: null, ash: null, fiber: null }, 50),
    ]);

    expect(result.dataGaps.map((gap) => gap.fieldLabel).sort()).toEqual([
      '水分',
      '灰分',
      '膳食纤维',
    ]);
    expect(result.dataGaps.every((gap) => gap.itemName === '神秘食材')).toBe(true);
  });

  it('补剂缺这些字段不算缺口（补剂走 missingValueAsZero 分支）', () => {
    const supplement: DesignRecipeAssessmentItemInput = {
      id: 's',
      name: '碳酸钙粉',
      ingredientType: 'SUPPLEMENT',
      weightG: 2,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: { energyKcal: 0 },
        minerals: {},
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as unknown as NutritionProfile,
    };

    const result = run([foodItem('a', '鸭胸'), supplement]);
    expect(result.dataGaps).toEqual([]);
    expect(result.totalEnergyKcal).not.toBeNull();
  });

  it('用量为 0 的原料不计入缺口（不影响合计）', () => {
    const result = run([
      foodItem('a', '鸭胸'),
      foodItem('b', '油麦菜', { fiber: null }, 0),
    ]);

    expect(result.dataGaps).toEqual([]);
  });
});

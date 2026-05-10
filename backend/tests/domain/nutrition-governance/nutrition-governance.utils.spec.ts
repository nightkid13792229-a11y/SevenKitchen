import {
  buildNutritionSourceKey,
  classifyMatchConfidence,
  getSourcePriority,
  mapUsdaNutrientsToNutritionProfile,
  normalizeNameForMatch,
  scoreIngredientSourceNameMatch,
} from '../../../src/domain/nutrition-governance/nutrition-governance.utils';

describe('nutrition governance utilities', () => {
  it('builds stable source keys', () => {
    expect(buildNutritionSourceKey('USDA', '12345')).toBe('USDA:12345');
    expect(buildNutritionSourceKey('CFCT', ' v6-1:p12:r4 ')).toBe(
      'CFCT:v6-1:p12:r4',
    );
  });

  it('prioritizes USDA before CFCT before manual sources', () => {
    expect(getSourcePriority('USDA')).toBe(1);
    expect(getSourcePriority('CFCT')).toBe(2);
    expect(getSourcePriority('MANUAL')).toBe(3);
    expect(getSourcePriority('SUPPLEMENT_LABEL')).toBe(4);
  });

  it('classifies confidence by numeric score', () => {
    expect(classifyMatchConfidence(0.85)).toBe('HIGH');
    expect(classifyMatchConfidence(0.6)).toBe('MEDIUM');
    expect(classifyMatchConfidence(0.59)).toBe('LOW');
  });

  it('normalizes names for punctuation-insensitive matching', () => {
    expect(normalizeNameForMatch(' Chicken-Breast (Raw)_切块 ')).toBe(
      'chickenbreastraw切块',
    );
    expect(normalizeNameForMatch('鸡胸肉（去皮），生')).toBe('鸡胸肉去皮生');
  });

  it('scores source name matches with source priority reasons', () => {
    expect(
      scoreIngredientSourceNameMatch({
        ingredientName: 'Chicken Breast',
        sourceFoodName: 'chicken-breast',
        sourceType: 'USDA',
      }),
    ).toEqual({
      score: 0.9,
      reasons: [
        { code: 'NAME_EXACT', label: '名称完全匹配', scoreDelta: 0.75 },
        { code: 'SOURCE_PRIORITY', label: 'USDA 优先来源', scoreDelta: 0.15 },
      ],
    });

    expect(
      scoreIngredientSourceNameMatch({
        ingredientName: '鸡胸肉',
        sourceFoodName: '鸡胸肉 去皮',
        sourceType: 'CFCT',
      }),
    ).toEqual({
      score: 0.65,
      reasons: [
        { code: 'NAME_PARTIAL', label: '名称部分匹配', scoreDelta: 0.55 },
        {
          code: 'SOURCE_PRIORITY',
          label: '中国食物成分表第二来源',
          scoreDelta: 0.1,
        },
      ],
    });
  });

  it('scores common Chinese ingredient names against USDA English descriptions', () => {
    expect(
      scoreIngredientSourceNameMatch({
        ingredientName: '鸡胸肉',
        sourceFoodName: 'Chicken breast, cooked, roasted',
        sourceType: 'USDA',
      }),
    ).toEqual({
      score: 0.8,
      reasons: [
        {
          code: 'NAME_PARTIAL',
          label: '常用中英别名匹配',
          scoreDelta: 0.65,
        },
        { code: 'SOURCE_PRIORITY', label: 'USDA 优先来源', scoreDelta: 0.15 },
      ],
    });
  });

  it('maps USDA nutrient ids into nutritionProfile v2 groups', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      { nutrient: { id: 1008, name: 'Energy', unitName: 'KCAL' }, amount: 145 },
      { nutrient: { id: 1003, name: 'Protein', unitName: 'G' }, amount: 22.5 },
      { nutrient: { id: 1087, name: 'Calcium', unitName: 'MG' }, amount: 12 },
      {
        nutrient: { id: 1091, name: 'Phosphorus', unitName: 'MG' },
        amount: 190,
      },
    ]);

    expect(profile.meta.rawBasisType).toBe('PER_100_G');
    expect(profile.meta.sourceType).toBe('USDA');
    expect(profile.macros.energyKcal).toBe(145);
    expect(profile.macros.crudeProtein).toBe(22.5);
    expect(profile.minerals.calcium).toBe(12);
    expect(profile.minerals.phosphorus).toBe(190);
  });

  it('keeps USDA folate, leucine, and saturated fat ids in their correct fields', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      { nutrient: { id: 1177, name: 'Folate, total', unitName: 'UG' }, amount: 47 },
      { nutrient: { id: 1213, name: 'Leucine', unitName: 'G' }, amount: 1.09 },
      {
        nutrient: { id: 1257, name: 'Fatty acids, total trans', unitName: 'G' },
        amount: 0.038,
      },
      {
        nutrient: { id: 1258, name: 'Fatty acids, total saturated', unitName: 'G' },
        amount: 3.13,
      },
    ]);

    expect(profile.vitamins.vitaminB9).toBe(47);
    expect(profile.aminoAcids.leucine).toBe(1.09);
    expect(profile.fattyAcids.saturatedFattyAcids).toBe(3.13);
  });

  it('converts USDA vitamin D and E source units into local IU fields', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      { nutrient: { id: 1114, name: 'Vitamin D (D2 + D3)', unitName: 'UG' }, amount: 2 },
      {
        nutrient: { id: 1109, name: 'Vitamin E (alpha-tocopherol)', unitName: 'MG' },
        amount: 1.05,
      },
    ]);

    expect(profile.vitamins.vitaminD).toBe(80);
    expect(profile.vitamins.vitaminE).toBeCloseTo(1.57, 2);
  });
});

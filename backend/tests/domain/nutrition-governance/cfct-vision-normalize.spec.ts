import { findNutritionField } from 'src/domain/ingredient/nutrition-field-catalog';
import { getNutritionSourceDefinition } from 'src/domain/ingredient/nutrition-source-contract';
import {
  buildCfctVisionProfile,
  CFCT_SOURCE_PROVIDER,
  CFCT_SOURCE_TITLE,
  CFCT_SOURCE_VERSION,
  CFCT_VISION_NUTRIENT_MAP,
  CFCT_VOLUME_META,
  type CfctVisionFood,
} from 'src/domain/nutrition-governance/cfct-vision-normalize';

const food = (
  columns: Record<string, number | null>,
  overrides: Partial<CfctVisionFood> = {},
): CfctVisionFood => ({
  code: '011101',
  name: '小麦',
  columns,
  pages: [52, 53],
  ...overrides,
});

describe('buildCfctVisionProfile', () => {
  it('maps energy, water, protein, fat, carbohydrate, fiber and ash into macros', () => {
    const profile = buildCfctVisionProfile(
      food({
        energyKcal: 338,
        water: 10,
        protein: 11.9,
        fat: 1.3,
        cho: 75.2,
        fiber: 10.8,
        ash: 1.6,
      }),
    );

    expect(profile.macros.energyKcal).toBe(338);
    expect(profile.macros.moisture).toBeCloseTo(10);
    expect(profile.macros.crudeProtein).toBeCloseTo(11.9);
    expect(profile.macros.crudeFat).toBeCloseTo(1.3);
    expect(profile.macros.carbohydrate).toBeCloseTo(75.2);
    expect(profile.macros.fiber).toBeCloseTo(10.8);
    expect(profile.macros.ash).toBeCloseTo(1.6);
  });

  it('maps thiamin, riboflavin, niacin and vitamin C into vitamins', () => {
    const profile = buildCfctVisionProfile(
      food({
        thiamin: 0.4,
        riboflavin: 0.1,
        niacin: 2,
        vitaminC: 4.5,
      }),
    );

    expect(profile.vitamins.vitaminB1).toBeCloseTo(0.4);
    expect(profile.vitamins.vitaminB2).toBeCloseTo(0.1);
    expect(profile.vitamins.vitaminB3).toBeCloseTo(2);
    expect(profile.vitamins.vitaminC).toBeCloseTo(4.5);
  });

  it('converts vitamin E from mg to IU and vitamin A from µgRAE to IU', () => {
    const profile = buildCfctVisionProfile(
      food({ vitaminE: 2, vitaminA: 300 }),
    );

    expect(profile.vitamins.vitaminE).toBeCloseTo(2.98); // ×1.49
    expect(profile.vitamins.vitaminA).toBeCloseTo(999); // ×3.33
    expect(profile.meta.conversionNotes?.['vitamins.vitaminE']).toContain(
      '1.49',
    );
    expect(profile.meta.conversionNotes?.['vitamins.vitaminA']).toContain(
      '3.33',
    );
  });

  it('records source form provenance for direct and converted fields', () => {
    const profile = buildCfctVisionProfile(
      food({ energyKcal: 338, selenium: 3, vitaminE: 2 }),
    );

    expect(profile.meta.sourceForms?.['macros.energyKcal']).toMatchObject({
      sourceNutrientName: 'energyKcal',
      originalValue: 338,
      originalUnit: 'kcal',
      canonicalValue: 338,
      canonicalUnit: 'kcal',
      basisType: 'PER_100_G',
    });
    expect(profile.meta.sourceForms?.['minerals.selenium']).toMatchObject({
      sourceNutrientName: 'selenium',
      originalValue: 3,
      originalUnit: 'µg',
      canonicalValue: 3,
      canonicalUnit: findNutritionField('minerals.selenium')?.unit,
      basisType: 'PER_100_G',
    });
    expect(profile.meta.sourceForms?.['vitamins.vitaminE']).toMatchObject({
      sourceNutrientName: 'vitaminE',
      originalValue: 2,
      originalUnit: 'mg',
      canonicalValue: 2.98,
      canonicalUnit: 'IU',
      basisType: 'PER_100_G',
    });
  });

  it('keeps selenium in micrograms without conversion', () => {
    const profile = buildCfctVisionProfile(food({ selenium: 3 }));

    expect(profile.minerals.selenium).toBeCloseTo(3);
  });

  it('ignores cholesterol, carotene and retinol columns that are not in the catalogue', () => {
    const profile = buildCfctVisionProfile(
      food({ cholesterol: 0, carotene: 120, retinol: 0, energyKcal: 100 }),
    );

    expect(profile.macros).not.toHaveProperty('cholesterol');
    expect(profile.vitamins).not.toHaveProperty('carotene');
    expect(profile.vitamins).not.toHaveProperty('retinol');
    expect(profile.customItems).toEqual([]);
    expect(
      JSON.stringify({
        macros: profile.macros,
        minerals: profile.minerals,
        vitamins: profile.vitamins,
      }),
    ).not.toMatch(/cholesterol|carotene|retinol/);
  });

  it('leaves null, missing and non-finite values null instead of filling zero', () => {
    const profile = buildCfctVisionProfile(
      food({
        energyKcal: 338,
        water: null,
        protein: Number.NaN,
        calcium: 0,
        selenium: Number.POSITIVE_INFINITY,
      }),
    );

    expect(profile.macros.energyKcal).toBe(338);
    expect(profile.macros.moisture).toBeNull();
    expect(profile.macros.crudeProtein).toBeNull();
    expect(profile.macros.crudeFat).toBeNull();
    expect(profile.macros.fiber).toBeNull();
    expect(profile.vitamins.vitaminB1).toBeNull();
    expect(profile.vitamins.vitaminA).toBeNull();
    expect(profile.vitamins.vitaminE).toBeNull();
    expect(profile.minerals.selenium).toBeNull();
    expect(profile.minerals.iodine).toBeNull();

    // 明确的 0 是有效表值，必须保留；"不补 0" 指缺失值不能变成 0。
    expect(profile.minerals.calcium).toBe(0);
  });

  it('writes registered CFCT meta and resolves the source definition', () => {
    const profile = buildCfctVisionProfile(food({ energyKcal: 338 }));

    expect(profile.meta.sourceType).toBe('CFCT');
    expect(profile.meta.sourceCode).toBe('CFCT');
    expect(profile.meta.sourceProvider).toBe(CFCT_SOURCE_PROVIDER);
    expect(profile.meta.sourceTitle).toBe(CFCT_SOURCE_TITLE);
    expect(profile.meta.sourceVersion).toBe(CFCT_SOURCE_VERSION);
    expect(profile.meta.externalId).toBe('CFCT:011101');
    expect(profile.meta.confidenceLevel).toBe('MEDIUM');
    expect(profile.meta.rawBasisType).toBe('PER_100_G');

    const definition = getNutritionSourceDefinition(profile.meta.sourceCode);
    expect(definition).toEqual({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'CFCT',
      sourceProvider: 'China Food Composition Tables',
    });
  });

  it('defaults to volume 1 title and version', () => {
    const profile = buildCfctVisionProfile(food({ energyKcal: 338 }));

    expect(CFCT_VOLUME_META[1]).toEqual({
      title: '中国食物成分表 标准版 第6版 第一册',
      version: 'CFCT_V6_VOL1_2018',
    });
    expect(profile.meta.sourceTitle).toBe(CFCT_VOLUME_META[1].title);
    expect(profile.meta.sourceVersion).toBe(CFCT_VOLUME_META[1].version);
    expect(profile.meta.sourceTitle).toBe(CFCT_SOURCE_TITLE);
    expect(profile.meta.sourceVersion).toBe(CFCT_SOURCE_VERSION);
  });

  it('uses volume 2 title and version without changing source identity', () => {
    const profile = buildCfctVisionProfile(food({ energyKcal: 338 }), 2);

    expect(CFCT_VOLUME_META[2]).toEqual({
      title: '中国食物成分表 标准版 第6版 第二册',
      version: 'CFCT_V6_VOL2_2019',
    });
    expect(profile.meta.sourceTitle).toBe(CFCT_VOLUME_META[2].title);
    expect(profile.meta.sourceVersion).toBe(CFCT_VOLUME_META[2].version);
    // 卷册只影响标题 / 版本，来源身份与 externalId 必须保持不变。
    expect(profile.meta.sourceType).toBe('CFCT');
    expect(profile.meta.sourceCode).toBe('CFCT');
    expect(profile.meta.sourceProvider).toBe(CFCT_SOURCE_PROVIDER);
    expect(profile.meta.externalId).toBe('CFCT:011101');
  });

  it('maps every column to a unique nutrition catalogue field', () => {
    const fieldPaths = CFCT_VISION_NUTRIENT_MAP.map(
      (mapping) => `${mapping.tabKey}.${mapping.fieldKey}`,
    );

    expect(CFCT_VISION_NUTRIENT_MAP).toHaveLength(23);
    expect(new Set(fieldPaths).size).toBe(fieldPaths.length);

    for (const fieldPath of fieldPaths) {
      expect(findNutritionField(fieldPath)).toBeDefined();
    }
  });
});

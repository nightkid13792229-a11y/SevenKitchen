// @ts-nocheck — ported verbatim from backend tests; backend never type-checked this file (ts-jest only), and admin-web inherits noUncheckedIndexedAccess from @vue/tsconfig.
import { describe, expect, it } from 'vitest';
import {
  assessRecipeDraft,
  type DesignRecipeAssessmentInput,
} from '../assessment';
import type { AssessmentCategory } from '../assessmentTypes';

const adultProteinTarget = {
  nutrientKey: 'crudeProtein',
  label: '粗蛋白',
  category: 'MACRO' satisfies AssessmentCategory,
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'g',
  minValue: 45,
  maxValue: null,
  fieldPaths: ['macros.crudeProtein'],
} as const;

function completeAtwaterMacros<T extends Record<string, unknown>>(
  macros: T,
): T & {
  moisture: number;
  crudeProtein: number;
  crudeFat: number;
  ash: number;
  fiber: number;
} {
  const moisture = finiteNumberOrDefault(macros.moisture, 0);
  const crudeProtein = finiteNumberOrDefault(macros.crudeProtein, 0);
  let crudeFat = finiteNumberOrDefault(macros.crudeFat, 0);
  let ash = finiteNumberOrDefault(macros.ash, 0);
  const fiber = finiteNumberOrDefault(macros.fiber, 0);
  const targetEnergyKcal = finiteNumberOrNull(macros.energyKcal);

  if (targetEnergyKcal !== null) {
    const currentEnergyKcal =
      4 * crudeProtein +
      9 * crudeFat +
      4 * Math.max(100 - moisture - crudeProtein - crudeFat - ash - fiber, 0);
    const energyDelta = targetEnergyKcal - currentEnergyKcal;
    if (energyDelta > 0) {
      crudeFat += energyDelta / 5;
    } else if (energyDelta < 0) {
      ash += Math.abs(energyDelta) / 4;
    }
  }

  return {
    ...macros,
    moisture,
    crudeProtein,
    crudeFat,
    ash,
    fiber,
  };
}

function finiteNumberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function makeInput(weightMultiplier = 1): DesignRecipeAssessmentInput {
  return {
    scenario: 'ADULT_MER_95',
    items: [
      {
        id: 'item-beef',
        name: '牛肉',
        weightG: 400 * weightMultiplier,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 200,
            moisture: 65,
            crudeProtein: 20,
            crudeFat: 10,
            ash: 1,
            carbohydrate: 0,
            fiber: 0,
            solubleFiber: null,
            insolubleFiber: null,
          },
          minerals: {
            calcium: 10,
            phosphorus: 180,
            potassium: null,
            sodium: null,
            magnesium: null,
            chloride: null,
            iron: null,
            zinc: null,
            copper: null,
            manganese: null,
            selenium: null,
            iodine: null,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
      },
      {
        id: 'item-rice',
        name: '米饭',
        weightG: 500 * weightMultiplier,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 130,
            moisture: 70,
            crudeProtein: 2.5,
            crudeFat: 0.3,
            ash: 0.2,
            carbohydrate: 28,
            fiber: 0.4,
            solubleFiber: null,
            insolubleFiber: null,
          },
          minerals: {
            calcium: 10,
            phosphorus: 180,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
      },
    ],
    targets: [adultProteinTarget],
  };
}

describe('recipe designer assessment', () => {
  it('uses free total grams and does not require a 1kg recipe', () => {
    const result = assessRecipeDraft(makeInput());

    expect(result.totalWeightG).toBe(900);
    expect(result.totalEnergyKcal).toBeCloseTo(1339.5, 3);
    expect(result.energyDensityKcalPerKg).toBeCloseTo(1488.333, 3);
    expect(result.macroMetrics.carbohydrate.total).toBe(140);
    expect(result.macroMetrics.carbohydrate.per1000Kcal).toBeCloseTo(
      104.517,
      3,
    );
    expect(result.macroMetrics.carbohydrate.dryMatterPercent).toBeCloseTo(
      48.276,
      3,
    );
    expect(result.macroMetrics.fiber.total).toBe(2);
    expect(result.macroMetrics.fiber.per1000Kcal).toBeCloseTo(1.493, 3);
    expect(result.macroMetrics.fiber.dryMatterPercent).toBeCloseTo(0.69, 3);
    expect(result.macroMetrics.ash.total).toBe(5);
    expect(result.macroMetrics.ash.per1000Kcal).toBeCloseTo(3.733, 3);
    expect(result.macroMetrics.ash.dryMatterPercent).toBeCloseTo(1.724, 3);
    expect(result.macroMetrics.moisture).toMatchObject({
      total: 610,
      dryMatterPercent: null,
    });
    expect(result.macroMetrics.energyDensity.per1000Kcal).toBeNull();
    expect(result.macroMetrics.energyDensity.dryMatterPercent).toBeNull();
    expect(result.macroMetrics.energyDensity.total).toBeCloseTo(1488.333, 3);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'item-beef',
        ratioPercent: 44.44444444444444,
      }),
      expect.objectContaining({
        id: 'item-rice',
        ratioPercent: 55.55555555555556,
      }),
    ]);
    expect(result.normalizedToKg).toBe(false);
  });

  it('keeps per-energy assessment stable when the same recipe is doubled', () => {
    const base = assessRecipeDraft(makeInput(1));
    const doubled = assessRecipeDraft(makeInput(2));

    expect(base.totalWeightG).toBe(900);
    expect(doubled.totalWeightG).toBe(1800);
    expect(doubled.nutrients.crudeProtein.per1000Kcal).toBeCloseTo(
      base.nutrients.crudeProtein.per1000Kcal,
      8,
    );
  });

  it('attaches per-ingredient nutrient contributors sorted by contribution share', () => {
    const result = assessRecipeDraft(makeInput());

    expect(result.entries[0].contributors).toEqual([
      expect.objectContaining({
        itemId: 'item-beef',
        itemName: '牛肉',
        weightG: 400,
        amount: 80,
        unit: 'g',
        missing: false,
      }),
      expect.objectContaining({
        itemId: 'item-rice',
        itemName: '米饭',
        weightG: 500,
        amount: 12.5,
        unit: 'g',
        missing: false,
      }),
    ]);
    expect(result.entries[0].contributors?.[0].contributionPercent).toBeCloseTo(
      86.486,
      3,
    );
    expect(result.entries[0].contributors?.[1].contributionPercent).toBeCloseTo(
      13.514,
      3,
    );
    expect(
      result.groupedEntries[0].details[0].contributors?.map(
        (contributor) => contributor.itemName,
      ),
    ).toEqual(['牛肉', '米饭']);
  });

  it('counts serving-based supplement nutrients without forcing an unknown gram weight', () => {
    const input = makeInput();
    input.items.push({
      id: 'item-calcium-capsule',
      name: '钙胶囊',
      weightG: 2,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING', servingUnitLabel: '粒' },
        macros: {
          energyKcal: 0,
          moisture: 0,
        },
        minerals: {
          calcium: 200,
        },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
    });
    input.targets = [
      {
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 700,
        maxValue: null,
        fieldPaths: ['minerals.calcium'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.totalWeightG).toBe(900);
    expect(result.items.find((item) => item.id === 'item-calcium-capsule')).toMatchObject({
      ratioPercent: 0,
    });
    expect(result.nutrients.calcium.total).toBe(490);
    expect(result.entries[0].contributors?.[0]).toMatchObject({
      itemId: 'item-calcium-capsule',
      amount: 400,
      amountUnit: '粒',
      unit: 'mg',
      contributionPercent: 81.63265306122449,
      missing: false,
    });
  });

  it('converts current nutrient values into the standard target unit', () => {
    const input = makeInput();
    input.items[0].nutritionProfile!.fattyAcids = {
      ...input.items[0].nutritionProfile!.fattyAcids,
      arachidonicAcid: 0.02,
    };
    input.items[1].nutritionProfile!.fattyAcids = {
      ...input.items[1].nutritionProfile!.fattyAcids,
      arachidonicAcid: 0,
    };
    input.targets = [
      {
        nutrientKey: 'arachidonicAcid',
        label: '花生四烯酸',
        category: 'FATTY_ACID',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 40,
        maxValue: null,
        fieldPaths: ['fattyAcids.arachidonicAcid'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'arachidonicAcid',
      label: '花生四烯酸',
      unit: 'mg',
      status: 'COMPLIANT',
    });
    expect(result.entries[0].currentValue).toBeCloseTo(59.724, 3);
    expect(result.nutrients.arachidonicAcid.per1000Kcal).toBeCloseTo(59.724, 3);
    expect(result.entries[0].contributors?.[0]).toMatchObject({
      itemId: 'item-beef',
      amount: 80,
      unit: 'mg',
      contributionPercent: 100,
    });
  });

  it('treats missing nutrient fields as zero while preserving an internal marker', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'iodine',
        label: '碘',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'μg',
        minValue: 220,
        maxValue: null,
        fieldPaths: ['minerals.iodine'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('NON_COMPLIANT');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'iodine',
      status: 'DEFICIENT',
      currentValue: 0,
      missingAsZero: true,
    });
    expect(result.nutrients.iodine).toMatchObject({
      total: 0,
      per1000Kcal: 0,
      missingAsZero: true,
    });
  });

  it('keeps nutrients without recommendation bounds as reference rows outside attention totals', () => {
    const input = makeInput();
    input.items[0].nutritionProfile!.vitamins = {
      vitaminK: 10,
    };
    input.items[1].nutritionProfile!.vitamins = {
      vitaminK: 0,
    };
    input.targets = [
      adultProteinTarget,
      {
        nutrientKey: 'vitaminK',
        label: '维生素 K',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'μg',
        minValue: null,
        maxValue: null,
        fieldPaths: ['vitamins.vitaminK'],
      },
    ];

    const result = assessRecipeDraft(input);
    const vitaminK = result.groupedEntries.find(
      (entry) => entry.nutrientKey === 'vitaminK',
    );

    expect(vitaminK).toMatchObject({
      nutrientKey: 'vitaminK',
      status: 'INFO',
      minValue: null,
      maxValue: null,
      excludeFromAttention: true,
    });
    expect(vitaminK?.currentValue).toBeCloseTo(29.862, 3);
    expect(result.summary).toEqual({
      compliant: 1,
      deficient: 0,
      excess: 0,
      missingData: 0,
    });
    expect(result.rawSummary).toEqual(result.summary);
    expect(result.overallStatus).toBe('COMPLIANT');
  });

  it('groups repeated FEDIAF expression bases into one mobile assessment row and summary count', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_MJ_ME',
        unit: 'g',
        minValue: 20,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_100G_DRY_MATTER',
        unit: 'g',
        minValue: 18,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries).toHaveLength(3);
    expect(result.rawSummary).toEqual({
      compliant: 2,
      deficient: 1,
      excess: 0,
      missingData: 0,
    });
    expect(result.groupedEntries).toHaveLength(1);
    expect(result.groupedEntries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      label: '粗蛋白',
      status: 'COMPLIANT',
      detailCount: 3,
      expressionBasis: 'PER_1000_KCAL_ME',
    });
    expect(result.groupedEntries[0].details.map((entry) => entry.expressionBasis)).toEqual([
      'PER_1000_KCAL_ME',
      'PER_MJ_ME',
      'PER_100G_DRY_MATTER',
    ]);
    expect(result.summary).toEqual({
      compliant: 1,
      deficient: 0,
      excess: 0,
      missingData: 0,
    });
  });

  it('does not apply the selenium legal maximum to fresh-food-only recipes', () => {
    const input = makeInput();
    input.items = [
      {
        id: 'item-salmon',
        name: '三文鱼',
        ingredientType: 'FOOD',
        weightG: 100,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: completeAtwaterMacros({
            energyKcal: 296,
            moisture: 50,
          }),
          minerals: {
            selenium: 29.008,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        } as any,
      } as any,
    ];
    input.targets = [
      {
        nutrientKey: 'selenium',
        label: '硒',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'μg',
        minValue: 100,
        maxValue: null,
        fieldPaths: ['minerals.selenium'],
      },
      {
        nutrientKey: 'selenium',
        label: '硒',
        category: 'MINERAL',
        expressionBasis: 'PER_100G_DRY_MATTER',
        unit: 'μg',
        minValue: 40,
        maxValue: 56.8,
        fieldPaths: ['minerals.selenium'],
      },
    ];

    const result = assessRecipeDraft(input);
    const grouped = result.groupedEntries[0];
    const perEnergy = grouped.details.find(
      (entry) => entry.expressionBasis === 'PER_1000_KCAL_ME',
    );
    const dryMatter = grouped.details.find(
      (entry) => entry.expressionBasis === 'PER_100G_DRY_MATTER',
    );

    expect(result.dryMatterEnergyKcalPer100g).toBeCloseTo(592, 3);
    expect(grouped).toMatchObject({
      nutrientKey: 'selenium',
      status: 'DEFICIENT',
    });
    expect(perEnergy).toMatchObject({
      nutrientKey: 'selenium',
      status: 'DEFICIENT',
      minValue: 100,
      maxValue: null,
    });
    expect(perEnergy?.currentValue).toBeCloseTo(98, 3);
    expect(perEnergy?.maxValueLabel).toBeUndefined();
    expect(perEnergy?.maxValueNote).toBeUndefined();
    expect(perEnergy?.rangeConflict).toBeUndefined();
    expect(dryMatter).toMatchObject({
      nutrientKey: 'selenium',
      status: 'COMPLIANT',
      minValue: 40,
      maxValue: null,
    });
  });

  it('applies the selenium legal maximum to total selenium when a selenium supplement is present', () => {
    const input = makeInput();
    input.items = [
      {
        id: 'item-salmon',
        name: '三文鱼',
        ingredientType: 'FOOD',
        weightG: 100,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: completeAtwaterMacros({
            energyKcal: 296,
            moisture: 50,
          }),
          minerals: {
            selenium: 29.008,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        } as any,
      } as any,
      {
        id: 'item-selenium-supplement',
        name: '硒补剂',
        ingredientType: 'SUPPLEMENT',
        weightG: 1,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_1_G' },
          macros: {
            energyKcal: 0,
            moisture: 0,
          },
          minerals: {
            selenium: 0.1,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        } as any,
      } as any,
    ];
    input.targets = [
      {
        nutrientKey: 'selenium',
        label: '硒',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'μg',
        minValue: 100,
        maxValue: null,
        fieldPaths: ['minerals.selenium'],
      },
      {
        nutrientKey: 'selenium',
        label: '硒',
        category: 'MINERAL',
        expressionBasis: 'PER_100G_DRY_MATTER',
        unit: 'μg',
        minValue: 40,
        maxValue: 56.8,
        fieldPaths: ['minerals.selenium'],
      },
    ];

    const result = assessRecipeDraft(input);
    const perEnergy = result.groupedEntries[0].details.find(
      (entry) => entry.expressionBasis === 'PER_1000_KCAL_ME',
    );

    expect(result.dryMatterEnergyKcalPer100g).toBeCloseTo(580.392, 3);
    expect(perEnergy).toMatchObject({
      nutrientKey: 'selenium',
      status: 'EXCESS',
      maxValueLabel: '欧盟法定上限',
      rangeConflict: true,
    });
    expect(perEnergy?.currentValue).toBeCloseTo(98.338, 3);
    expect(perEnergy?.maxValue).toBeCloseTo(97.865, 3);
    expect(perEnergy?.maxValueNote).toContain('含硒补剂');
    expect(perEnergy?.maxValueNote).toContain('欧盟法律');
    expect(perEnergy?.maxValueNote).toContain('不代表中国法规');
    expect(perEnergy?.maxValueNote).toContain('总硒');
    expect(perEnergy?.rangeConflictNote).toContain('无可行区间');
  });

  it.each([
    ['copper', '铜', 'minerals.copper', 'mg', 2.8, 0.6],
    ['iodine', '碘', 'minerals.iodine', 'mg', 1.1, 500],
    ['iron', '铁', 'minerals.iron', 'mg', 68.18, 20],
    ['manganese', '锰', 'minerals.manganese', 'mg', 17, 4],
    ['zinc', '锌', 'minerals.zinc', 'mg', 22.7, 5],
  ] as const)(
    'converts %s dry-matter legal maximum into the per-energy display basis',
    (nutrientKey, label, fieldPath, unit, dryMatterLegalMax, currentPer100g) => {
      const input = makeInput();
      const mineralKey = fieldPath.replace('minerals.', '');
      input.items = [
        {
          id: 'item-salmon',
          name: '三文鱼',
          weightG: 100,
          nutritionProfile: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: completeAtwaterMacros({
              energyKcal: 296,
              moisture: 50,
            }),
            minerals: {
              [mineralKey]: currentPer100g,
            },
            vitamins: {},
            fattyAcids: {},
            aminoAcids: {},
            customItems: [],
          } as any,
        },
      ];
      input.targets = [
        {
          nutrientKey,
          label,
          category: 'MINERAL',
          expressionBasis: 'PER_1000_KCAL_ME',
          unit,
          minValue: null,
          maxValue: null,
          fieldPaths: [fieldPath],
        },
        {
          nutrientKey,
          label,
          category: 'MINERAL',
          expressionBasis: 'PER_100G_DRY_MATTER',
          unit,
          minValue: null,
          maxValue: dryMatterLegalMax,
          fieldPaths: [fieldPath],
        },
      ];

      const result = assessRecipeDraft(input);
      const perEnergy = result.groupedEntries[0].details.find(
        (entry) => entry.expressionBasis === 'PER_1000_KCAL_ME',
      );

      expect(result.dryMatterEnergyKcalPer100g).toBeCloseTo(592, 3);
      expect(perEnergy).toMatchObject({
        nutrientKey,
        maxValueLabel: '欧盟法定上限',
      });
      expect(perEnergy?.maxValue).toBeCloseTo(
        (dryMatterLegalMax * 1000) / 592,
        3,
      );
      expect(perEnergy?.maxValueNote).toContain('欧盟法定上限按干物质给出');
      expect(perEnergy?.maxValueNote).toContain('欧盟法律');
      expect(perEnergy?.maxValueNote).toContain('不代表中国法规');
    },
  );

  it('uses the per-1000-kcal entry as the grouped assessment status when dry-matter vitamin D disagrees', () => {
    const input = makeInput();
    input.items = [
      {
        id: 'item-vitamin-d',
        name: '维生素 D 示例',
        weightG: 100,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: completeAtwaterMacros({
            energyKcal: 250,
            moisture: 50,
          }),
          minerals: {},
          vitamins: {
            vitaminD: 137,
          },
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        } as any,
      },
    ];
    input.targets = [
      {
        nutrientKey: 'vitaminD',
        label: '维生素 D',
        category: 'VITAMIN',
        expressionBasis: 'PER_100G_DRY_MATTER',
        unit: 'IU',
        minValue: 55.2,
        maxValue: 227,
        fieldPaths: ['vitamins.vitaminD'],
      },
      {
        nutrientKey: 'vitaminD',
        label: '维生素 D',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'IU',
        minValue: 138,
        maxValue: 568,
        fieldPaths: ['vitamins.vitaminD'],
      },
      {
        nutrientKey: 'vitaminD',
        label: '维生素 D',
        category: 'VITAMIN',
        expressionBasis: 'PER_MJ_ME',
        unit: 'IU',
        minValue: 33,
        maxValue: 135.76,
        fieldPaths: ['vitamins.vitaminD'],
      },
    ];

    const result = assessRecipeDraft(input);
    const vitaminD = result.groupedEntries[0];
    const dryMatterDetail = vitaminD.details.find(
      (entry) => entry.expressionBasis === 'PER_100G_DRY_MATTER',
    );

    expect(dryMatterDetail).toMatchObject({
      status: 'EXCESS',
      currentValue: 274,
      maxValue: 227,
    });
    expect(vitaminD).toMatchObject({
      nutrientKey: 'vitaminD',
      expressionBasis: 'PER_1000_KCAL_ME',
      status: 'COMPLIANT',
      currentValue: 548,
      maxValue: 568,
    });
    expect(result.summary).toMatchObject({
      compliant: 1,
      excess: 0,
    });
  });

  it.each([
    ['ADULT_MER_95', 70, 'seleniumWetDiet'],
    ['ADULT_MER_95', 30, 'seleniumWetDiet'],
    ['ADULT_MER_110', 10, 'seleniumDryDiet'],
  ] as const)(
    'selects one adult selenium diet target for %s when recipe moisture is %d%%',
    (scenario, moisture, expectedNutrientKey) => {
      const input = makeInput();
      input.scenario = scenario;
      input.items = [
        {
          id: 'item-test',
          name: '测试食材',
          weightG: 100,
          nutritionProfile: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: completeAtwaterMacros({
              energyKcal: 100,
              moisture,
            }),
            minerals: {
              selenium: 5,
            },
            vitamins: {},
            fattyAcids: {},
            aminoAcids: {},
            customItems: [],
          } as any,
        },
      ];
      input.targets = [
        {
          nutrientKey: 'seleniumWetDiet',
          label: '硒',
          category: 'MINERAL',
          expressionBasis: 'PER_1000_KCAL_ME',
          unit: 'μg',
          minValue: 27,
          maxValue: null,
          fieldPaths: ['minerals.selenium'],
        },
        {
          nutrientKey: 'seleniumDryDiet',
          label: '硒',
          category: 'MINERAL',
          expressionBasis: 'PER_1000_KCAL_ME',
          unit: 'μg',
          minValue: 22,
          maxValue: null,
          fieldPaths: ['minerals.selenium'],
        },
      ];

      const result = assessRecipeDraft(input);

      expect(result.groupedEntries.map((entry) => entry.nutrientKey)).toEqual([
        expectedNutrientKey,
      ]);
      expect(result.entries.map((entry) => entry.nutrientKey)).toEqual([
        expectedNutrientKey,
      ]);
    },
  );

  it.each([
    ['EARLY_GROWTH_REPRODUCTION', 25, 0.82, 0.92],
    ['LATE_GROWTH', 20, 0.74, 0.89],
    ['ADULT_MER_110', 18, 0.52, 0.69],
    ['ADULT_MER_95', 21, 0.6, 0.74],
  ] as const)(
    'raises arginine minimum with dry-matter protein for %s',
    (scenario, baseProteinDm, baseArginineDm, expectedArginineDm) => {
      const input: DesignRecipeAssessmentInput = {
        scenario,
        items: [
          {
            id: 'item-high-protein',
            name: '高蛋白样品',
            weightG: 100,
            nutritionProfile: {
              meta: { rawBasisType: 'PER_100_G' },
              macros: completeAtwaterMacros({
                energyKcal: 400,
                moisture: 0,
                crudeProtein: 35,
              }),
              aminoAcids: {
                arginine: 0.91,
              },
              minerals: {},
              vitamins: {},
              fattyAcids: {},
              customItems: [],
            } as any,
          },
        ],
        targets: [
          {
            nutrientKey: 'crudeProtein',
            label: '粗蛋白',
            category: 'MACRO',
            expressionBasis: 'PER_100G_DRY_MATTER',
            unit: 'g',
            minValue: baseProteinDm,
            maxValue: null,
            fieldPaths: ['macros.crudeProtein'],
          },
          {
            nutrientKey: 'arginine',
            label: '精氨酸',
            category: 'AMINO_ACID',
            expressionBasis: 'PER_1000_KCAL_ME',
            unit: 'g',
            minValue: baseArginineDm * 2.5,
            maxValue: null,
            fieldPaths: ['aminoAcids.arginine'],
          },
          {
            nutrientKey: 'arginine',
            label: '精氨酸',
            category: 'AMINO_ACID',
            expressionBasis: 'PER_MJ_ME',
            unit: 'g',
            minValue: baseArginineDm / (400 * 0.004184),
            maxValue: null,
            fieldPaths: ['aminoAcids.arginine'],
          },
          {
            nutrientKey: 'arginine',
            label: '精氨酸',
            category: 'AMINO_ACID',
            expressionBasis: 'PER_100G_DRY_MATTER',
            unit: 'g',
            minValue: baseArginineDm,
            maxValue: null,
            fieldPaths: ['aminoAcids.arginine'],
          },
        ],
      };

      const result = assessRecipeDraft(input);
      const arginine = result.groupedEntries.find(
        (entry) => entry.nutrientKey === 'arginine',
      );
      const per1000 = arginine?.details.find(
        (entry) => entry.expressionBasis === 'PER_1000_KCAL_ME',
      );
      const perMj = arginine?.details.find(
        (entry) => entry.expressionBasis === 'PER_MJ_ME',
      );
      const dryMatter = arginine?.details.find(
        (entry) => entry.expressionBasis === 'PER_100G_DRY_MATTER',
      );

      expect(result.macroMetrics.crudeProtein.dryMatterPercent).toBe(35);
      expect(dryMatter?.minValue).toBeCloseTo(expectedArginineDm, 8);
      expect(per1000?.minValue).toBeCloseTo(expectedArginineDm * 2.5, 8);
      expect(perMj?.minValue).toBeCloseTo(
        expectedArginineDm / (400 * 0.004184),
        8,
      );
      expect(dryMatter?.minValueNote).toContain('FEDIAF Annex 7.4');
      expect(dryMatter?.minValueNote).toContain('当前粗蛋白 35.00% DM');
      expect(per1000?.minValueNote).toContain('FEDIAF Annex 7.4');
      expect(perMj?.minValueNote).toContain('FEDIAF Annex 7.4');
    },
  );

  it('does not lower the displayed per-energy arginine minimum for high-energy-density recipes', () => {
    const input: DesignRecipeAssessmentInput = {
      scenario: 'EARLY_GROWTH_REPRODUCTION',
      items: [
        {
          id: 'item-salmon',
          name: '三文鱼',
          weightG: 100,
          nutritionProfile: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: completeAtwaterMacros({
              energyKcal: 296,
              moisture: 50,
              crudeProtein: 29.08,
            }),
            aminoAcids: {
              arginine: 1.74,
            },
            minerals: {},
            vitamins: {},
            fattyAcids: {},
            customItems: [],
          } as any,
        },
      ],
      targets: [
        {
          nutrientKey: 'crudeProtein',
          label: '粗蛋白',
          category: 'MACRO',
          expressionBasis: 'PER_100G_DRY_MATTER',
          unit: 'g',
          minValue: 25,
          maxValue: null,
          fieldPaths: ['macros.crudeProtein'],
        },
        {
          nutrientKey: 'arginine',
          label: '精氨酸',
          category: 'AMINO_ACID',
          expressionBasis: 'PER_1000_KCAL_ME',
          unit: 'g',
          minValue: 2.04,
          maxValue: null,
          fieldPaths: ['aminoAcids.arginine'],
        },
        {
          nutrientKey: 'arginine',
          label: '精氨酸',
          category: 'AMINO_ACID',
          expressionBasis: 'PER_MJ_ME',
          unit: 'g',
          minValue: 0.49,
          maxValue: null,
          fieldPaths: ['aminoAcids.arginine'],
        },
        {
          nutrientKey: 'arginine',
          label: '精氨酸',
          category: 'AMINO_ACID',
          expressionBasis: 'PER_100G_DRY_MATTER',
          unit: 'g',
          minValue: 0.82,
          maxValue: null,
          fieldPaths: ['aminoAcids.arginine'],
        },
      ],
    };

    const result = assessRecipeDraft(input);
    const arginine = result.groupedEntries.find(
      (entry) => entry.nutrientKey === 'arginine',
    );
    const per1000 = arginine?.details.find(
      (entry) => entry.expressionBasis === 'PER_1000_KCAL_ME',
    );
    const perMj = arginine?.details.find(
      (entry) => entry.expressionBasis === 'PER_MJ_ME',
    );
    const dryMatter = arginine?.details.find(
      (entry) => entry.expressionBasis === 'PER_100G_DRY_MATTER',
    );

    expect(result.dryMatterEnergyKcalPer100g).toBeCloseTo(592, 8);
    expect(result.macroMetrics.crudeProtein.dryMatterPercent).toBeCloseTo(
      58.16,
      8,
    );
    expect(dryMatter?.minValue).toBeCloseTo(1.1516, 8);
    expect(per1000?.minValue).toBeGreaterThan(2.04);
    expect(per1000?.minValue).toBeCloseTo(2.869, 8);
    expect(perMj?.minValue).toBeCloseTo(0.68813576, 8);
  });

  it('preserves labelled sodium reference upper bounds in assessment entries', () => {
    const input = makeInput();
    input.items = [
      {
        id: 'item-sodium',
        name: '高钠样品',
        weightG: 100,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: completeAtwaterMacros({
            energyKcal: 100,
            moisture: 70,
          }),
          minerals: {
            sodium: 400,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        } as any,
      },
    ];
    input.targets = [
      {
        nutrientKey: 'sodium',
        label: '钠',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 0.22,
        maxValue: 3.75,
        maxValueLabel: '参考上限',
        maxValueNote:
          'FEDIAF 2025 未设钠的正式最高限值。脚注 c 指出，健康犬钠水平至 3.75g/1000kcal ME 有安全性数据支持。',
        fieldPaths: ['minerals.sodium'],
      } as any,
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'sodium',
      currentValue: 4,
      maxValue: 3.75,
      maxValueLabel: '参考上限',
      status: 'EXCESS',
    });
    expect(result.entries[0].maxValueNote).toContain('脚注 c');
  });

  it('uses the conservative late-growth calcium lower bound in compliance status', () => {
    const input = makeInput();
    input.scenario = 'LATE_GROWTH';
    input.items = [
      {
        id: 'item-calcium',
        name: '钙测试食材',
        weightG: 100,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: completeAtwaterMacros({
            energyKcal: 100,
            moisture: 70,
          }),
          minerals: {
            calcium: 220,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        } as any,
      },
    ];
    input.targets = [
      {
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 2.5,
        maxValue: 4.5,
        minValueNote:
          '当前默认按 2.50g/1000kcal ME 保守评估；成年预期体重 <=15kg 的幼犬可参考 2.00g/1000kcal ME。',
        fieldPaths: ['minerals.calcium'],
      } as any,
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'calcium',
      currentValue: 2.2,
      minValue: 2.5,
      status: 'DEFICIENT',
    });
    expect(result.entries[0]).not.toHaveProperty('referenceBounds');
  });

  it('calculates calcium phosphorus ratio as a ratio entry', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        maxValueNote: '大型/巨型犬约6月龄前默认按 1.6:1 评估。',
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0].status).toBe('DEFICIENT');
    expect(result.entries[0].currentValue).toBeCloseTo(10 / 180, 4);
    expect(result.entries[0].maxValueNote).toContain('1.6:1');
  });

  it('still calculates the calcium phosphorus ratio when the target is categorized under minerals', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'MINERAL',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        maxValueNote: '大型/巨型犬约6月龄前默认按 1.6:1 评估。',
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'ca_p_ratio',
      category: 'MINERAL',
      status: 'DEFICIENT',
    });
    expect(result.entries[0].currentValue).toBeCloseTo(10 / 180, 4);
  });

  it('keeps the sum target category when a combination belongs to a base nutrient group', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'methionineCystine',
        label: '蛋氨酸 + 胱氨酸',
        category: 'AMINO_ACID',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 1,
        maxValue: null,
        fieldPaths: ['aminoAcids.methionine', 'aminoAcids.cystine'],
        calculation: 'SUM',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'methionineCystine',
      category: 'AMINO_ACID',
    });
  });

  it('adds omega-6 to omega-3 ratio as an informational fatty acid entry', () => {
    const input = makeInput();
    input.items = [
      {
        id: 'item-fish',
        name: '脂肪酸测试食材',
        weightG: 100,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: completeAtwaterMacros({
            energyKcal: 200,
            moisture: 70,
          }),
          minerals: {},
          vitamins: {},
          fattyAcids: {
            linoleicAcid: 2,
            arachidonicAcid: 0.1,
            alphaLinolenicAcid: 0.3,
            epa: 100,
            dpa: 50,
            dha: 250,
          },
          aminoAcids: {},
          customItems: [],
        } as any,
      },
    ];
    input.targets = [];

    const result = assessRecipeDraft(input);
    const omegaRatio = result.groupedEntries.find(
      (entry) => entry.nutrientKey === 'omega6Omega3Ratio',
    );

    expect(omegaRatio).toMatchObject({
      label: 'Omega-6:Omega-3',
      category: 'FATTY_ACID',
      expressionBasis: 'RATIO',
      unit: ':1',
      minValue: null,
      maxValue: null,
      status: 'INFO',
      excludeFromAttention: true,
    });
    expect(omegaRatio?.currentValue).toBeCloseTo(3, 4);
  });

  it('treats a fully missing ratio target as zero instead of user-facing missing data', () => {
    const input = makeInput();
    for (const item of input.items) {
      const profile = item.nutritionProfile as any;
      profile.minerals.calcium = null;
      profile.minerals.phosphorus = null;
    }
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'ca_p_ratio',
      status: 'DEFICIENT',
      currentValue: 0,
      missingAsZero: true,
    });
    expect(result.summary).toEqual({
      compliant: 0,
      deficient: 1,
      excess: 0,
      missingData: 0,
    });
    expect(result.overallStatus).toBe('NON_COMPLIANT');
  });

  it('marks ratio targets with mixed field units as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'energy_protein_ratio',
        label: '能量蛋白比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['macros.energyKcal', 'macros.crudeProtein'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'energy_protein_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets with duplicate field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'duplicate_ratio_paths',
        label: '重复比例路径',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.calcium'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'duplicate_ratio_paths',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets missing when denominator aggregate overflows', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.minerals.calcium = 10;
    profile.minerals.phosphorus = Number.MAX_VALUE;
    input.targets = [
      {
        nutrientKey: 'overflow_ratio',
        label: '溢出比例',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 0,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'overflow_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio entries missing when numerator or denominator values are negative', () => {
    for (const fieldPath of ['calcium', 'phosphorus']) {
      const input = makeInput();
      const beefProfile = input.items[0].nutritionProfile as any;
      beefProfile.minerals[fieldPath] = -10;
      input.targets = [
        {
          nutrientKey: `negative_${fieldPath}_ratio`,
          label: '负数比例',
          category: 'RATIO',
          expressionBasis: 'RATIO',
          unit: ':1',
          minValue: 1,
          maxValue: 2,
          fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
          calculation: 'RATIO',
        },
      ];

      const result = assessRecipeDraft(input);

      expect(result.entries[0]).toMatchObject({
        nutrientKey: `negative_${fieldPath}_ratio`,
        status: 'MISSING_DATA',
        currentValue: null,
      });
    }
  });

  it('treats a missing target nutrient field as zero for that item', () => {
    const input = makeInput();
    const beefProfile = input.items[0].nutritionProfile as any;
    const riceProfile = input.items[1].nutritionProfile as any;
    beefProfile.minerals.zinc = 10;
    riceProfile.minerals.zinc = null;
    input.targets = [
      {
        nutrientKey: 'zinc',
        label: '锌',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 20,
        maxValue: null,
        fieldPaths: ['minerals.zinc'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('COMPLIANT');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'zinc',
      status: 'COMPLIANT',
      currentValue: 29.861888764464353,
      missingAsZero: true,
    });
    expect(result.entries[0].contributors?.find((entry) => entry.itemId === 'item-rice')).toMatchObject({
      amount: 0,
      missing: false,
      missingAsZero: true,
    });
    expect(result.nutrients.zinc).toMatchObject({
      total: 40,
      per1000Kcal: 29.861888764464353,
      missingAsZero: true,
    });
  });

  it('marks negative target nutrient values as missing data', () => {
    const input = makeInput();
    const beefProfile = input.items[0].nutritionProfile as any;
    beefProfile.macros.crudeProtein = -5;

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('does not let supplement macro gaps hide per-energy values for the whole recipe', () => {
    const input = makeInput();
    input.items.push({
      id: 'item-calcium',
      name: '碳酸钙粉',
      ingredientType: 'SUPPLEMENT',
      weightG: 1,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: {},
        minerals: { calcium: 40000 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
    });

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeCloseTo(1339.5, 3);
    expect(result.energyDensityKcalPerKg).toBeCloseTo(1486.681, 3);
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'COMPLIANT',
    });
    expect(result.entries[0].currentValue).toBeCloseTo(69.056, 3);
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeCloseTo(69.056, 3);
  });

  it('uses dog Atwater macro fields when source energy is missing', () => {
    const input = makeInput();
    const riceProfile = input.items[1].nutritionProfile as any;
    riceProfile.macros.energyKcal = null;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeCloseTo(1339.5, 3);
    expect(result.energyDensityKcalPerKg).toBeCloseTo(1488.333, 3);
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'COMPLIANT',
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeCloseTo(69.056, 3);
  });

  it('uses dog Atwater macro fields when source energy is invalid', () => {
    const input = makeInput();
    const beefProfile = input.items[0].nutritionProfile as any;
    beefProfile.macros.energyKcal = -200;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeCloseTo(1339.5, 3);
    expect(result.energyDensityKcalPerKg).toBeCloseTo(1488.333, 3);
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'COMPLIANT',
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeCloseTo(69.056, 3);
  });

  it('marks per-energy targets missing when aggregate energy overflows', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.macros.moisture = Number.MAX_VALUE;
    profile.macros.crudeProtein = 20;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeNull();
  });

  it('marks dry-matter targets missing when any positive-weight item lacks moisture', () => {
    const input = makeInput();
    const riceProfile = input.items[1].nutritionProfile as any;
    riceProfile.macros.moisture = null;
    input.targets = [
      {
        nutrientKey: 'crudeProteinDm',
        label: '粗蛋白 DM',
        category: 'MACRO',
        expressionBasis: 'PER_100G_DRY_MATTER',
        unit: 'g',
        minValue: 18,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.dryMatterG).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProteinDm',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('rejects negative and non-finite item weights at the domain boundary', () => {
    for (const weightG of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const input = makeInput();
      input.items[0].weightG = weightG;

      expect(() => assessRecipeDraft(input)).toThrow(
        'Recipe assessment item weightG must be a finite non-negative number',
      );
    }
  });

  it('marks targets with empty field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'empty_target',
        label: '空目标',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: null,
        maxValue: null,
        fieldPaths: [],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'empty_target',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks non-ratio targets with malformed field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'null_field_paths',
        label: '空路径',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: null as any,
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'null_field_paths',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets with malformed field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'null_ratio_paths',
        label: '空比例路径',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: null as any,
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'null_ratio_paths',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks assessments without targets as incomplete', () => {
    const input = makeInput();
    input.targets = [];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries).toEqual([]);
    expect(result.nutrients).toEqual({});
    expect(result.summary).toEqual({
      compliant: 0,
      deficient: 0,
      excess: 0,
      missingData: 0,
    });
  });

  it('marks null target entries as missing data without throwing', () => {
    const input = makeInput();
    input.targets = [null as any];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks targets with malformed expression basis as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'bad_basis',
        label: '异常表达基准',
        category: 'MACRO',
        expressionBasis: 'PER_BOWL' as any,
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'bad_basis',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks targets with malformed category as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'unknown_category',
        label: '未知分类',
        category: 'UNKNOWN' as any,
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'unknown_category',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio calculations with malformed expression basis as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'bad_ratio_basis',
        label: '异常比例表达基准',
        category: 'RATIO',
        expressionBasis: 'PER_BOWL' as any,
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'bad_ratio_basis',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('calculates explicit ratio targets from standard-table expression bases', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio_per_energy',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('NON_COMPLIANT');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'ca_p_ratio_per_energy',
      status: 'DEFICIENT',
    });
    expect(result.entries[0].currentValue).toBeCloseTo(10 / 180, 4);
    expect(result.summary).toEqual({
      compliant: 0,
      deficient: 1,
      excess: 0,
      missingData: 0,
    });
  });

  it('marks ratio category targets with non-ratio expression basis as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ratio_category_normal_basis',
        label: '比例分类普通表达',
        category: 'RATIO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'ratio_category_normal_basis',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks unbounded targets as reference data instead of missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'unbounded_protein',
        label: '无界蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: null,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'unbounded_protein',
      status: 'INFO',
      excludeFromAttention: true,
      minValue: null,
      maxValue: null,
    });
    expect(result.entries[0].currentValue).toBeCloseTo(69.056, 3);
    expect(result.summary.compliant).toBe(0);
  });

  it('marks malformed ratio targets as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'malformed_ratio',
        label: '异常比例',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'malformed_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets with extra field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'extra_path_ratio',
        label: '多路径比例',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: [
          'minerals.calcium',
          'minerals.phosphorus',
          'macros.crudeProtein',
        ],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'extra_path_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('converts per-1g nutrition profiles to per-100g assessment totals', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_1_G';
    profile.macros.energyKcal = 2;
    profile.macros.moisture = 0;
    profile.macros.crudeProtein = 0.2;
    profile.macros.crudeFat = 0;
    profile.macros.ash = 0.5;
    profile.macros.fiber = 0;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBe(200);
    expect(result.nutrients.crudeProtein.total).toBe(20);
  });

  it('treats volume-based profiles without density as missing data', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_100_ML';
    delete profile.meta.densityGPerMl;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeNull();
    expect(result.energyDensityKcalPerKg).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: 45,
      maxValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('treats structured profiles with missing raw basis as missing data', () => {
    const input = makeInput();
    const profile = input.items[0].nutritionProfile as any;
    delete profile.meta.rawBasisType;

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('treats structured profiles with invalid raw basis as missing data', () => {
    const input = makeInput();
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_BUCKET';

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('treats legacy mixed-basis profiles as missing instead of applying the first item basis globally', () => {
    const input = makeInput();
    input.items = [
      {
        id: 'legacy-item',
        name: '历史数据',
        weightG: 100,
        nutritionProfile: {
          items: [
            {
              nutrientName: '能量',
              value: 2,
              unit: 'kcal',
              basisType: 'PER_1_G',
            },
            {
              nutrientName: '粗蛋白',
              value: 20,
              unit: 'g',
              basisType: 'PER_100_G',
            },
          ],
        },
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('converts per-100ml nutrition profiles with density to per-100g totals', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_100_ML';
    profile.meta.densityGPerMl = 1.2;
    profile.macros.energyKcal = 240;
    profile.macros.moisture = 0;
    profile.macros.crudeProtein = 24;
    profile.macros.crudeFat = 0;
    profile.macros.ash = 60;
    profile.macros.fiber = 0;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBe(200);
    expect(result.nutrients.crudeProtein.total).toBe(20);
  });

  it('marks targets with non-finite bounds as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'invalid_bounds',
        label: '异常上下限',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: Number.NaN,
        maxValue: Number.POSITIVE_INFINITY,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'invalid_bounds',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: null,
      maxValue: null,
    });
  });

  it('marks targets with unknown calculation as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'unknown_calculation',
        label: '未知计算',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
        calculation: 'AVERAGE' as any,
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'unknown_calculation',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks targets with negative bounds as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'negative_bound',
        label: '负数下限',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: -1,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'negative_bound',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: null,
      maxValue: null,
    });
  });

  it('marks targets with inverted finite bounds as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'inverted_bounds',
        label: '倒置上下限',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 10,
        maxValue: 5,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'inverted_bounds',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: 10,
      maxValue: 5,
    });
  });

  it('does not add expression-basis ratio targets to nutrient totals', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0].currentValue).toBeCloseTo(10 / 180, 4);
    expect(result.nutrients.ca_p_ratio).toBeUndefined();
  });

  it('supports per-MJ energy assessment', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'crudeProteinPerMj',
        label: '粗蛋白 MJ',
        category: 'MACRO',
        expressionBasis: 'PER_MJ_ME',
        unit: 'g',
        minValue: 10,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProteinPerMj',
      status: 'COMPLIANT',
    });
    expect(result.entries[0].currentValue).toBeCloseTo(
      92.5 / (1339.5 * 0.004184),
      6,
    );
  });

  it('sums multiple field paths for combination targets', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'protein_fat_combo',
        label: '蛋白脂肪组合',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 80,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein', 'macros.crudeFat'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.nutrients.protein_fat_combo.total).toBeCloseTo(134, 8);
    expect(result.entries[0].currentValue).toBeCloseTo((134 / 1339.5) * 1000, 8);
  });

  it('marks direct nutrient targets with multiple field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'calcium_phosphorus_direct',
        label: '钙磷直接目标',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 100,
        maxValue: null,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'calcium_phosphorus_direct',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.calcium_phosphorus_direct.total).toBeNull();
  });

  it('marks duplicate field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'duplicate_protein',
        label: '重复蛋白',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein', 'macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'duplicate_protein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.duplicate_protein.total).toBeNull();
  });

  it('marks combination targets with incompatible field units as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'protein_calcium_combo',
        label: '蛋白钙组合',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein', 'minerals.calcium'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'protein_calcium_combo',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.protein_calcium_combo.total).toBeNull();
  });

  it('marks non-finite derived current values as missing data', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.macros.energyKcal = 1;
    profile.macros.moisture = 0;
    profile.macros.crudeProtein = Number.MAX_VALUE;

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks per-energy targets missing when dog Atwater energy is zero', () => {
    const input = makeInput();
    const beefProfile = input.items[0].nutritionProfile as any;
    const riceProfile = input.items[1].nutritionProfile as any;
    beefProfile.macros.moisture = 100;
    beefProfile.macros.crudeProtein = 0;
    beefProfile.macros.crudeFat = 0;
    beefProfile.macros.ash = 0;
    beefProfile.macros.fiber = 0;
    riceProfile.macros.moisture = 100;
    riceProfile.macros.crudeProtein = 0;
    riceProfile.macros.crudeFat = 0;
    riceProfile.macros.ash = 0;
    riceProfile.macros.fiber = 0;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBe(0);
    expect(result.energyDensityKcalPerKg).toBe(0);
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeNull();
  });
});

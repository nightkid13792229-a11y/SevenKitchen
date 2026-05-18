import { mapNzfcdComponentsToNutritionProfile } from '../../../src/domain/nutrition-governance/nzfcd-nutrient-map';

const component = (
  componentCode: string,
  componentShortname: string,
  numValue: number,
  unitAbbr: string,
) => ({
  component_code: componentCode,
  component_shortname: componentShortname,
  num_value: numValue,
  unit_abbr: unitAbbr,
});

describe('NZFCD nutrient map', () => {
  it('maps green-lipped mussel nutrients into the project nutrition profile', () => {
    const profile = mapNzfcdComponentsToNutritionProfile([
      component(
        'ENERC_FSANZ2_KCAL',
        'Energy, total metabolisable, available carbohydrate, FSANZ (kcal)',
        74,
        'kcal/100g',
      ),
      component('WATER', 'Water', 81.3, 'g/100g'),
      component(
        'PROT',
        'Protein, total; calculated from total nitrogen',
        10.7,
        'g/100g',
      ),
      component('FAT', 'Fat, total', 1.81, 'g/100g'),
      component('ASH', 'Ash', 2.3, 'g/100g'),
      component('CHOAVL_FSANZ', 'Available carbohydrate, FSANZ', 3.7, 'g/100g'),
      component('FIBTG', 'Fibre, total dietary', 0, 'g/100g'),
      component('CA', 'Calcium', 66, 'mg/100g'),
      component('P', 'Phosphorus', 147, 'mg/100g'),
      component('MN', 'Manganese', 160, 'µg/100g'),
      component('ID', 'Iodide', 110, 'µg/100g'),
      component(
        'VITA_RAE',
        'Vitamin A, retinol activity equivalents',
        64,
        'µg/100g',
      ),
      component('VITD', 'Vitamin D; calculated by summation', 1.1, 'µg/100g'),
      component('TOCPHA', 'Alpha-tocopherol', 0.97, 'mg/100g'),
      component('F20D5N3', 'Fatty acid 20:5 omega-3', 0.271, 'g/100g'),
      component('F22D6N3', 'Fatty acid 22:6 omega-3', 0.21, 'g/100g'),
      component('TRP_G', 'Tryptophan (g)', 0.13, 'g/100g'),
      component('GLUS', 'Glucose', 0.7, 'g/100g'),
    ]);

    expect(profile.meta).toMatchObject({
      sourceType: 'NZFCD',
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'NZFCD_FOODFILES',
      sourceProvider: 'New Zealand Food Composition Database',
      rawBasisType: 'PER_100_G',
    });
    expect(profile.macros.energyKcal).toBe(74);
    expect(profile.macros.crudeProtein).toBe(10.7);
    expect(profile.minerals.manganese).toBe(0.16);
    expect(profile.minerals.iodine).toBe(110);
    expect(profile.vitamins.vitaminA).toBeCloseTo(213.333, 3);
    expect(profile.vitamins.vitaminD).toBe(44);
    expect(profile.vitamins.vitaminE).toBeCloseTo(1.4453, 4);
    expect(profile.fattyAcids.epa).toBe(271);
    expect(profile.fattyAcids.dha).toBe(210);
    expect(profile.aminoAcids.tryptophan).toBe(0.13);

    expect(profile.meta.sourceForms?.['minerals.iodine']).toMatchObject({
      sourceNutrientId: 'ID',
      sourceNutrientName: 'Iodide',
      originalValue: 110,
      canonicalUnit: 'μg',
    });
    expect(
      profile.customItems.map((item) => item.sourceNutrientId),
    ).not.toContain('GLUS');
  });

  it('keeps related vitamin A and E forms as review-only source items', () => {
    const profile = mapNzfcdComponentsToNutritionProfile([
      component(
        'VITA_RAE',
        'Vitamin A, retinol activity equivalents',
        64,
        'µg/100g',
      ),
      component('RETOL', 'Retinol', 55, 'µg/100g'),
      component('CARTB', 'Beta-carotene', 94, 'µg/100g'),
      component(
        'VITE',
        'Vitamin E, alpha-tocopherol equivalents',
        0.97,
        'mg/100g',
      ),
    ]);

    expect(profile.vitamins.vitaminA).toBeCloseTo(213.333, 3);
    expect(profile.customItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNutrientId: 'RETOL',
          canonicalFieldPath: 'vitamins.vitaminA',
          reviewCategory: 'NZFCD_VITAMIN_A_RELATED',
        }),
        expect.objectContaining({
          sourceNutrientId: 'CARTB',
          canonicalFieldPath: 'vitamins.vitaminA',
          reviewCategory: 'NZFCD_VITAMIN_A_RELATED',
        }),
        expect.objectContaining({
          sourceNutrientId: 'VITE',
          canonicalFieldPath: 'vitamins.vitaminE',
          reviewCategory: 'NZFCD_VITAMIN_E_RELATED',
        }),
      ]),
    );
  });
});

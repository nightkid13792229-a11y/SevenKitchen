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
      component('F18D2N6', 'Fatty acid 18:2 omega-6', 0.271, 'g/100g'),
      component('F18D3N3', 'Fatty acid 18:3 omega-3', 0.033, 'g/100g'),
      component('F20D4N6', 'Fatty acid 20:4 omega-6', 0.012, 'g/100g'),
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
    expect(profile.fattyAcids.linoleicAcid).toBe(0.271);
    expect(profile.fattyAcids.alphaLinolenicAcid).toBe(0.033);
    expect(profile.fattyAcids.arachidonicAcid).toBe(0.012);
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

  it('uses related retinol and beta-carotene forms for FEDIAF dog vitamin A activity', () => {
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

    expect(profile.vitamins.vitaminA).toBeCloseTo(261.635333, 6);
    expect(profile.meta.sourceForms?.['vitamins.vitaminA']).toMatchObject({
      sourceNutrientId: 'NZFCD:RETOL+CARTB',
      sourceNutrientName: 'Vitamin A activity from retinol and beta-carotene',
      sourceCompound: 'retinol + beta-carotene',
      vitaminAForm: 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY',
      canonicalValue: 261.635333,
      conversionFactorSource: 'FEDIAF_2025_TABLE_VII_14',
      retinolUg: 55,
      betaCaroteneUg: 94,
    });
    expect(profile.customItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNutrientId: 'VITE',
          canonicalFieldPath: 'vitamins.vitaminE',
          reviewCategory: 'NZFCD_VITAMIN_E_RELATED',
        }),
      ]),
    );
    expect(profile.customItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceNutrientId: 'RETOL' }),
        expect.objectContaining({ sourceNutrientId: 'CARTB' }),
      ]),
    );
  });

  it('uses NZFCD alpha-tocopherol equivalents when alpha-tocopherol is absent', () => {
    const profile = mapNzfcdComponentsToNutritionProfile([
      component(
        'VITE',
        'Vitamin E, alpha-tocopherol equivalents',
        2,
        'mg/100g',
      ),
    ]);

    expect(profile.vitamins.vitaminE).toBeCloseTo(2.98, 6);
    expect(profile.meta.sourceForms?.['vitamins.vitaminE']).toMatchObject({
      sourceNutrientId: 'VITE',
      sourceNutrientName: 'Vitamin E, alpha-tocopherol equivalents',
      originalValue: 2,
      canonicalValue: 2.98,
      canonicalUnit: 'IU',
      vitaminEForm: 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT',
    });
    expect(profile.meta.conversionNotes?.['vitamins.vitaminE']).toContain(
      '不额外估算',
    );
  });

  it('maps NZFCD dietary fibre split fields when soluble and insoluble fibre components are present', () => {
    const profile = mapNzfcdComponentsToNutritionProfile([
      component('FIBSOL', 'Fibre, water-soluble', 1, 'g/100g'),
      component('FIBINS', 'Fibre, water-insoluble', 3.2, 'g/100g'),
    ]);

    expect(profile.macros.solubleFiber).toBe(1);
    expect(profile.macros.insolubleFiber).toBe(3.2);
    expect(profile.meta.sourceForms?.['macros.solubleFiber']).toMatchObject({
      sourceNutrientId: 'FIBSOL',
      sourceNutrientName: 'Fibre, water-soluble',
      originalValue: 1,
      canonicalValue: 1,
      canonicalUnit: 'g',
    });
  });

  it('uses split tocopherol components for FEDIAF vitamin E activity when NZFCD provides them', () => {
    const profile = mapNzfcdComponentsToNutritionProfile([
      component(
        'VITE',
        'Vitamin E, alpha-tocopherol equivalents',
        1.3,
        'mg/100g',
      ),
      component('TOCPHA', 'Alpha-tocopherol', 0.82, 'mg/100g'),
      component('TOCPHB', 'Beta-tocopherol', 0.08, 'mg/100g'),
      component('TOCPHG', 'Gamma-tocopherol', 4, 'mg/100g'),
      component('TOCPHD', 'Delta-tocopherol', 0.01, 'mg/100g'),
    ]);

    expect(profile.vitamins.vitaminE).toBeCloseTo(1.2907, 6);
    expect(profile.meta.sourceForms?.['vitamins.vitaminE']).toMatchObject({
      sourceNutrientId: 'NZFCD:TOCPHA+TOCPHB+TOCPHG+TOCPHD',
      sourceNutrientName: 'Vitamin E tocopherol component activity',
      conversionStatus: 'COMPONENT_ACTIVITY',
      canonicalValue: 1.2907,
      canonicalUnit: 'IU',
      alphaTocopherolMg: 0.82,
      betaTocopherolMg: 0.08,
      gammaTocopherolMg: 4,
      deltaTocopherolMg: 0.01,
    });
  });
});

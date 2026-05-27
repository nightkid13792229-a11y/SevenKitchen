import {
  buildRedSweetPepperFoundationOnlyProfile,
  buildRedSweetPepperPrimaryProfile,
} from '../../../src/domain/nutrition-governance/red-sweet-pepper-foundation-upgrade';

const legacySupplementNutrients = [
  {
    nutrient: { id: 1105, name: 'Retinol', unitName: 'µg' },
    amount: 0,
  },
  {
    nutrient: { id: 1107, name: 'Carotene, beta', unitName: 'µg' },
    amount: 1624,
  },
  {
    nutrient: {
      id: 1109,
      name: 'Vitamin E (alpha-tocopherol)',
      unitName: 'mg',
    },
    amount: 1.58,
  },
  {
    nutrient: { id: 1125, name: 'Tocopherol, beta', unitName: 'mg' },
    amount: 0.05,
  },
  {
    nutrient: { id: 1126, name: 'Tocopherol, gamma', unitName: 'mg' },
    amount: 0.14,
  },
  {
    nutrient: { id: 1127, name: 'Tocopherol, delta', unitName: 'mg' },
    amount: 0.01,
  },
  {
    nutrient: { id: 1180, name: 'Choline, total', unitName: 'mg' },
    amount: 5.6,
  },
  {
    nutrient: { id: 1269, name: 'PUFA 18:2', unitName: 'g' },
    amount: 0.1,
  },
  {
    nutrient: { id: 1214, name: 'Lysine', unitName: 'g' },
    amount: 0.036,
  },
];

describe('red sweet pepper Foundation upgrade', () => {
  it('uses USDA Foundation as the primary source for available raw red bell pepper fields', () => {
    const profile = buildRedSweetPepperPrimaryProfile({
      legacyFoodNutrients: legacySupplementNutrients,
    });

    expect(profile.meta.externalId).toBe('2258590');
    expect(profile.meta.sourceVersion).toBe('USDA_FDC_FOUNDATION:2026-04-30');
    expect(profile.macros.energyKcal).toBe(27);
    expect(profile.macros.moisture).toBe(91.9);
    expect(profile.vitamins.vitaminC).toBe(142);
    expect(profile.vitamins.vitaminB7).toBe(0.427);
    expect(profile.meta.sourceForms?.['vitamins.vitaminB7']).toMatchObject({
      sourceRole: 'PROFILE_PRIMARY',
      sourceKey: 'USDA:2258590',
      sourceNutrientId: 1176,
      sourceNutrientName: 'Biotin',
    });
  });

  it('keeps SR Legacy as a field supplement for nutrients absent from Foundation', () => {
    const profile = buildRedSweetPepperPrimaryProfile({
      legacyFoodNutrients: legacySupplementNutrients,
    });

    expect(profile.vitamins.vitaminA).toBeCloseTo(1352.792, 6);
    expect(profile.vitamins.vitaminE).toBeCloseTo(2.3746, 6);
    expect(profile.vitamins.choline).toBe(5.6);
    expect(profile.fattyAcids.linoleicAcid).toBe(0.1);
    expect(profile.aminoAcids.lysine).toBe(0.036);

    expect(profile.meta.sourceForms?.['vitamins.vitaminA']).toMatchObject({
      sourceRole: 'FIELD_SUPPLEMENT',
      sourceKey: 'USDA:170108',
      vitaminAForm: 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY',
    });
    expect(profile.meta.sourceForms?.['vitamins.vitaminE']).toMatchObject({
      sourceRole: 'FIELD_SUPPLEMENT',
      sourceKey: 'USDA:170108',
      vitaminEForm: 'FEDIAF_TOCOPHEROL_ACTIVITY',
    });
    expect(profile.customItems.map((item) => item.name)).not.toEqual(
      expect.arrayContaining([
        'Tocopherol, beta',
        'Tocopherol, gamma',
        'Tocopherol, delta',
      ]),
    );
  });

  it('can build a Foundation-only source record profile without SR Legacy supplements', () => {
    const profile = buildRedSweetPepperFoundationOnlyProfile();

    expect(profile.macros.moisture).toBe(91.9);
    expect(profile.vitamins.vitaminB7).toBe(0.427);
    expect(profile.vitamins.choline).toBeNull();
    expect(profile.meta.sourceForms?.['macros.energyKcal']).toMatchObject({
      sourceNutrientId: 2048,
      sourceNutrientName: 'Energy (Atwater Specific Factors)',
      sourceKey: 'USDA:2258590',
    });
  });
});

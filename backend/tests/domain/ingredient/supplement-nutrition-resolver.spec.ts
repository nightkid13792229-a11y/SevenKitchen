import { resolveSupplementNutrients } from '../../../src/domain/ingredient/supplement-nutrition-resolver';

describe('resolveSupplementNutrients', () => {
  it('resolves supplement nutrient concentration from structured nutrition profile instead of legacy active_nutrients', () => {
    const result = resolveSupplementNutrients({
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING', servingWeightG: 0.5 },
        macros: {},
        minerals: {},
        vitamins: {
          vitaminE: 200,
        },
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
      fallback: {
        维生素E: { value: 100, unit: 'IU' },
      },
    });

    expect(result['维生素E']).toEqual({ value: 200, unit: 'IU' });
  });

  it('keeps legacy fallback when nutrition profile is missing', () => {
    const result = resolveSupplementNutrients({
      nutritionProfile: null,
      fallback: {
        碘: { value: 325, unit: 'μg' },
      },
    });

    expect(result).toEqual({
      碘: { value: 325, unit: 'μg' },
    });
  });

  it('derives EPA+DHA and preserves custom nutrient items', () => {
    const result = resolveSupplementNutrients({
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: {},
        vitamins: {},
        fattyAcids: {
          epa: 0.3,
          dha: 0.4,
        },
        aminoAcids: {},
        customItems: [
          {
            name: '辅酶Q10',
            value: 25,
            unit: 'mg',
          },
        ],
      } as any,
    });

    expect(result['EPA']).toEqual({ value: 0.3, unit: 'g' });
    expect(result['DHA']).toEqual({ value: 0.4, unit: 'g' });
    expect(result['EPA+DHA']).toEqual({ value: 0.7, unit: 'g' });
    expect(result['辅酶Q10']).toEqual({ value: 25, unit: 'mg' });
  });

  it('upgrades legacy items[] payloads before building supplement nutrients', () => {
    const result = resolveSupplementNutrients({
      nutritionProfile: {
        items: [
          {
            nutrientCode: 'iodine',
            nutrientName: '碘',
            value: 150,
            unit: 'μg',
            basisType: 'PER_1_PCS',
          },
          {
            nutrientCode: 'vitamin_e',
            nutrientName: '维生素 E',
            value: 200,
            unit: 'IU',
            basisType: 'PER_1_PCS',
          },
        ],
      } as any,
    });

    expect(result['碘']).toEqual({ value: 150, unit: 'μg' });
    expect(result['维生素E']).toEqual({ value: 200, unit: 'IU' });
  });
});

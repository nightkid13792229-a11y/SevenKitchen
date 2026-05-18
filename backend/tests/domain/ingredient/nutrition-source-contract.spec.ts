import {
  getNutritionSourceDefinition,
  normalizeLegacyNutritionSourceType,
} from '../../../src/domain/ingredient/nutrition-source-contract';

describe('nutrition source contract', () => {
  it('maps legacy USDA source type to registered USDA FoodData Central source metadata', () => {
    expect(normalizeLegacyNutritionSourceType('USDA')).toEqual({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceProvider: 'USDA FoodData Central',
    });
  });

  it('keeps supplement labels distinct from food databases', () => {
    expect(normalizeLegacyNutritionSourceType('SUPPLEMENT_LABEL')).toEqual({
      sourceKind: 'PRODUCT_LABEL',
      sourceCode: 'SUPPLEMENT_LABEL',
      sourceProvider: 'Product label',
    });
  });

  it('registers future food database codes without requiring a Prisma enum change', () => {
    expect(getNutritionSourceDefinition('NZFCD_FOODFILES')).toMatchObject({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'NZFCD_FOODFILES',
      sourceProvider: 'New Zealand Food Composition Database',
    });
    expect(getNutritionSourceDefinition('CNF')).toMatchObject({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'CNF',
    });
    expect(getNutritionSourceDefinition('AUSNUT')).toMatchObject({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'AUSNUT',
    });
  });

  it('returns undefined for unknown or blank source values', () => {
    expect(getNutritionSourceDefinition('UNKNOWN_SOURCE')).toBeUndefined();
    expect(getNutritionSourceDefinition(null)).toBeUndefined();
    expect(normalizeLegacyNutritionSourceType('')).toBeUndefined();
    expect(normalizeLegacyNutritionSourceType(undefined)).toBeUndefined();
  });

  it('returns source definition copies so callers cannot mutate the global registry', () => {
    const usdaDefinition = getNutritionSourceDefinition('USDA_FDC');
    expect(usdaDefinition).toBeDefined();

    usdaDefinition!.sourceProvider = 'Mutated provider';
    usdaDefinition!.sourceCode = 'CFCT';

    expect(getNutritionSourceDefinition('USDA_FDC')).toEqual({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceProvider: 'USDA FoodData Central',
    });

    const legacyDefinition = normalizeLegacyNutritionSourceType('USDA');
    legacyDefinition!.sourceKind = 'PRODUCT_LABEL';

    expect(normalizeLegacyNutritionSourceType('USDA')).toEqual({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceProvider: 'USDA FoodData Central',
    });
    expect(normalizeLegacyNutritionSourceType('NZFCD')).toEqual({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'NZFCD_FOODFILES',
      sourceProvider: 'New Zealand Food Composition Database',
    });
  });
});

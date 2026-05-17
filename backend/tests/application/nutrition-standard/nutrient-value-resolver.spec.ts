import { FEDIAF_2025_DOG_NUTRIENTS } from '../../../src/application/nutrition-standard/fediaf-2025-dog.data';
import {
  nutritionDataToNutritionProfile,
  resolveStandardNutrientValue,
} from '../../../src/application/nutrition-standard/nutrient-value-resolver';

const findDefinition = (code: string) => {
  const definition = FEDIAF_2025_DOG_NUTRIENTS.find(
    (nutrient) => nutrient.code === code,
  );

  if (!definition) {
    throw new Error(`Missing FEDIAF nutrient definition for ${code}`);
  }

  return definition;
};

describe('nutrient value resolver', () => {
  it('normalizes nutrition food data and resolves FEDIAF direct, derived, and ratio nutrients', () => {
    const profile = nutritionDataToNutritionProfile({
      protein_g: 18,
      calcium_mg: 240,
      phosphorus_mg: 120,
      epa_mg: 300,
      dha_mg: 200,
      iodine_mcg: 150,
    });

    expect(
      resolveStandardNutrientValue(profile, findDefinition('crudeProtein')),
    ).toMatchObject({
      status: 'RESOLVED',
      value: 18,
      unit: 'g',
      sourceFieldPaths: ['macros.crudeProtein'],
    });

    expect(
      resolveStandardNutrientValue(profile, findDefinition('calcium')),
    ).toMatchObject({
      status: 'RESOLVED',
      value: 0.24,
      unit: 'g',
      sourceFieldPaths: ['minerals.calcium'],
    });

    expect(
      resolveStandardNutrientValue(profile, findDefinition('epaDha')),
    ).toMatchObject({
      status: 'RESOLVED',
      value: 0.5,
      unit: 'g',
      sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
    });

    expect(
      resolveStandardNutrientValue(
        profile,
        findDefinition('calciumPhosphorusRatio'),
      ),
    ).toMatchObject({
      status: 'RESOLVED',
      value: 2,
      unit: 'ratio',
      sourceFieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
    });

    expect(
      resolveStandardNutrientValue(profile, findDefinition('iodine')),
    ).toMatchObject({
      status: 'RESOLVED',
      value: 0.15,
      unit: 'mg',
      sourceFieldPaths: ['minerals.iodine'],
    });
  });

  it('reports missing expression inputs with field paths for auditability', () => {
    const profile = nutritionDataToNutritionProfile({
      epa_mg: 300,
    });

    expect(
      resolveStandardNutrientValue(profile, findDefinition('epaDha')),
    ).toMatchObject({
      status: 'MISSING_INPUT',
      value: null,
      unit: 'g',
      sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
      missingFieldPaths: ['fattyAcids.dha'],
    });
  });
});

import { getNutritionProfileFieldValue } from './nutrition-field-catalog';
import { normalizeNutritionProfile } from './nutrition-profile.utils';
import type { NutritionProfile } from './types';

export interface SupplementConcentrationResolution {
  concentrationPerUnit: number;
  doseUnit: 'g' | 'ml' | 'serving';
  concentrationPerG?: number;
  servingWeightG?: number;
}

const SUPPORTED_RAW_BASIS_TYPES = new Set([
  'PER_1_G',
  'PER_100_G',
  'PER_SERVING',
  'PER_1_ML',
  'PER_100_ML',
]);

export function resolveSupplementConcentration(
  nutritionProfile: NutritionProfile | null | undefined,
  fieldPath: string,
): SupplementConcentrationResolution | undefined {
  const explicitRawBasisType = (nutritionProfile as any)?.meta?.rawBasisType;
  if (
    typeof explicitRawBasisType === 'string' &&
    !SUPPORTED_RAW_BASIS_TYPES.has(explicitRawBasisType)
  ) {
    return undefined;
  }

  const profile = normalizeNutritionProfile(nutritionProfile);
  const value = getNutritionProfileFieldValue(profile, fieldPath);
  if (!(value && value > 0)) {
    return undefined;
  }

  switch (profile?.meta.rawBasisType) {
    case 'PER_1_G':
      return {
        concentrationPerUnit: value,
        doseUnit: 'g',
        concentrationPerG: value,
      };
    case 'PER_100_G':
      return {
        concentrationPerUnit: value / 100,
        doseUnit: 'g',
        concentrationPerG: value / 100,
      };
    case 'PER_SERVING': {
      const servingWeightG =
        profile.meta.servingWeightG && profile.meta.servingWeightG > 0
          ? profile.meta.servingWeightG
          : undefined;
      return {
        concentrationPerUnit: value,
        doseUnit: 'serving',
        servingWeightG,
        concentrationPerG: servingWeightG ? value / servingWeightG : undefined,
      };
    }
    case 'PER_1_ML':
      return { concentrationPerUnit: value, doseUnit: 'ml' };
    case 'PER_100_ML':
      return { concentrationPerUnit: value / 100, doseUnit: 'ml' };
    default:
      return undefined;
  }
}

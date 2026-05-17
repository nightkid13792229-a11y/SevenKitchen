import { getNutritionProfileFieldValue } from '../ingredient/nutrition-field-catalog';
import {
  isLegacyNutritionProfile,
  normalizeNutritionProfile,
} from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../ingredient/types';

type SupportedRawBasisType =
  | 'PER_100_G'
  | 'PER_1_G'
  | 'PER_100_ML'
  | 'PER_1_ML'
  | 'PER_SERVING';

export interface NutritionProfileValueRead {
  valuePer100g: number | null;
  missing: boolean;
}

export function readProfileValuePer100g(
  profile: NutritionProfile | null | undefined,
  fieldPath: string,
): NutritionProfileValueRead {
  const value = getNutritionProfileFieldValue(profile, fieldPath);
  const normalized = normalizeNutritionProfile(profile);
  const rawBasisType = getStrictRawBasisType(profile);

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    !normalized ||
    !rawBasisType
  ) {
    return { valuePer100g: null, missing: true };
  }

  const densityGPerMl = normalized.meta.densityGPerMl;
  const servingWeightG = normalized.meta.servingWeightG;

  switch (rawBasisType) {
    case 'PER_100_G':
      return { valuePer100g: value, missing: false };
    case 'PER_1_G':
      return { valuePer100g: value * 100, missing: false };
    case 'PER_100_ML':
      return isPositiveFiniteNumber(densityGPerMl)
        ? { valuePer100g: value / densityGPerMl, missing: false }
        : { valuePer100g: null, missing: true };
    case 'PER_1_ML':
      return isPositiveFiniteNumber(densityGPerMl)
        ? { valuePer100g: (value * 100) / densityGPerMl, missing: false }
        : { valuePer100g: null, missing: true };
    case 'PER_SERVING':
      return isPositiveFiniteNumber(servingWeightG)
        ? { valuePer100g: (value * 100) / servingWeightG, missing: false }
        : { valuePer100g: null, missing: true };
  }
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getStrictRawBasisType(
  profile: NutritionProfile | null | undefined,
): SupportedRawBasisType | null {
  if (!profile) return null;

  if (isLegacyNutritionProfile(profile)) {
    return null;
  }

  const rawBasisType = (profile as any).meta?.rawBasisType;
  return isSupportedRawBasisType(rawBasisType) ? rawBasisType : null;
}

function isSupportedRawBasisType(value: unknown): value is SupportedRawBasisType {
  return (
    value === 'PER_100_G' ||
    value === 'PER_1_G' ||
    value === 'PER_100_ML' ||
    value === 'PER_1_ML' ||
    value === 'PER_SERVING'
  );
}

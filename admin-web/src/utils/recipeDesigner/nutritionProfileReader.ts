import { getNutritionProfileFieldValue } from './nutritionFieldCatalog';
import {
  isLegacyNutritionProfile,
  normalizeNutritionProfile,
} from './nutritionProfileUtils';
import type { NutritionProfile } from './nutritionProfileTypes';

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

export interface NutritionProfileAmountRead {
  amount: number | null;
  missing: boolean;
  missingAsZero?: boolean;
}

interface NutritionProfileReadOptions {
  missingValueAsZero?: boolean;
}

export function getProfileEffectiveWeightG(
  profile: NutritionProfile | null | undefined,
  amount: number,
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const normalized = normalizeNutritionProfile(profile);
  const rawBasisType = getStrictRawBasisType(profile);
  if (!normalized || !rawBasisType) {
    return amount;
  }

  switch (rawBasisType) {
    case 'PER_100_G':
    case 'PER_1_G':
      return amount;
    case 'PER_100_ML':
    case 'PER_1_ML':
      if (usesDirectAmountUnit(normalized, 'ml')) {
        return isPositiveFiniteNumber(normalized.meta.densityGPerMl)
          ? amount * normalized.meta.densityGPerMl
          : 0;
      }
      return isPositiveFiniteNumber(normalized.meta.densityGPerMl)
        ? amount * normalized.meta.densityGPerMl
        : 0;
    case 'PER_SERVING':
      if (usesDirectServingUnit(normalized)) {
        return isPositiveFiniteNumber(normalized.meta.servingWeightG)
          ? amount * normalized.meta.servingWeightG
          : 0;
      }
      return amount;
  }
}

function usesDirectAmountUnit(
  profile: NutritionProfile,
  unit: string,
): boolean {
  const meta = (profile as any).meta ?? {};
  return meta.amountUnitLabel === unit || meta.usageUnit === unit;
}

function usesDirectServingUnit(profile: NutritionProfile): boolean {
  const meta = (profile as any).meta ?? {};
  return Boolean(meta.servingUnitLabel || meta.amountUnitLabel || meta.usageUnit);
}

function readProfileValuePerGramAmount(
  profile: NutritionProfile,
  fieldPath: string,
  amount: number,
): NutritionProfileAmountRead {
  const read = readProfileValuePer100g(profile, fieldPath);
  if (read.missing || read.valuePer100g === null) {
    return { amount: null, missing: true };
  }
  return { amount: (read.valuePer100g * amount) / 100, missing: false };
}

function readProfileVolumeAmount(
  value: number,
  amount: number,
  basisType: 'PER_1_ML' | 'PER_100_ML',
): NutritionProfileAmountRead {
  return {
    amount: basisType === 'PER_1_ML' ? value * amount : (value * amount) / 100,
    missing: false,
  };
}

function readProfileServingAmount(
  value: number,
  amount: number,
): NutritionProfileAmountRead {
  return { amount: value * amount, missing: false };
}

export function readProfileFieldAmount(
  profile: NutritionProfile | null | undefined,
  fieldPath: string,
  amount: number,
  options: NutritionProfileReadOptions = {},
): NutritionProfileAmountRead {
  if (!Number.isFinite(amount) || amount < 0) {
    return { amount: null, missing: true };
  }
  if (amount === 0) {
    return { amount: 0, missing: false };
  }

  const value = getNutritionProfileFieldValue(profile, fieldPath);
  const normalized = normalizeNutritionProfile(profile);
  const rawBasisType = getStrictRawBasisType(profile);

  if (!normalized || !rawBasisType) {
    return { amount: null, missing: true };
  }

  if (value === null || value === undefined) {
    return options.missingValueAsZero
      ? { amount: 0, missing: false, missingAsZero: true }
      : { amount: null, missing: true };
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { amount: null, missing: true };
  }

  switch (rawBasisType) {
    case 'PER_100_G':
    case 'PER_1_G':
      return readProfileValuePerGramAmount(normalized, fieldPath, amount);
    case 'PER_100_ML':
    case 'PER_1_ML':
      return usesDirectAmountUnit(normalized, 'ml')
        ? readProfileVolumeAmount(value, amount, rawBasisType)
        : readProfileValuePerGramAmount(normalized, fieldPath, amount);
    case 'PER_SERVING':
      return usesDirectServingUnit(normalized)
        ? readProfileServingAmount(value, amount)
        : readProfileValuePerGramAmount(normalized, fieldPath, amount);
  }
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

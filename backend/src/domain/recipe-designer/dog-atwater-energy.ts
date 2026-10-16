import type { NutritionProfile } from '../ingredient/types';
import { readProfileValuePer100g } from './nutrition-profile-reader';

export type DogAtwaterEnergyField =
  | 'moisture'
  | 'crudeProtein'
  | 'crudeFat'
  | 'ash'
  | 'fiber';

export interface DogAtwaterEnergyCalculation {
  energyKcalPer100g: number | null;
  nfeGPer100g: number | null;
  missingFields: DogAtwaterEnergyField[];
  invalidReasons: string[];
}

const DOG_ATWATER_REQUIRED_FIELDS = [
  'moisture',
  'crudeProtein',
  'crudeFat',
  'ash',
  'fiber',
] as const satisfies readonly DogAtwaterEnergyField[];

/**
 * 各字段在营养档案里的路径。
 *
 * 2026-10-16（批次 5.3）改成导出：`dataGaps`（"哪个原料缺哪个字段"）
 * 需要它把缺口说成人话。此前后台那边自己有一份副本。
 */
export const DOG_ATWATER_FIELD_PATHS = {
  moisture: 'macros.moisture',
  crudeProtein: 'macros.crudeProtein',
  crudeFat: 'macros.crudeFat',
  ash: 'macros.ash',
  fiber: 'macros.fiber',
} as const satisfies Record<DogAtwaterEnergyField, string>;

/** 字段中文名，用于把「哪个原料缺哪个字段」直接说给用户听 */
export const DOG_ATWATER_FIELD_LABELS = {
  moisture: '水分',
  crudeProtein: '粗蛋白',
  crudeFat: '粗脂肪',
  ash: '灰分',
  fiber: '膳食纤维',
} as const satisfies Record<DogAtwaterEnergyField, string>;

const NFE_NEGATIVE_TOLERANCE_G_PER_100G = 2;

export function calculateDogAtwaterEnergyPer100g(
  profile: NutritionProfile | null | undefined,
): DogAtwaterEnergyCalculation {
  return auditDogAtwaterProfile(profile);
}

export function auditDogAtwaterProfile(
  profile: NutritionProfile | null | undefined,
): DogAtwaterEnergyCalculation {
  const values = {} as Record<DogAtwaterEnergyField, number>;
  const missingFields: DogAtwaterEnergyField[] = [];
  const invalidReasons: string[] = [];

  for (const field of DOG_ATWATER_REQUIRED_FIELDS) {
    const read = readProfileValuePer100g(
      profile,
      DOG_ATWATER_FIELD_PATHS[field],
    );
    if (read.missing || read.valuePer100g === null) {
      missingFields.push(field);
      continue;
    }
    values[field] = read.valuePer100g;
  }

  if (missingFields.length > 0) {
    return {
      energyKcalPer100g: null,
      nfeGPer100g: null,
      missingFields,
      invalidReasons,
    };
  }

  const nfeGPer100g =
    100 -
    values.moisture -
    values.crudeProtein -
    values.crudeFat -
    values.ash -
    values.fiber;

  if (nfeGPer100g < -NFE_NEGATIVE_TOLERANCE_G_PER_100G) {
    invalidReasons.push('NFE_BY_DIFFERENCE_NEGATIVE');
  }

  const normalizedNfeGPer100g = Math.max(nfeGPer100g, 0);
  const energyKcalPer100g =
    4 * values.crudeProtein +
    9 * values.crudeFat +
    4 * normalizedNfeGPer100g;

  if (!Number.isFinite(energyKcalPer100g) || energyKcalPer100g < 0) {
    invalidReasons.push('DOG_ATWATER_ENERGY_INVALID');
  }

  return {
    energyKcalPer100g:
      invalidReasons.length > 0 ? null : energyKcalPer100g,
    nfeGPer100g,
    missingFields,
    invalidReasons,
  };
}

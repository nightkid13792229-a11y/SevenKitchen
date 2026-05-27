import type { NutritionSourceForm } from '../ingredient/types';

export type CfctFattyAcidCanonicalUnit = 'g' | 'mg';

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function calculateCfctFattyAcidGFromPercent(input: {
  totalFattyAcidsG: number | null | undefined;
  percentOfTotalFattyAcids: number | null | undefined;
}): number | null {
  return calculateCfctFattyAcidValueFromPercent({
    ...input,
    targetUnit: 'g',
  });
}

export function calculateCfctFattyAcidValueFromPercent(input: {
  totalFattyAcidsG: number | null | undefined;
  percentOfTotalFattyAcids: number | null | undefined;
  targetUnit: CfctFattyAcidCanonicalUnit;
}): number | null {
  const totalFattyAcidsG = finite(input.totalFattyAcidsG);
  const percent = finite(input.percentOfTotalFattyAcids);
  if (totalFattyAcidsG === null || percent === null) {
    return null;
  }

  const valueG = (totalFattyAcidsG * percent) / 100;
  return round(input.targetUnit === 'mg' ? valueG * 1000 : valueG);
}

export function buildCfctFattyAcidPercentMetadata(input: {
  sourceNutrientId: string;
  sourceNutrientName: string;
  totalFattyAcidsG: number;
  percentOfTotalFattyAcids: number;
  canonicalValueG?: number;
  canonicalValue?: number;
  canonicalUnit?: CfctFattyAcidCanonicalUnit;
}): NutritionSourceForm {
  const canonicalUnit = input.canonicalUnit ?? 'g';
  const canonicalValue = input.canonicalValue ?? input.canonicalValueG ?? null;
  const usesMgUnit = canonicalUnit === 'mg';

  return {
    sourceNutrientId: input.sourceNutrientId,
    sourceNutrientName: input.sourceNutrientName,
    originalValue: input.percentOfTotalFattyAcids,
    originalUnit: '% of total fatty acids',
    canonicalValue,
    canonicalUnit,
    basisType: 'PER_100_G',
    cfctFattyAcidTotalG: input.totalFattyAcidsG,
    conversionFormula: usesMgUnit
      ? 'single fatty acid mg/100g = total fatty acids g/100g * percent / 100 * 1000'
      : 'single fatty acid g/100g = total fatty acids g/100g * percent / 100',
    conversionBasis:
      'CFCT fatty acid detail table reports single fatty acids as percent of total fatty acids.',
    ...(usesMgUnit
      ? {
          conversionFactor: 1000,
          conversionFactorUnit: 'MG_PER_G',
        }
      : {}),
  };
}

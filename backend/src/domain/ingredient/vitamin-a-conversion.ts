export type VitaminAForm =
  | 'RETINOL'
  | 'VITAMIN_A_ACETATE'
  | 'VITAMIN_A_PROPIONATE'
  | 'VITAMIN_A_PALMITATE'
  | 'DOG_BETA_CAROTENE'
  | 'FEDIAF_DOG_RETINOL_ACTIVITY'
  | 'FEDIAF_DOG_BETA_CAROTENE_ACTIVITY'
  | 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY'
  | 'SOURCE_DECLARED_IU'
  | 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS'
  | 'UNKNOWN';

export type VitaminASourceForm =
  | 'RETINOL'
  | 'VITAMIN_A_ACETATE'
  | 'VITAMIN_A_PROPIONATE'
  | 'VITAMIN_A_PALMITATE'
  | 'DOG_BETA_CAROTENE'
  | 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS';

export interface VitaminAConversion {
  form: VitaminASourceForm;
  sourceCompound: string;
  ugPerIu?: number;
  iuPerMg?: number;
  source: 'FEDIAF_2025_TABLE_VII_14';
}

export const VITAMIN_A_CONVERSIONS: Readonly<
  Record<VitaminASourceForm, VitaminAConversion>
> = {
  RETINOL: {
    form: 'RETINOL',
    sourceCompound: 'vitamin A alcohol (retinol)',
    ugPerIu: 0.3,
    source: 'FEDIAF_2025_TABLE_VII_14',
  },
  VITAMIN_A_ACETATE: {
    form: 'VITAMIN_A_ACETATE',
    sourceCompound: 'vitamin A acetate',
    ugPerIu: 0.344,
    source: 'FEDIAF_2025_TABLE_VII_14',
  },
  VITAMIN_A_PROPIONATE: {
    form: 'VITAMIN_A_PROPIONATE',
    sourceCompound: 'vitamin A propionate',
    ugPerIu: 0.359,
    source: 'FEDIAF_2025_TABLE_VII_14',
  },
  VITAMIN_A_PALMITATE: {
    form: 'VITAMIN_A_PALMITATE',
    sourceCompound: 'vitamin A palmitate',
    ugPerIu: 0.55,
    source: 'FEDIAF_2025_TABLE_VII_14',
  },
  DOG_BETA_CAROTENE: {
    form: 'DOG_BETA_CAROTENE',
    sourceCompound: 'provitamin A (beta-carotene) for dogs',
    iuPerMg: 833,
    source: 'FEDIAF_2025_TABLE_VII_14',
  },
  SOURCE_RETINOL_ACTIVITY_EQUIVALENTS: {
    form: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
    sourceCompound: 'source-declared retinol activity equivalents',
    ugPerIu: 0.3,
    source: 'FEDIAF_2025_TABLE_VII_14',
  },
};

export type VitaminAActivityStatus =
  | 'DIRECT_FORM_ACTIVITY'
  | 'COMPONENT_ACTIVITY'
  | 'SOURCE_DECLARED_IU_FALLBACK'
  | 'SOURCE_EQUIVALENT_FALLBACK';

export interface VitaminAActivityCalculation {
  valueIu: number;
  status: VitaminAActivityStatus;
  vitaminAForm: VitaminAForm;
  sourceCompound: string;
  note: string;
  components: Record<string, number | null>;
}

function isVitaminASourceForm(form: VitaminAForm): form is VitaminASourceForm {
  return Object.prototype.hasOwnProperty.call(VITAMIN_A_CONVERSIONS, form);
}

export function getVitaminAConversion(
  form: VitaminAForm | null | undefined,
): VitaminAConversion | null {
  if (!form || form === 'UNKNOWN') {
    return null;
  }
  return isVitaminASourceForm(form) ? VITAMIN_A_CONVERSIONS[form] : null;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeUnit(unit: string | null | undefined): string {
  return unit?.trim().toLowerCase().replace('μ', 'µ').replace(/\./g, '') ?? '';
}

function toMicrograms(amount: number, unit: string): number | null {
  const normalizedUnit = normalizeUnit(unit);
  if (normalizedUnit === 'µg' || normalizedUnit === 'mcg') {
    return amount;
  }
  if (normalizedUnit === 'mg') {
    return amount * 1000;
  }
  return null;
}

export function convertVitaminAToIu(
  amount: number,
  unit: string,
  form: VitaminAForm,
): number | null {
  if (!Number.isFinite(amount)) {
    return null;
  }

  if (normalizeUnit(unit) === 'iu') {
    return round(amount);
  }

  const conversion = getVitaminAConversion(form);
  if (!conversion) {
    return null;
  }

  const micrograms = toMicrograms(amount, unit);
  if (micrograms === null) {
    return null;
  }

  if (conversion.ugPerIu) {
    return round(micrograms / conversion.ugPerIu);
  }
  if (conversion.iuPerMg) {
    return round((micrograms / 1000) * conversion.iuPerMg);
  }
  return null;
}

export function calculateVitaminAActivityIu(input: {
  amount?: number | null;
  unit?: string | null;
  form?: VitaminAForm | null;
  retinolUg?: number | null;
  betaCaroteneUg?: number | null;
}): VitaminAActivityCalculation | null {
  const retinolUg = finite(input.retinolUg);
  const betaCaroteneUg = finite(input.betaCaroteneUg);
  if (retinolUg !== null || betaCaroteneUg !== null) {
    const retinolIu = round(
      (retinolUg ?? 0) / VITAMIN_A_CONVERSIONS.RETINOL.ugPerIu!,
    );
    const betaCaroteneIu = round(
      ((betaCaroteneUg ?? 0) / 1000) *
        VITAMIN_A_CONVERSIONS.DOG_BETA_CAROTENE.iuPerMg!,
    );
    const hasRetinol = retinolUg !== null;
    const hasBetaCarotene = betaCaroteneUg !== null;
    return {
      valueIu: round(retinolIu + betaCaroteneIu),
      status: 'COMPONENT_ACTIVITY',
      vitaminAForm:
        hasRetinol && hasBetaCarotene
          ? 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY'
          : hasRetinol
            ? 'FEDIAF_DOG_RETINOL_ACTIVITY'
            : 'FEDIAF_DOG_BETA_CAROTENE_ACTIVITY',
      sourceCompound:
        hasRetinol && hasBetaCarotene
          ? 'retinol + beta-carotene'
          : hasRetinol
            ? 'retinol'
            : 'beta-carotene',
      note:
        'FEDIAF 2025 dog vitamin A activity: retinol 0.3 µg = 1 IU; provitamin A (beta-carotene) in dogs 1 mg = 833 IU.',
      components: {
        retinolUg,
        retinolIu,
        betaCaroteneUg,
        betaCaroteneIu,
      },
    };
  }

  const amount = finite(input.amount);
  const form = input.form ?? null;
  const normalizedUnit = normalizeUnit(input.unit);
  if (amount === null || !form) {
    return null;
  }

  if (normalizedUnit === 'iu') {
    return {
      valueIu: round(amount),
      status: 'SOURCE_DECLARED_IU_FALLBACK',
      vitaminAForm: 'SOURCE_DECLARED_IU',
      sourceCompound: 'source-declared vitamin A activity',
      note:
        '来源仅给出维生素 A IU，未提供视黄醇或犬用 β-胡萝卜素分项；作为 fallback 直接采用并保留来源风险。',
      components: {
        sourceDeclaredIu: amount,
      },
    };
  }

  const valueIu = convertVitaminAToIu(amount, input.unit ?? '', form);
  if (valueIu === null) {
    return null;
  }

  const conversion = getVitaminAConversion(form);
  if (!conversion) {
    return null;
  }

  const isEquivalentFallback =
    form === 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS';
  return {
    valueIu,
    status: isEquivalentFallback
      ? 'SOURCE_EQUIVALENT_FALLBACK'
      : 'DIRECT_FORM_ACTIVITY',
    vitaminAForm: form,
    sourceCompound: conversion.sourceCompound,
    note: isEquivalentFallback
      ? '来源仅给出 retinol activity equivalents / retinol equivalents，未提供可拆分形态；按视黄醇活性换算为 IU 并标记为 fallback。'
      : '来源给出明确维生素 A 形态，按 FEDIAF 2025 犬用维生素 A 活性系数换算。',
    components: {
      sourceAmount: amount,
      sourceAmountIu: valueIu,
    },
  };
}

export function buildVitaminASourceFormMetadata(
  calculation: VitaminAActivityCalculation,
): Record<string, string | number | boolean | null> {
  return {
    vitaminAForm: calculation.vitaminAForm,
    sourceCompound: calculation.sourceCompound,
    conversionStatus: calculation.status,
    conversionFactorSource: 'FEDIAF_2025_TABLE_VII_14',
    retinolUgPerIu: VITAMIN_A_CONVERSIONS.RETINOL.ugPerIu ?? null,
    betaCaroteneIuPerMg:
      VITAMIN_A_CONVERSIONS.DOG_BETA_CAROTENE.iuPerMg ?? null,
    ...calculation.components,
  };
}

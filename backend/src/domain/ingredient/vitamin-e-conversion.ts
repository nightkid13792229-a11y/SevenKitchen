export type VitaminEForm =
  | 'D_ALPHA_TOCOPHEROL'
  | 'D_ALPHA_TOCOPHERYL_ACETATE'
  | 'DL_ALPHA_TOCOPHEROL'
  | 'DL_ALPHA_TOCOPHERYL_ACETATE'
  | 'DL_BETA_TOCOPHEROL'
  | 'DL_GAMMA_TOCOPHEROL'
  | 'DL_DELTA_TOCOPHEROL'
  | 'FEDIAF_TOCOPHEROL_ACTIVITY'
  | 'FEDIAF_CONSERVATIVE_TOCOPHEROL_ACTIVITY'
  | 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT'
  | 'UNKNOWN';

export type VitaminESourceForm =
  | 'D_ALPHA_TOCOPHEROL'
  | 'D_ALPHA_TOCOPHERYL_ACETATE'
  | 'DL_ALPHA_TOCOPHEROL'
  | 'DL_ALPHA_TOCOPHERYL_ACETATE'
  | 'DL_BETA_TOCOPHEROL'
  | 'DL_GAMMA_TOCOPHEROL'
  | 'DL_DELTA_TOCOPHEROL';

export interface VitaminEConversion {
  form: VitaminESourceForm;
  sourceCompound: string;
  iuPerMg: number;
  source: 'FEDIAF_2025';
}

export const VITAMIN_E_CONVERSIONS: Readonly<
  Record<VitaminESourceForm, VitaminEConversion>
> = {
  D_ALPHA_TOCOPHEROL: {
    form: 'D_ALPHA_TOCOPHEROL',
    sourceCompound: 'd-α-tocopherol',
    iuPerMg: 1.49,
    source: 'FEDIAF_2025',
  },
  D_ALPHA_TOCOPHERYL_ACETATE: {
    form: 'D_ALPHA_TOCOPHERYL_ACETATE',
    sourceCompound: 'd-α-tocopheryl acetate',
    iuPerMg: 1.36,
    source: 'FEDIAF_2025',
  },
  DL_ALPHA_TOCOPHEROL: {
    form: 'DL_ALPHA_TOCOPHEROL',
    sourceCompound: 'dl-α-tocopherol',
    iuPerMg: 1.1,
    source: 'FEDIAF_2025',
  },
  DL_ALPHA_TOCOPHERYL_ACETATE: {
    form: 'DL_ALPHA_TOCOPHERYL_ACETATE',
    sourceCompound: 'dl-α-tocopheryl acetate',
    iuPerMg: 1,
    source: 'FEDIAF_2025',
  },
  DL_BETA_TOCOPHEROL: {
    form: 'DL_BETA_TOCOPHEROL',
    sourceCompound: 'dl-β-tocopherol',
    iuPerMg: 0.33,
    source: 'FEDIAF_2025',
  },
  DL_GAMMA_TOCOPHEROL: {
    form: 'DL_GAMMA_TOCOPHEROL',
    sourceCompound: 'dl-γ-tocopherol',
    iuPerMg: 0.01,
    source: 'FEDIAF_2025',
  },
  DL_DELTA_TOCOPHEROL: {
    form: 'DL_DELTA_TOCOPHEROL',
    sourceCompound: 'dl-δ-tocopherol',
    iuPerMg: 0.25,
    source: 'FEDIAF_2025',
  },
};

function isVitaminESourceForm(form: VitaminEForm): form is VitaminESourceForm {
  return Object.prototype.hasOwnProperty.call(VITAMIN_E_CONVERSIONS, form);
}

export type VitaminEActivityStatus =
  | 'DIRECT_IU'
  | 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT'
  | 'COMPONENT_ACTIVITY'
  | 'CONSERVATIVE_BETA_GAMMA_ACTIVITY'
  | 'ALPHA_ONLY_LOWER_BOUND';

export interface VitaminEActivityCalculation {
  valueIu: number;
  status: VitaminEActivityStatus;
  vitaminEForm: VitaminEForm;
  sourceCompound: string;
  note: string;
  components: Record<string, number | null>;
}

export function getVitaminEConversion(
  form: VitaminEForm | null | undefined,
): VitaminEConversion | null {
  if (!form || form === 'UNKNOWN') {
    return null;
  }
  return isVitaminESourceForm(form) ? VITAMIN_E_CONVERSIONS[form] : null;
}

export function convertVitaminEToIu(
  amount: number,
  unit: string,
  form: VitaminEForm,
): number | null {
  if (!Number.isFinite(amount)) {
    return null;
  }

  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === 'iu') {
    return amount;
  }

  if (normalizedUnit !== 'mg') {
    return null;
  }

  const conversion = getVitaminEConversion(form);
  return conversion ? amount * conversion.iuPerMg : null;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function componentIu(valueMg: number | null, form: VitaminESourceForm): number | null {
  if (valueMg === null) {
    return null;
  }
  return round(valueMg * VITAMIN_E_CONVERSIONS[form].iuPerMg);
}

export function calculateVitaminEActivityIu(input: {
  amount?: number | null;
  unit?: string | null;
  form?: VitaminEForm | null;
  alphaTocopherolEquivalentMg?: number | null;
  alphaTocopherolMg?: number | null;
  betaTocopherolMg?: number | null;
  gammaTocopherolMg?: number | null;
  betaGammaTocopherolMg?: number | null;
  deltaTocopherolMg?: number | null;
  totalVitaminEMg?: number | null;
}): VitaminEActivityCalculation | null {
  const amount = finite(input.amount);
  const normalizedUnit = input.unit?.trim().toLowerCase();
  if (amount !== null && normalizedUnit === 'iu') {
    return {
      valueIu: round(amount),
      status: 'DIRECT_IU',
      vitaminEForm: input.form ?? 'UNKNOWN',
      sourceCompound: 'source-declared vitamin E activity',
      note: '来源已按 IU 标示维生素 E 活性，直接采用，不额外估算其他生育酚形态。',
      components: {},
    };
  }

  const alphaTeMg = finite(input.alphaTocopherolEquivalentMg);
  if (alphaTeMg !== null) {
    return {
      valueIu: round(alphaTeMg * VITAMIN_E_CONVERSIONS.D_ALPHA_TOCOPHEROL.iuPerMg),
      status: 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT',
      vitaminEForm: 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT',
      sourceCompound: 'source alpha-tocopherol equivalents',
      note: '来源给出 α-生育酚当量，按活性当量换算为 IU；不额外估算或叠加其他生育酚形态。',
      components: {
        alphaTocopherolEquivalentMg: alphaTeMg,
        alphaTocopherolEquivalentIu: round(
          alphaTeMg * VITAMIN_E_CONVERSIONS.D_ALPHA_TOCOPHEROL.iuPerMg,
        ),
      },
    };
  }

  if (amount !== null && normalizedUnit === 'mg' && input.form) {
    const converted = convertVitaminEToIu(amount, 'mg', input.form);
    if (converted !== null) {
      return {
        valueIu: round(converted),
        status:
          input.form === 'D_ALPHA_TOCOPHEROL'
            ? 'ALPHA_ONLY_LOWER_BOUND'
            : 'COMPONENT_ACTIVITY',
        vitaminEForm: input.form,
        sourceCompound:
          getVitaminEConversion(input.form)?.sourceCompound ??
          'known vitamin E source form',
        note:
          input.form === 'D_ALPHA_TOCOPHEROL'
            ? 'FEDIAF 2025 vitamin E activity: d-α-tocopherol 1 mg = 1.49 IU；来源只给出 α-生育酚，按保守下限处理，其他生育酚形态未计入。'
            : '来源给出明确维生素 E 形态，按 FEDIAF 活性系数换算。',
        components: {
          sourceAmountMg: amount,
          sourceAmountIu: round(converted),
        },
      };
    }
  }

  const alphaMg = finite(input.alphaTocopherolMg);
  const betaMg = finite(input.betaTocopherolMg);
  const gammaMg = finite(input.gammaTocopherolMg);
  const betaGammaMg = finite(input.betaGammaTocopherolMg);
  const deltaMg = finite(input.deltaTocopherolMg);
  const hasSplitComponents =
    alphaMg !== null || betaMg !== null || gammaMg !== null || deltaMg !== null;
  const hasConservativeComponents =
    alphaMg !== null || betaGammaMg !== null || deltaMg !== null;

  if (betaGammaMg !== null && hasConservativeComponents) {
    const alphaIu = componentIu(alphaMg ?? 0, 'D_ALPHA_TOCOPHEROL') ?? 0;
    const betaGammaIu =
      componentIu(betaGammaMg, 'DL_GAMMA_TOCOPHEROL') ?? 0;
    const deltaIu = componentIu(deltaMg ?? 0, 'DL_DELTA_TOCOPHEROL') ?? 0;
    return {
      valueIu: round(alphaIu + betaGammaIu + deltaIu),
      status: 'CONSERVATIVE_BETA_GAMMA_ACTIVITY',
      vitaminEForm: 'FEDIAF_CONSERVATIVE_TOCOPHEROL_ACTIVITY',
      sourceCompound: 'tocopherol component activity',
      note:
        '来源给出 α、β+γ、δ 生育酚分项；β+γ 合并列按 γ-生育酚活性 0.01 IU/mg 作保守下限，避免高估。',
      components: {
        alphaTocopherolMg: alphaMg ?? 0,
        alphaTocopherolIu: alphaIu,
        betaGammaTocopherolMg: betaGammaMg,
        betaGammaTocopherolIu: betaGammaIu,
        deltaTocopherolMg: deltaMg ?? 0,
        deltaTocopherolIu: deltaIu,
      },
    };
  }

  if (hasSplitComponents) {
    const alphaIu = componentIu(alphaMg ?? 0, 'D_ALPHA_TOCOPHEROL') ?? 0;
    const betaIu = componentIu(betaMg ?? 0, 'DL_BETA_TOCOPHEROL') ?? 0;
    const gammaIu = componentIu(gammaMg ?? 0, 'DL_GAMMA_TOCOPHEROL') ?? 0;
    const deltaIu = componentIu(deltaMg ?? 0, 'DL_DELTA_TOCOPHEROL') ?? 0;
    const alphaOnly =
      alphaMg !== null && betaMg === null && gammaMg === null && deltaMg === null;
    return {
      valueIu: round(alphaIu + betaIu + gammaIu + deltaIu),
      status: alphaOnly ? 'ALPHA_ONLY_LOWER_BOUND' : 'COMPONENT_ACTIVITY',
      vitaminEForm: alphaOnly
        ? 'D_ALPHA_TOCOPHEROL'
        : 'FEDIAF_TOCOPHEROL_ACTIVITY',
      sourceCompound: alphaOnly
        ? VITAMIN_E_CONVERSIONS.D_ALPHA_TOCOPHEROL.sourceCompound
        : 'tocopherol component activity',
      note: alphaOnly
        ? 'FEDIAF 2025 vitamin E activity: d-α-tocopherol 1 mg = 1.49 IU；来源只给出 α-生育酚，按保守下限处理，其他生育酚形态未计入。'
        : '来源给出 α/β/γ/δ 生育酚分项；β/γ/δ 生育酚已按 FEDIAF 活性系数计入。',
      components: {
        alphaTocopherolMg: alphaMg ?? 0,
        alphaTocopherolIu: alphaIu,
        betaTocopherolMg: betaMg,
        betaTocopherolIu: betaMg === null ? null : betaIu,
        gammaTocopherolMg: gammaMg,
        gammaTocopherolIu: gammaMg === null ? null : gammaIu,
        deltaTocopherolMg: deltaMg,
        deltaTocopherolIu: deltaMg === null ? null : deltaIu,
      },
    };
  }

  return null;
}

export function buildVitaminESourceFormMetadata(
  calculation: VitaminEActivityCalculation,
): Record<string, string | number | boolean | null> {
  const alphaConversion = VITAMIN_E_CONVERSIONS.D_ALPHA_TOCOPHEROL;
  return {
    vitaminEForm: calculation.vitaminEForm,
    sourceCompound: calculation.sourceCompound,
    conversionStatus: calculation.status,
    conversionFactorSource: 'FEDIAF_2025',
    conversionFactor:
      calculation.vitaminEForm === 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT' ||
      calculation.vitaminEForm === 'D_ALPHA_TOCOPHEROL'
        ? alphaConversion.iuPerMg
        : null,
    conversionFactorUnit:
      calculation.vitaminEForm === 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT' ||
      calculation.vitaminEForm === 'D_ALPHA_TOCOPHEROL'
        ? 'IU_PER_MG'
        : 'COMPONENT_IU_PER_MG',
    ...calculation.components,
  };
}

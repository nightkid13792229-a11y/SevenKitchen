export type VitaminEForm =
  | 'D_ALPHA_TOCOPHEROL'
  | 'D_ALPHA_TOCOPHERYL_ACETATE'
  | 'DL_ALPHA_TOCOPHEROL'
  | 'DL_ALPHA_TOCOPHERYL_ACETATE'
  | 'UNKNOWN';

export interface VitaminEConversion {
  form: Exclude<VitaminEForm, 'UNKNOWN'>;
  sourceCompound: string;
  iuPerMg: number;
  source: 'FEDIAF_2025';
}

export const VITAMIN_E_CONVERSIONS: Readonly<
  Record<Exclude<VitaminEForm, 'UNKNOWN'>, VitaminEConversion>
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
};

export function getVitaminEConversion(
  form: VitaminEForm | null | undefined,
): VitaminEConversion | null {
  if (!form || form === 'UNKNOWN') {
    return null;
  }
  return VITAMIN_E_CONVERSIONS[form] ?? null;
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

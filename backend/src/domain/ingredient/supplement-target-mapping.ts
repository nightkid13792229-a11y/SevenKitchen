import { listSupplementTargetFields } from './nutrition-field-catalog';

export interface SupplementTargetFieldReference {
  fieldPath: string;
  fieldKey: string;
  label: string;
  unit: string;
}

export interface DesignSupplementTargetReference {
  fieldPath: string;
  nutrientTargetKey: string;
  label: string;
  unit: string;
  targetValue: number | null;
  expressionBasis: null;
}

const SUPPLEMENT_TARGET_FIELDS = {
  calcium: {
    fieldPath: 'minerals.calcium',
    fieldKey: 'calcium',
    label: '钙',
    unit: 'mg',
  },
  iodine: {
    fieldPath: 'minerals.iodine',
    fieldKey: 'iodine',
    label: '碘',
    unit: 'μg',
  },
  zinc: {
    fieldPath: 'minerals.zinc',
    fieldKey: 'zinc',
    label: '锌',
    unit: 'mg',
  },
  iron: {
    fieldPath: 'minerals.iron',
    fieldKey: 'iron',
    label: '铁',
    unit: 'mg',
  },
  copper: {
    fieldPath: 'minerals.copper',
    fieldKey: 'copper',
    label: '铜',
    unit: 'mg',
  },
  vitaminD: {
    fieldPath: 'vitamins.vitaminD',
    fieldKey: 'vitaminD',
    label: '维生素 D',
    unit: 'IU',
  },
  vitaminB2: {
    fieldPath: 'vitamins.vitaminB2',
    fieldKey: 'vitaminB2',
    label: '维生素 B2',
    unit: 'mg',
  },
  vitaminE: {
    fieldPath: 'vitamins.vitaminE',
    fieldKey: 'vitaminE',
    label: '维生素 E',
    unit: 'IU',
  },
  choline: {
    fieldPath: 'vitamins.choline',
    fieldKey: 'choline',
    label: '胆碱',
    unit: 'mg',
  },
} as const satisfies Record<string, SupplementTargetFieldReference>;

const LEGACY_TARGET_MAPPING: Record<string, SupplementTargetFieldReference> = {
  iodine: SUPPLEMENT_TARGET_FIELDS.iodine,
  i: SUPPLEMENT_TARGET_FIELDS.iodine,
  碘: SUPPLEMENT_TARGET_FIELDS.iodine,
  calcium: SUPPLEMENT_TARGET_FIELDS.calcium,
  ca: SUPPLEMENT_TARGET_FIELDS.calcium,
  钙: SUPPLEMENT_TARGET_FIELDS.calcium,
  zinc: SUPPLEMENT_TARGET_FIELDS.zinc,
  zn: SUPPLEMENT_TARGET_FIELDS.zinc,
  锌: SUPPLEMENT_TARGET_FIELDS.zinc,
  iron: SUPPLEMENT_TARGET_FIELDS.iron,
  fe: SUPPLEMENT_TARGET_FIELDS.iron,
  铁: SUPPLEMENT_TARGET_FIELDS.iron,
  copper: SUPPLEMENT_TARGET_FIELDS.copper,
  cu: SUPPLEMENT_TARGET_FIELDS.copper,
  铜: SUPPLEMENT_TARGET_FIELDS.copper,
  vitamind: SUPPLEMENT_TARGET_FIELDS.vitaminD,
  vitamind3: SUPPLEMENT_TARGET_FIELDS.vitaminD,
  维生素d: SUPPLEMENT_TARGET_FIELDS.vitaminD,
  维生素d3: SUPPLEMENT_TARGET_FIELDS.vitaminD,
  vitaminb2: SUPPLEMENT_TARGET_FIELDS.vitaminB2,
  riboflavin: SUPPLEMENT_TARGET_FIELDS.vitaminB2,
  维生素b2: SUPPLEMENT_TARGET_FIELDS.vitaminB2,
  vitamine: SUPPLEMENT_TARGET_FIELDS.vitaminE,
  维生素e: SUPPLEMENT_TARGET_FIELDS.vitaminE,
  choline: SUPPLEMENT_TARGET_FIELDS.choline,
  胆碱: SUPPLEMENT_TARGET_FIELDS.choline,
};

const SUPPLEMENT_NAME_TARGET_MAPPING: Record<
  string,
  SupplementTargetFieldReference
> = {
  鸡蛋壳粉: SUPPLEMENT_TARGET_FIELDS.calcium,
  蛋壳粉: SUPPLEMENT_TARGET_FIELDS.calcium,
  海藻粉: SUPPLEMENT_TARGET_FIELDS.iodine,
  海带粉: SUPPLEMENT_TARGET_FIELDS.iodine,
  海带片: SUPPLEMENT_TARGET_FIELDS.iodine,
  双甘氨酸亚铁胶囊: SUPPLEMENT_TARGET_FIELDS.iron,
  双甘氨酸铜片: SUPPLEMENT_TARGET_FIELDS.copper,
};

export function normalizeSupplementTargetKey(value: string): string {
  return value.replace(/[\s_-]+/g, '').toLowerCase();
}

function normalizeSupplementTargetLookupKey(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizeSupplementIngredientName(value: string): string {
  return value.replace(/[\s·・,，()（）-]+/g, '').toLowerCase();
}

export function mapLegacySupplementTargetField(
  key: string | null | undefined,
): SupplementTargetFieldReference | null {
  if (!key) {
    return null;
  }

  return LEGACY_TARGET_MAPPING[normalizeSupplementTargetKey(key)] ?? null;
}

export function inferSupplementTargetFieldFromIngredientName(
  name: string | null | undefined,
): SupplementTargetFieldReference | null {
  const normalizedName =
    typeof name === 'string' ? normalizeSupplementIngredientName(name) : '';
  if (!normalizedName) {
    return null;
  }

  for (const [knownName, field] of Object.entries(
    SUPPLEMENT_NAME_TARGET_MAPPING,
  )) {
    if (normalizedName.includes(normalizeSupplementIngredientName(knownName))) {
      return field;
    }
  }

  return null;
}

export function resolveSupplementTargetField(
  targetKey: string | null | undefined,
): SupplementTargetFieldReference | null {
  const normalizedTargetKey =
    typeof targetKey === 'string'
      ? normalizeSupplementTargetLookupKey(targetKey)
      : '';
  if (!normalizedTargetKey) {
    return null;
  }

  const field = listSupplementTargetFields().find((candidate) => {
    return (
      candidate.fieldPath === targetKey ||
      candidate.fieldKey === targetKey ||
      normalizeSupplementTargetLookupKey(candidate.label) ===
        normalizedTargetKey ||
      normalizeSupplementTargetLookupKey(candidate.fieldKey) ===
        normalizedTargetKey
    );
  });

  return field
    ? {
        fieldPath: field.fieldPath,
        fieldKey: field.fieldKey,
        label: field.label,
        unit: field.unit,
      }
    : null;
}

export function toDesignSupplementTargetReference(
  field: SupplementTargetFieldReference,
  targetValue: number | null | undefined,
): DesignSupplementTargetReference {
  const numericTargetValue = Number(targetValue);

  return {
    fieldPath: field.fieldPath,
    nutrientTargetKey: field.fieldKey,
    label: field.label,
    unit: field.unit,
    targetValue:
      Number.isFinite(numericTargetValue) && numericTargetValue > 0
        ? numericTargetValue
        : null,
    expressionBasis: null,
  };
}

export function mapLegacyDesignSupplementTarget(
  key: string | null | undefined,
  value: number | null | undefined,
): DesignSupplementTargetReference | null {
  const field = mapLegacySupplementTargetField(key);
  return field ? toDesignSupplementTargetReference(field, value) : null;
}

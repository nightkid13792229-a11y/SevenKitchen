export type NutritionFoodDisplayNameRecord = {
  name: string;
  nameEn?: string | null;
  displayNameZh?: string | null;
  dataSource: string;
};

const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

export function normalizeChineseDisplayName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getNutritionProfileSourceName(food: {
  name: string;
  nameEn?: string | null;
}) {
  if (CJK_TEXT_PATTERN.test(food.name)) {
    return food.nameEn ?? food.name;
  }

  return food.name;
}

export function describeNutritionProfilePreparation(sourceName: string) {
  const normalized = sourceName.toLocaleLowerCase();

  if (normalized.includes('raw')) {
    return '生';
  }

  if (normalized.includes('boiled')) {
    return '水煮';
  }

  if (normalized.includes('steamed')) {
    return '蒸制';
  }

  if (normalized.includes('baked')) {
    return '烘烤';
  }

  if (normalized.includes('roasted')) {
    return '烤制';
  }

  if (normalized.includes('canned')) {
    return '罐装';
  }

  if (normalized.includes('frozen')) {
    return '冷冻';
  }

  const parts: string[] = [];
  if (normalized.includes('cooked')) {
    parts.push('熟制');
  }
  if (normalized.includes('dry heat')) {
    parts.push('干热');
  }
  if (normalized.includes('fresh')) {
    parts.push('新鲜');
  }

  return parts.join('，');
}

export function buildNutritionProfileFallbackDisplayName(
  ingredientName: string | null | undefined,
  food: NutritionFoodDisplayNameRecord,
) {
  if (CJK_TEXT_PATTERN.test(food.name)) {
    return food.name;
  }

  const sourceName = getNutritionProfileSourceName(food);
  const descriptor = describeNutritionProfilePreparation(sourceName);

  if (ingredientName) {
    return descriptor
      ? `${ingredientName}（${descriptor}）`
      : `${ingredientName}（${food.dataSource}档案）`;
  }

  return sourceName;
}

export function resolveNutritionProfileDisplayName(
  ingredientName: string | null | undefined,
  food: NutritionFoodDisplayNameRecord,
) {
  return (
    normalizeChineseDisplayName(food.displayNameZh) ??
    buildNutritionProfileFallbackDisplayName(ingredientName, food)
  );
}

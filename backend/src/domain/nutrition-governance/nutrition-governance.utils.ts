import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../ingredient/types';
import type {
  NutritionGovernanceSourceType,
  NutritionMatchConfidence,
  NutritionMatchReason,
} from './nutrition-governance.types';
import { USDA_NUTRIENT_MAP } from './usda-nutrient-map';

export function buildNutritionSourceKey(
  sourceType: NutritionGovernanceSourceType,
  externalId: string,
): string {
  return `${sourceType}:${externalId.trim()}`;
}

export function getSourcePriority(
  sourceType: NutritionGovernanceSourceType,
): number {
  switch (sourceType) {
    case 'USDA':
      return 1;
    case 'CFCT':
      return 2;
    case 'MANUAL':
      return 3;
    case 'SUPPLEMENT_LABEL':
      return 4;
  }
}

export function classifyMatchConfidence(
  score: number,
): NutritionMatchConfidence {
  if (score >= 0.85) return 'HIGH';
  if (score >= 0.6) return 'MEDIUM';
  return 'LOW';
}

export function normalizeNameForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/[\p{P}\s]+/gu, '');
}

export function scoreIngredientSourceNameMatch(params: {
  ingredientName: string;
  sourceFoodName: string;
  sourceType: NutritionGovernanceSourceType;
}): { score: number; reasons: NutritionMatchReason[] } {
  const ingredientName = normalizeNameForMatch(params.ingredientName);
  const sourceFoodName = normalizeNameForMatch(params.sourceFoodName);
  const reasons: NutritionMatchReason[] = [];
  let score = 0;

  if (ingredientName && ingredientName === sourceFoodName) {
    score += 0.75;
    reasons.push({
      code: 'NAME_EXACT',
      label: '名称完全匹配',
      scoreDelta: 0.75,
    });
  } else if (
    ingredientName &&
    sourceFoodName &&
    (ingredientName.includes(sourceFoodName) ||
      sourceFoodName.includes(ingredientName))
  ) {
    score += 0.55;
    reasons.push({
      code: 'NAME_PARTIAL',
      label: '名称部分匹配',
      scoreDelta: 0.55,
    });
  }

  if (params.sourceType === 'USDA') {
    score += 0.15;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: 'USDA 优先来源',
      scoreDelta: 0.15,
    });
  } else if (params.sourceType === 'CFCT') {
    score += 0.1;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: '中国食物成分表第二来源',
      scoreDelta: 0.1,
    });
  }

  return { score: Math.min(score, 1), reasons };
}

export function mapUsdaNutrientsToNutritionProfile(
  nutrients: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  (profile.meta as Record<string, unknown>).sourceType = 'USDA';

  for (const nutrient of nutrients) {
    const nutrientId = nutrient.nutrient?.id;
    const amount = nutrient.amount;
    if (
      typeof nutrientId !== 'number' ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount)
    ) {
      continue;
    }

    const mapping = USDA_NUTRIENT_MAP.find(
      (item) => item.nutrientId === nutrientId,
    );
    if (!mapping) continue;

    const tab = profile[mapping.tabKey] as Record<string, number | null>;
    tab[mapping.fieldKey] = amount;
  }

  return profile;
}

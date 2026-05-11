import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../ingredient/types';
import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import type {
  NutritionGovernanceSourceType,
  NutritionMatchConfidence,
  NutritionMatchReason,
} from './nutrition-governance.types';
import { USDA_NUTRIENT_MAP } from './usda-nutrient-map';

const CHINESE_TO_ENGLISH_FOOD_ALIASES: ReadonlyArray<{
  zh: string;
  aliases: readonly string[];
}> = [
  { zh: '鸡胸肉', aliases: ['chicken breast'] },
  {
    zh: '鸡腿肉',
    aliases: ['chicken leg', 'chicken thigh', 'chicken drumstick'],
  },
  { zh: '鸡肉', aliases: ['chicken'] },
  { zh: '鸭肉', aliases: ['duck'] },
  { zh: '火鸡肉', aliases: ['turkey'] },
  { zh: '牛肉', aliases: ['beef'] },
  { zh: '牛腩', aliases: ['beef brisket'] },
  { zh: '牛肝', aliases: ['beef liver'] },
  { zh: '羊肉', aliases: ['lamb', 'mutton'] },
  { zh: '猪肉', aliases: ['pork'] },
  { zh: '猪肝', aliases: ['pork liver'] },
  { zh: '三文鱼', aliases: ['salmon'] },
  { zh: '鲑鱼', aliases: ['salmon'] },
  { zh: '鳕鱼', aliases: ['cod'] },
  { zh: '沙丁鱼', aliases: ['sardine'] },
  { zh: '金枪鱼', aliases: ['tuna'] },
  { zh: '虾', aliases: ['shrimp', 'prawn'] },
  { zh: '鸡蛋', aliases: ['egg', 'chicken egg'] },
  { zh: '蛋黄', aliases: ['egg yolk'] },
  { zh: '蛋清', aliases: ['egg white'] },
  { zh: '牛奶', aliases: ['milk'] },
  { zh: '酸奶', aliases: ['yogurt', 'yoghurt'] },
  { zh: '奶酪', aliases: ['cheese'] },
  { zh: '南瓜', aliases: ['pumpkin'] },
  { zh: '胡萝卜', aliases: ['carrot'] },
  { zh: '西兰花', aliases: ['broccoli'] },
  { zh: '菠菜', aliases: ['spinach'] },
  { zh: '红薯', aliases: ['sweet potato'] },
  { zh: '土豆', aliases: ['potato'] },
  { zh: '马铃薯', aliases: ['potato'] },
  { zh: '苹果', aliases: ['apple'] },
  { zh: '蓝莓', aliases: ['blueberry'] },
  { zh: '香蕉', aliases: ['banana'] },
  { zh: '米饭', aliases: ['rice'] },
  { zh: '糙米', aliases: ['brown rice'] },
  { zh: '燕麦', aliases: ['oat', 'oats'] },
  { zh: '橄榄油', aliases: ['olive oil'] },
  { zh: '椰子油', aliases: ['coconut oil'] },
  { zh: '亚麻籽油', aliases: ['flaxseed oil', 'linseed oil'] },
];

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
  return value
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, '');
}

function normalizeEnglishFoodNameTokens(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
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

  const aliasMatched = findChineseEnglishAliasMatch(
    ingredientName,
    params.sourceFoodName,
  );

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
  } else if (aliasMatched) {
    score += 0.65;
    reasons.push({
      code: 'NAME_PARTIAL',
      label: '常用中英别名匹配',
      scoreDelta: 0.65,
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

function findChineseEnglishAliasMatch(
  normalizedIngredientName: string,
  sourceFoodName: string,
): boolean {
  if (!normalizedIngredientName || !sourceFoodName) {
    return false;
  }

  const sourceTokens = normalizeEnglishFoodNameTokens(sourceFoodName);

  return CHINESE_TO_ENGLISH_FOOD_ALIASES.some((entry) => {
    const normalizedChinese = normalizeNameForMatch(entry.zh);
    if (
      !normalizedIngredientName.includes(normalizedChinese) &&
      !normalizedChinese.includes(normalizedIngredientName)
    ) {
      return false;
    }

    return entry.aliases.some((alias) => {
      const aliasTokens = normalizeEnglishFoodNameTokens(alias);
      if (
        aliasTokens.length === 0 ||
        aliasTokens.length > sourceTokens.length
      ) {
        return false;
      }

      return sourceTokens.some((_, startIndex) =>
        aliasTokens.every(
          (token, aliasIndex) =>
            sourceTokens[startIndex + aliasIndex] === token,
        ),
      );
    });
  });
}

export function mapUsdaNutrientsToNutritionProfile(
  nutrients: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'USDA';
  profile.meta.sourceKind = 'FOOD_DATABASE';
  profile.meta.sourceCode = 'USDA_FDC';
  profile.meta.sourceProvider = 'USDA FoodData Central';
  profile.meta.sourceForms = {};
  profile.meta.conversionNotes = {};

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

    const canonicalValue = amount * (mapping.amountMultiplier ?? 1);
    const tab = profile[mapping.tabKey] as Record<string, number | null>;
    tab[mapping.fieldKey] = canonicalValue;

    const field = findNutritionField(mapping.fieldPath);
    profile.meta.sourceForms[mapping.fieldPath] = {
      sourceNutrientId: nutrientId,
      sourceNutrientName: nutrient.nutrient?.name ?? null,
      originalValue: amount,
      originalUnit: nutrient.nutrient?.unitName ?? mapping.sourceUnit ?? null,
      canonicalValue,
      canonicalUnit: field?.unit ?? null,
      basisType: profile.meta.rawBasisType,
    };
    if (mapping.conversionNote) {
      profile.meta.conversionNotes[mapping.fieldPath] = mapping.conversionNote;
    }
  }

  return profile;
}

import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../ingredient/types';
import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import { normalizeLegacyNutritionSourceType } from '../ingredient/nutrition-source-contract';
import type {
  NutritionGovernanceSourceType,
  NutritionMatchConfidence,
  NutritionMatchReason,
} from './nutrition-governance.types';
import { USDA_NUTRIENT_MAP } from './usda-nutrient-map';
import {
  buildVitaminASourceFormMetadata,
  calculateVitaminAActivityIu,
} from '../ingredient/vitamin-a-conversion';
import {
  buildVitaminESourceFormMetadata,
  calculateVitaminEActivityIu,
} from '../ingredient/vitamin-e-conversion';

const USDA_SOURCE_PROVIDER = 'USDA FoodData Central';
const USDA_VITAMIN_A_RETINOL_ID = 1105;
const USDA_VITAMIN_A_BETA_CAROTENE_ID = 1107;
const USDA_VITAMIN_A_COMPONENT_IDS = new Set([
  USDA_VITAMIN_A_RETINOL_ID,
  USDA_VITAMIN_A_BETA_CAROTENE_ID,
]);
const USDA_VITAMIN_E_ALPHA_TOCOPHEROL_ID = 1109;
const USDA_VITAMIN_E_BETA_TOCOPHEROL_ID = 1125;
const USDA_VITAMIN_E_GAMMA_TOCOPHEROL_ID = 1126;
const USDA_VITAMIN_E_DELTA_TOCOPHEROL_ID = 1127;
const USDA_VITAMIN_E_TOCOPHEROL_IDS = new Set([
  USDA_VITAMIN_E_ALPHA_TOCOPHEROL_ID,
  USDA_VITAMIN_E_BETA_TOCOPHEROL_ID,
  USDA_VITAMIN_E_GAMMA_TOCOPHEROL_ID,
  USDA_VITAMIN_E_DELTA_TOCOPHEROL_ID,
]);

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
  { zh: '卷心菜', aliases: ['cabbage', 'cabbage common'] },
  { zh: '圆白菜', aliases: ['cabbage', 'cabbage common'] },
  { zh: '包菜', aliases: ['cabbage', 'cabbage common'] },
  { zh: '紫甘蓝', aliases: ['red cabbage', 'cabbage red'] },
  { zh: '胡萝卜', aliases: ['carrot'] },
  { zh: '西兰花', aliases: ['broccoli'] },
  { zh: '菠菜', aliases: ['spinach'] },
  { zh: '黄瓜', aliases: ['cucumber'] },
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

const CHINESE_TO_ENGLISH_PORTION_REQUIREMENTS: ReadonlyArray<{
  zh: readonly string[];
  positive: readonly RegExp[];
  negative: readonly RegExp[];
  positiveLabel: string;
  negativeLabel: string;
}> = [
  {
    zh: ['去皮'],
    positive: [/\bpeeled\b/u, /\bskinless\b/u],
    negative: [/\bwith\s+peel\b/u, /\bunpeeled\b/u, /\bskin\s+on\b/u],
    positiveLabel: '人工要求去皮，来源描述为去皮/无皮',
    negativeLabel: '人工要求去皮，来源描述为带皮',
  },
  {
    zh: ['带皮'],
    positive: [/\bwith\s+peel\b/u, /\bunpeeled\b/u, /\bskin\s+on\b/u],
    negative: [/\bpeeled\b/u, /\bskinless\b/u],
    positiveLabel: '人工要求带皮，来源描述为带皮',
    negativeLabel: '人工要求带皮，来源描述为去皮/无皮',
  },
  {
    zh: ['去骨'],
    positive: [/\bboneless\b/u],
    negative: [/\bbone[-\s]?in\b/u, /\bwith\s+bone\b/u],
    positiveLabel: '人工要求去骨，来源描述为去骨',
    negativeLabel: '人工要求去骨，来源描述为带骨',
  },
  {
    zh: ['带骨'],
    positive: [/\bbone[-\s]?in\b/u, /\bwith\s+bone\b/u],
    negative: [/\bboneless\b/u],
    positiveLabel: '人工要求带骨，来源描述为带骨',
    negativeLabel: '人工要求带骨，来源描述为去骨',
  },
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
    case 'NZFCD':
      return 2;
    case 'MEXT':
      return 2;
    case 'CNF':
      return 2;
    case 'COFID':
      return 2;
    case 'CIQUAL':
      return 2;
    case 'NEVO':
      return 3;
    case 'TFDA':
      return 3;
    case 'CFCT':
      return 3;
    case 'MANUAL':
      return 4;
    case 'SUPPLEMENT_LABEL':
      return 5;
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

  const portionScore = scoreEnglishPortionRequirementMatch(
    ingredientName,
    params.sourceFoodName,
  );
  score += portionScore.scoreDelta;
  reasons.push(...portionScore.reasons);

  const variantScore = scoreEnglishFoodVariantMatch(
    ingredientName,
    params.sourceFoodName,
  );
  score += variantScore.scoreDelta;
  reasons.push(...variantScore.reasons);

  if (params.sourceType === 'USDA') {
    score += 0.15;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: 'USDA 优先来源',
      scoreDelta: 0.15,
    });
  } else if (params.sourceType === 'NZFCD') {
    score += 0.12;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: '新西兰食物成分数据库来源',
      scoreDelta: 0.12,
    });
  } else if (params.sourceType === 'TFDA') {
    score += 0.1;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: '台湾食品营养成分资料库来源',
      scoreDelta: 0.1,
    });
  } else if (params.sourceType === 'CFCT') {
    score += 0.1;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: '中国食物成分表第二来源',
      scoreDelta: 0.1,
    });
  }

  return { score: Math.max(0, Math.min(score, 1)), reasons };
}

function scoreEnglishPortionRequirementMatch(
  normalizedIngredientName: string,
  sourceFoodName: string,
): { scoreDelta: number; reasons: NutritionMatchReason[] } {
  if (!normalizedIngredientName || !sourceFoodName) {
    return { scoreDelta: 0, reasons: [] };
  }

  const sourceName = sourceFoodName.toLowerCase();
  const reasons: NutritionMatchReason[] = [];
  let scoreDelta = 0;

  for (const requirement of CHINESE_TO_ENGLISH_PORTION_REQUIREMENTS) {
    const hasRequirement = requirement.zh.some((keyword) =>
      normalizedIngredientName.includes(normalizeNameForMatch(keyword)),
    );
    if (!hasRequirement) continue;

    if (requirement.positive.some((pattern) => pattern.test(sourceName))) {
      scoreDelta += 0.12;
      reasons.push({
        code: 'PORTION_MATCH',
        label: requirement.positiveLabel,
        scoreDelta: 0.12,
      });
      continue;
    }

    if (requirement.negative.some((pattern) => pattern.test(sourceName))) {
      scoreDelta -= 0.14;
      reasons.push({
        code: 'PORTION_CONFLICT',
        label: requirement.negativeLabel,
        scoreDelta: -0.14,
      });
    }
  }

  return { scoreDelta, reasons };
}

function scoreEnglishFoodVariantMatch(
  normalizedIngredientName: string,
  sourceFoodName: string,
): { scoreDelta: number; reasons: NutritionMatchReason[] } {
  if (!normalizedIngredientName || !sourceFoodName) {
    return { scoreDelta: 0, reasons: [] };
  }

  const sourceName = sourceFoodName.toLowerCase();
  const reasons: NutritionMatchReason[] = [];
  let scoreDelta = 0;

  const isRegularCabbage = ['卷心菜', '圆白菜', '包菜'].some((keyword) =>
    normalizedIngredientName.includes(normalizeNameForMatch(keyword)),
  );
  if (isRegularCabbage) {
    if (/\b(chinese|pak[-\s]?choi|pe[-\s]?tsai|red)\b/u.test(sourceName)) {
      reasons.push({
        code: 'VARIANT_CONFLICT',
        label: '普通卷心菜命中红甘蓝或中国白菜类易混淆来源，保留给 Agent 排序',
        scoreDelta: 0,
      });
    } else if (/\bcommon\b/u.test(sourceName)) {
      scoreDelta += 0.1;
      reasons.push({
        code: 'VARIANT_MATCH',
        label: '普通卷心菜匹配 common cabbage 来源',
        scoreDelta: 0.1,
      });
    }
  }

  const isRedCabbage = ['紫甘蓝'].some((keyword) =>
    normalizedIngredientName.includes(normalizeNameForMatch(keyword)),
  );
  if (isRedCabbage) {
    if (/\bred\b/u.test(sourceName)) {
      scoreDelta += 0.1;
      reasons.push({
        code: 'VARIANT_MATCH',
        label: '紫甘蓝匹配 red cabbage 来源',
        scoreDelta: 0.1,
      });
    } else if (
      /\b(common|chinese|pak[-\s]?choi|pe[-\s]?tsai)\b/u.test(sourceName)
    ) {
      reasons.push({
        code: 'VARIANT_CONFLICT',
        label: '紫甘蓝命中普通卷心菜或中国白菜类易混淆来源，保留给 Agent 排序',
        scoreDelta: 0,
      });
    }
  }

  return { scoreDelta, reasons };
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
  profile.meta.sourceProvider = USDA_SOURCE_PROVIDER;
  profile.meta.sourceForms = {};
  profile.meta.conversionNotes = {};
  const assignedFieldPriorities = new Map<string, number>();

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
    if (!mapping) {
      const reviewOnlyItem = buildUsdaReviewOnlyCustomItem({
        nutrientId,
        nutrientName: nutrient.nutrient?.name,
        unitName: nutrient.nutrient?.unitName,
        amount,
        rawBasisType: profile.meta.rawBasisType,
      });
      if (
        reviewOnlyItem &&
        !USDA_VITAMIN_E_TOCOPHEROL_IDS.has(nutrientId) &&
        !USDA_VITAMIN_A_COMPONENT_IDS.has(nutrientId)
      ) {
        profile.customItems.push(reviewOnlyItem);
      }
      continue;
    }

    const nextPriority = mapping.fieldPriority ?? 100;
    const assignedPriority = assignedFieldPriorities.get(mapping.fieldPath);
    if (
      typeof assignedPriority === 'number' &&
      assignedPriority <= nextPriority
    ) {
      continue;
    }

    const canonicalValue = amount * (mapping.amountMultiplier ?? 1);
    const tab = profile[mapping.tabKey] as Record<string, number | null>;
    tab[mapping.fieldKey] = canonicalValue;
    assignedFieldPriorities.set(mapping.fieldPath, nextPriority);

    const field = findNutritionField(mapping.fieldPath);
    profile.meta.sourceForms[mapping.fieldPath] = {
      sourceNutrientId: nutrientId,
      sourceNutrientName: nutrient.nutrient?.name ?? null,
      originalValue: amount,
      originalUnit: nutrient.nutrient?.unitName ?? mapping.sourceUnit ?? null,
      canonicalValue,
      canonicalUnit: field?.unit ?? null,
      basisType: profile.meta.rawBasisType,
      ...(mapping.sourceFormMetadata ?? {}),
    };
    if (mapping.conversionNote) {
      profile.meta.conversionNotes[mapping.fieldPath] = mapping.conversionNote;
    }
  }

  applyUsdaVitaminAActivity(profile, nutrients);
  applyUsdaVitaminEActivity(profile, nutrients);

  return profile;
}

function findUsdaAmount(
  nutrients: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>,
  nutrientId: number,
): number | null {
  const nutrient = nutrients.find((item) => item.nutrient?.id === nutrientId);
  const amount = nutrient?.amount;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
}

function applyUsdaVitaminAActivity(
  profile: NutritionProfileV2,
  nutrients: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>,
) {
  const retinolUg = findUsdaAmount(nutrients, USDA_VITAMIN_A_RETINOL_ID);
  const betaCaroteneUg = findUsdaAmount(
    nutrients,
    USDA_VITAMIN_A_BETA_CAROTENE_ID,
  );
  const calculation = calculateVitaminAActivityIu({
    retinolUg,
    betaCaroteneUg,
  });
  if (!calculation) {
    return;
  }
  const hasRetinol = retinolUg !== null;
  const hasBetaCarotene = betaCaroteneUg !== null;

  profile.vitamins.vitaminA = calculation.valueIu;
  profile.meta.sourceForms ??= {};
  profile.meta.conversionNotes ??= {};
  profile.meta.sourceForms['vitamins.vitaminA'] = {
    sourceNutrientId:
      hasRetinol && hasBetaCarotene
        ? 'USDA:1105+1107'
        : hasRetinol
          ? USDA_VITAMIN_A_RETINOL_ID
          : USDA_VITAMIN_A_BETA_CAROTENE_ID,
    sourceNutrientName:
      hasRetinol && hasBetaCarotene
        ? 'Vitamin A activity from retinol and beta-carotene'
        : hasRetinol
          ? 'Retinol'
          : 'Carotene, beta',
    originalValue:
      hasRetinol && hasBetaCarotene
        ? null
        : hasRetinol
          ? retinolUg
          : betaCaroteneUg,
    originalUnit: 'µg',
    canonicalValue: calculation.valueIu,
    canonicalUnit: 'IU',
    basisType: profile.meta.rawBasisType,
    ...buildVitaminASourceFormMetadata(calculation),
  };
  profile.meta.conversionNotes['vitamins.vitaminA'] =
    `${calculation.note} USDA Vitamin A, IU is used only when component rows are unavailable.`;
}

function applyUsdaVitaminEActivity(
  profile: NutritionProfileV2,
  nutrients: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>,
) {
  const calculation = calculateVitaminEActivityIu({
    alphaTocopherolMg: findUsdaAmount(
      nutrients,
      USDA_VITAMIN_E_ALPHA_TOCOPHEROL_ID,
    ),
    betaTocopherolMg: findUsdaAmount(
      nutrients,
      USDA_VITAMIN_E_BETA_TOCOPHEROL_ID,
    ),
    gammaTocopherolMg: findUsdaAmount(
      nutrients,
      USDA_VITAMIN_E_GAMMA_TOCOPHEROL_ID,
    ),
    deltaTocopherolMg: findUsdaAmount(
      nutrients,
      USDA_VITAMIN_E_DELTA_TOCOPHEROL_ID,
    ),
  });
  if (!calculation) {
    return;
  }

  profile.vitamins.vitaminE = calculation.valueIu;
  profile.meta.sourceForms ??= {};
  profile.meta.conversionNotes ??= {};
  profile.meta.sourceForms['vitamins.vitaminE'] = {
    sourceNutrientId:
      calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
        ? USDA_VITAMIN_E_ALPHA_TOCOPHEROL_ID
        : 'USDA:1109+1125+1126+1127',
    sourceNutrientName:
      calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
        ? 'Vitamin E (alpha-tocopherol)'
        : 'Vitamin E tocopherol component activity',
    originalValue:
      calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
        ? findUsdaAmount(nutrients, USDA_VITAMIN_E_ALPHA_TOCOPHEROL_ID)
        : null,
    originalUnit: 'mg',
    canonicalValue: calculation.valueIu,
    canonicalUnit: 'IU',
    basisType: profile.meta.rawBasisType,
    ...buildVitaminESourceFormMetadata(calculation),
  };
  profile.meta.conversionNotes['vitamins.vitaminE'] = calculation.note;
}

function buildUsdaReviewOnlyCustomItem(params: {
  nutrientId: number;
  nutrientName?: string | null;
  unitName?: string | null;
  amount: number;
  rawBasisType: NutritionProfileV2['meta']['rawBasisType'];
}): NutritionProfileV2['customItems'][number] | null {
  const nutrientName = params.nutrientName?.trim();
  const normalizedName = nutrientName?.toLowerCase() ?? '';
  if (params.amount <= 0) {
    return null;
  }

  if (!nutrientName) {
    return null;
  }

  const reviewClass = classifyUsdaReviewOnlyNutrient(normalizedName);
  if (!reviewClass) {
    return null;
  }

  return {
    name: nutrientName,
    value: params.amount,
    unit: params.unitName?.trim() || reviewClass.defaultUnit,
    rawBasisType: params.rawBasisType,
    note: reviewClass.noteBuilder(nutrientName),
    sourceNutrientId: params.nutrientId,
    sourceNutrientName: nutrientName,
    canonicalFieldPath: reviewClass.canonicalFieldPath,
    reviewCategory: reviewClass.reviewCategory,
    reviewStatus: 'NOT_COUNTED',
  };
}

function classifyUsdaReviewOnlyNutrient(normalizedName: string): {
  canonicalFieldPath: string;
  reviewCategory: string;
  defaultUnit: string;
  noteBuilder: (nutrientName: string) => string;
} | null {
  const isVitaminERelated =
    normalizedName.includes('tocopherol') ||
    normalizedName.includes('tocotrienol') ||
    normalizedName === 'vitamin e, added';
  if (isVitaminERelated) {
    return {
      canonicalFieldPath: 'vitamins.vitaminE',
      reviewCategory: 'USDA_VITAMIN_E_RELATED',
      defaultUnit: 'mg',
      noteBuilder: buildUsdaVitaminEReviewOnlyNote,
    };
  }

  const isVitaminARelated =
    normalizedName === 'vitamin a, rae' ||
    normalizedName === 'retinol' ||
    normalizedName.includes('carotene') ||
    normalizedName.includes('cryptoxanthin') ||
    normalizedName === 'vitamin a';
  if (isVitaminARelated) {
    return {
      canonicalFieldPath: 'vitamins.vitaminA',
      reviewCategory: 'USDA_VITAMIN_A_RELATED',
      defaultUnit: 'µg',
      noteBuilder: buildUsdaVitaminAReviewOnlyNote,
    };
  }

  const isVitaminDRelated =
    normalizedName.includes('vitamin d2') ||
    normalizedName.includes('vitamin d3') ||
    normalizedName.includes('cholecalciferol') ||
    normalizedName.includes('ergocalciferol') ||
    normalizedName.includes('hydroxycholecalciferol');
  if (isVitaminDRelated) {
    return {
      canonicalFieldPath: 'vitamins.vitaminD',
      reviewCategory: 'USDA_VITAMIN_D_RELATED',
      defaultUnit: 'µg',
      noteBuilder: buildUsdaVitaminDReviewOnlyNote,
    };
  }

  const isVitaminKRelated =
    normalizedName.includes('menaquinone') ||
    normalizedName.includes('dihydrophylloquinone');
  if (isVitaminKRelated) {
    return {
      canonicalFieldPath: 'vitamins.vitaminK',
      reviewCategory: 'USDA_VITAMIN_K_RELATED',
      defaultUnit: 'µg',
      noteBuilder: buildUsdaVitaminKReviewOnlyNote,
    };
  }

  const isReviewablePufa =
    normalizedName.startsWith('pufa ') &&
    !normalizedName.includes('18:2') &&
    !normalizedName.includes('18:3 n-3 c,c,c') &&
    !normalizedName.includes('20:4 n-6') &&
    !normalizedName.includes('20:5') &&
    !normalizedName.includes('22:5') &&
    !normalizedName.includes('22:6');
  if (isReviewablePufa) {
    return {
      canonicalFieldPath: 'fattyAcids',
      reviewCategory: 'USDA_FATTY_ACID_RELATED',
      defaultUnit: 'g',
      noteBuilder: buildUsdaFattyAcidReviewOnlyNote,
    };
  }

  return null;
}

function buildUsdaVitaminEReviewOnlyNote(nutrientName: string): string {
  const normalizedName = nutrientName.toLowerCase();
  if (normalizedName.includes('tocotrienol')) {
    return '未计入维生素 E 达标值：当前 FEDIAF/NRC 口径未提供犬猫生育三烯酚换算依据。';
  }
  if (normalizedName === 'vitamin e, added') {
    return '未计入维生素 E 达标值：添加型维生素 E 需要确认产品标签中的具体来源形态后再换算。';
  }
  return '未计入维生素 E 达标值：当前仅自动计入来源明确且有 FEDIAF 换算依据的生育酚形态；无法识别的形态先保留供人工审核。';
}

function buildUsdaVitaminAReviewOnlyNote(nutrientName: string): string {
  const normalizedName = nutrientName.toLowerCase();
  if (
    normalizedName.includes('carotene') ||
    normalizedName.includes('cryptoxanthin')
  ) {
    return '未计入维生素 A 主字段：当前仅自动计入视黄醇与 β-胡萝卜素；其他类胡萝卜素尚无本系统确认的犬用活性换算依据，先保留来源项供审核。';
  }
  return '未计入维生素 A 主字段：主字段优先采用视黄醇与 β-胡萝卜素按 FEDIAF 2025 犬用活性换算；不可拆分的 RAE/RE 来源项仅保留用于追溯和人工审核。';
}

function buildUsdaVitaminDReviewOnlyNote(nutrientName: string): string {
  const normalizedName = nutrientName.toLowerCase();
  if (
    normalizedName.includes('vitamin d2') ||
    normalizedName.includes('ergocalciferol')
  ) {
    return '未单独计入维生素 D 主字段：D2 形态先保留来源项，优先使用 USDA D2+D3 总量。';
  }
  if (normalizedName.includes('hydroxycholecalciferol')) {
    return '未计入维生素 D 主字段：25-hydroxycholecalciferol 不直接按普通 D3 自动换算。';
  }
  return '未单独计入维生素 D 主字段：D3 形态保留用于审核，优先使用 USDA D2+D3 总量。';
}

function buildUsdaVitaminKReviewOnlyNote(): string {
  return '未计入维生素 K 主字段：当前主字段采用 phylloquinone (K1)，其他 K 形态先保留供人工审核。';
}

function buildUsdaFattyAcidReviewOnlyNote(): string {
  return '未计入脂肪酸主字段：当前配方主字段只自动计入 LA、ALA、AA、EPA、DPA、DHA 等目标脂肪酸，其他 PUFA 先保留供审核。';
}

export function buildUsdaFdcSourceVersion(
  sourceDate: string | null | undefined,
): string {
  const normalizedDate = sourceDate?.trim();
  return normalizedDate ? `USDA_FDC:${normalizedDate}` : 'USDA_FDC';
}

export function attachUsdaFdcProfileMetadata(
  profile: NutritionProfileV2,
  options: {
    externalId: string | number;
    sourceVersion?: string | null;
    sourceTitle?: string | null;
    confidenceLevel?: NutritionMatchConfidence;
  },
): NutritionProfileV2 {
  profile.meta.sourceType = 'USDA';
  profile.meta.sourceKind = 'FOOD_DATABASE';
  profile.meta.sourceCode = 'USDA_FDC';
  profile.meta.sourceProvider = USDA_SOURCE_PROVIDER;
  profile.meta.externalId = String(options.externalId).trim();
  profile.meta.sourceVersion = options.sourceVersion?.trim() || 'USDA_FDC';
  profile.meta.confidenceLevel = options.confidenceLevel ?? 'MEDIUM';
  profile.meta.sourceTitle =
    options.sourceTitle?.trim() || USDA_SOURCE_PROVIDER;
  return profile;
}

export function attachSourceRecordProfileMetadata(
  profile: NutritionProfileV2,
  options: {
    sourceType?: string | null;
    sourceKey?: string | null;
    sourceTitle?: string | null;
    sourceDetail?: unknown;
    confidenceLevel?: NutritionMatchConfidence;
    versionNote?: string | null;
  },
): NutritionProfileV2 {
  const sourceDefinition = normalizeLegacyNutritionSourceType(
    options.sourceType,
  );
  const sourceProvider =
    getSourceProviderFromDetail(options.sourceDetail) ??
    profile.meta.sourceProvider ??
    sourceDefinition?.sourceProvider ??
    null;
  const externalId =
    profile.meta.externalId ??
    getExternalIdFromSourceKey(options.sourceKey, options.sourceType);
  const sourceVersion =
    profile.meta.sourceVersion ??
    getSourceVersionFromSourceRecord({
      sourceCode: sourceDefinition?.sourceCode ?? profile.meta.sourceCode,
      sourceDetail: options.sourceDetail,
    });

  return {
    ...profile,
    meta: {
      ...profile.meta,
      sourceType:
        (options.sourceType as NutritionProfileV2['meta']['sourceType']) ??
        profile.meta.sourceType,
      sourceKind:
        profile.meta.sourceKind ?? sourceDefinition?.sourceKind ?? null,
      sourceCode:
        profile.meta.sourceCode ?? sourceDefinition?.sourceCode ?? null,
      sourceVersion,
      externalId,
      sourceTitle:
        options.sourceTitle?.trim() || profile.meta.sourceTitle || null,
      sourceProvider,
      confidenceLevel: options.confidenceLevel ?? profile.meta.confidenceLevel,
      versionNote: options.versionNote ?? profile.meta.versionNote ?? null,
    },
  };
}

function getSourceProviderFromDetail(sourceDetail: unknown): string | null {
  if (
    !sourceDetail ||
    typeof sourceDetail !== 'object' ||
    Array.isArray(sourceDetail)
  ) {
    return null;
  }

  const detail = sourceDetail as Record<string, unknown>;
  const provider = detail.provider ?? detail.sourceProvider;

  return typeof provider === 'string' && provider.trim()
    ? provider.trim()
    : null;
}

function getExternalIdFromSourceKey(
  sourceKey: string | null | undefined,
  sourceType: string | null | undefined,
): string | null {
  const normalizedSourceKey = sourceKey?.trim();
  if (!normalizedSourceKey) {
    return null;
  }

  const prefix = sourceType?.trim() ? `${sourceType.trim()}:` : '';
  if (prefix && normalizedSourceKey.startsWith(prefix)) {
    return normalizedSourceKey.slice(prefix.length) || null;
  }

  return normalizedSourceKey;
}

function getSourceVersionFromSourceRecord({
  sourceCode,
  sourceDetail,
}: {
  sourceCode: string | null | undefined;
  sourceDetail: unknown;
}): string | null {
  if (sourceCode !== 'USDA_FDC') {
    return null;
  }

  const detail =
    sourceDetail &&
    typeof sourceDetail === 'object' &&
    !Array.isArray(sourceDetail)
      ? (sourceDetail as Record<string, unknown>)
      : {};
  const sourceDate = detail.publishedDate ?? detail.publicationDate;

  return buildUsdaFdcSourceVersion(
    typeof sourceDate === 'string' ? sourceDate : null,
  );
}

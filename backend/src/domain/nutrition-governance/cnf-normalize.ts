import type { NutritionProfileV2 } from '../ingredient/types';
import { mapUsdaNutrientsToNutritionProfile } from './nutrition-governance.utils';

export interface CnfRawAmount {
  nutrientCode: string;
  value: number;
}

export interface CnfCodeMapEntry {
  fdcId: number;
  name: string;
}

const CNF_SOURCE_PROVIDER = 'Health Canada';
const CNF_SOURCE_TITLE = 'Canadian Nutrient File (CNF) 2026';
const CNF_SOURCE_VERSION = 'CNF_2026_14TH';

/**
 * 把 CNF 的原始营养素值（CNF 编码）翻译成 FDC id 后复用 USDA 归一化逻辑。
 *
 * - 同一 nutrientCode 只保留第一次出现（不累加、不让后续行覆盖）。
 * - 翻不出的编码与非有限数值直接丢弃。
 * - 只负责构造 profile，不写库。
 */
export function buildCnfNutritionProfile(input: {
  amounts: readonly CnfRawAmount[];
  codeMap: Record<string, CnfCodeMapEntry>;
  food: { foodCode: string; description: string };
}): NutritionProfileV2 {
  const firstAmountByCode = new Map<string, CnfRawAmount>();
  for (const amount of input.amounts) {
    if (!firstAmountByCode.has(amount.nutrientCode)) {
      firstAmountByCode.set(amount.nutrientCode, amount);
    }
  }

  const nutrients = [...firstAmountByCode.values()].flatMap((amount) => {
    const entry = input.codeMap[amount.nutrientCode];
    if (!entry || !Number.isFinite(amount.value)) {
      return [];
    }
    return [
      {
        amount: amount.value,
        nutrient: {
          id: entry.fdcId,
          name: entry.name,
          unitName: '',
        },
      },
    ];
  });

  const profile = mapUsdaNutrientsToNutritionProfile(nutrients);
  profile.meta.sourceType = 'CNF';
  profile.meta.sourceCode = 'CNF';
  profile.meta.sourceProvider = CNF_SOURCE_PROVIDER;
  profile.meta.sourceTitle = CNF_SOURCE_TITLE;
  profile.meta.externalId = `CNF:${input.food.foodCode}`;
  profile.meta.sourceVersion = CNF_SOURCE_VERSION;
  profile.meta.confidenceLevel = 'MEDIUM';
  return profile;
}

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

const MINERAL_FIELD_PREFIX = 'minerals.';

/**
 * 只挑出 built 里“矿物质字段且有值”的元数据条目。
 *
 * `buildCnfNutritionProfile` 只映射矿物质；这里显式按前缀过滤，
 * 防止 macros / vitamins 等其它 tab 的元数据被整体替换掉。
 */
function pickMineralEntries<T>(
  entries: Record<string, T> | undefined,
): Record<string, T> {
  const picked: Record<string, T> = {};
  for (const [key, value] of Object.entries(entries ?? {})) {
    if (
      key.startsWith(MINERAL_FIELD_PREFIX) &&
      value !== null &&
      value !== undefined
    ) {
      picked[key] = value;
    }
  }
  return picked;
}

/**
 * 把重新归一化出来的矿物质合并进现有 profile。
 *
 * 不能整体替换：重建的 profile 里 `meta.sampleState`、
 * macros/vitamins 的 `meta.sourceForms[*].originalUnit` 等信息并不存在，
 * 整体替换会把它们抹掉。这里只换 `minerals` tab 与矿物质相关的
 * `meta.sourceForms` / `meta.conversionNotes` 条目，其余字段原样保留。
 *
 * 纯函数：不修改 existing / built。
 */
export function mergeCnfMinerals(
  existing: NutritionProfileV2 | null,
  built: NutritionProfileV2,
): NutritionProfileV2 {
  if (!existing) {
    return built;
  }

  return {
    ...existing,
    minerals: built.minerals,
    meta: {
      ...existing.meta,
      sourceForms: {
        ...(existing.meta.sourceForms ?? {}),
        ...pickMineralEntries(built.meta.sourceForms),
      },
      conversionNotes: {
        ...(existing.meta.conversionNotes ?? {}),
        ...pickMineralEntries(built.meta.conversionNotes),
      },
    },
  };
}

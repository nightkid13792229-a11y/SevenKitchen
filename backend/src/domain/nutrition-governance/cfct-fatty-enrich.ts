import { FATTY_ACID_NUTRIENT_KEYS } from '../ingredient/nutrition-profile.constants';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

type CfctFattyFieldKey = (typeof FATTY_ACID_NUTRIENT_KEYS)[number];

/**
 * CFCT 脂肪酸表 → 营养目录字段的原始单位。
 *
 * CFCT 脂肪酸表的 9 个可入库字段已经在抽取阶段从“占总脂肪酸百分比”
 * 换算好：前 6 个是 g/100g，EPA / DPA / DHA 是 mg/100g。这里不再做
 * 数值换算，只按目录单位原样写入；单位与 `NUTRITION_FIELD_CATALOG`
 * 的一致性由单测守住（见 cfct-fatty-enrich.spec.ts）。
 */
export const CFCT_FATTY_FIELD_UNITS: Record<CfctFattyFieldKey, 'g' | 'mg'> = {
  saturatedFattyAcids: 'g',
  monounsaturatedFattyAcids: 'g',
  polyunsaturatedFattyAcids: 'g',
  linoleicAcid: 'g',
  alphaLinolenicAcid: 'g',
  arachidonicAcid: 'g',
  epa: 'mg',
  dpa: 'mg',
  dha: 'mg',
};

export interface CfctFattyMergeResult {
  profile: NutritionProfileV2;
  /** 实际写入 profile 的目录字段 key。 */
  filled: string[];
  /** 目录外、无法写入的原始脂肪酸 key。 */
  skipped: string[];
}

const FATTY_ACID_TAB = 'fattyAcids';

function isCfctFattyField(key: string): key is CfctFattyFieldKey {
  return Object.prototype.hasOwnProperty.call(CFCT_FATTY_FIELD_UNITS, key);
}

/**
 * 把 CFCT 已换算好的脂肪酸值合并进现有 profile。
 *
 * 口径：
 * - 只接受有限且 ≥0 的数值；null / 负数 / NaN / Infinity 一律忽略；
 *   明确的 0 是有效表值，必须保留；
 * - 只改 `fattyAcids` tab 与对应的 `meta.sourceForms` 条目，其它 tab 和
 *   meta 字段原样保留；
 * - 原值不换算：前 6 个字段是 g/100g，EPA / DPA / DHA 是 mg/100g，
 *   与目录单位一致；
 * - 纯函数：不修改 existing / fatty。
 */
export function mergeCfctFatty(
  existing: NutritionProfileV2,
  fatty: Record<string, number>,
): CfctFattyMergeResult {
  const filled: string[] = [];
  const skipped: string[] = [];
  const fattyAcids: NutritionProfileV2['fattyAcids'] = {
    ...(existing.fattyAcids ?? {}),
  };
  const sourceForms: Record<string, NutritionSourceForm> = {
    ...(existing.meta.sourceForms ?? {}),
  };

  for (const [sourceKey, value] of Object.entries(fatty ?? {})) {
    if (!isCfctFattyField(sourceKey)) {
      skipped.push(sourceKey);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      continue;
    }

    const originalUnit = CFCT_FATTY_FIELD_UNITS[sourceKey];
    fattyAcids[sourceKey] = value;
    sourceForms[`${FATTY_ACID_TAB}.${sourceKey}`] = {
      sourceNutrientName: sourceKey,
      originalValue: value,
      originalUnit,
      canonicalValue: value,
      canonicalUnit: originalUnit,
      basisType: 'PER_100_G',
    };
    filled.push(sourceKey);
  }

  return {
    profile: {
      ...existing,
      fattyAcids,
      meta: {
        ...existing.meta,
        sourceForms,
      },
    },
    filled,
    skipped,
  };
}

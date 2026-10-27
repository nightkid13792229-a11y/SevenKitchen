import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

/**
 * CFCT 微量成分表（胆碱 / 生物素 / 泛酸）→ 营养目录字段。
 *
 * 三者恰好在目录里都有对应字段，且抽取阶段已经是每 100g 口径：
 * - choline        mg/100g → vitamins.choline
 * - biotin         μg/100g → vitamins.vitaminB7
 * - pantothenicAcid mg/100g → vitamins.vitaminB5
 *
 * 表中有的食品只有 1~2 项，缺项不补、不造 0；单位与
 * `NUTRITION_FIELD_CATALOG` 的一致性由单测守住
 * （见 cfct-micro-enrich.spec.ts）。
 */
export interface CfctMicroFieldMapping {
  field: 'choline' | 'vitaminB7' | 'vitaminB5';
  unit: 'mg' | 'μg';
}

export const CFCT_MICRO_FIELD_MAP: Record<string, CfctMicroFieldMapping> = {
  choline: { field: 'choline', unit: 'mg' },
  biotin: { field: 'vitaminB7', unit: 'μg' },
  pantothenicAcid: { field: 'vitaminB5', unit: 'mg' },
};

export interface CfctMicroMergeResult {
  profile: NutritionProfileV2;
  /** 实际写入 profile 的目录字段 key。 */
  filled: string[];
  /** 目录外、无法写入的原始微量成分 key。 */
  skipped: string[];
}

const VITAMIN_TAB = 'vitamins';

function getMicroMapping(sourceKey: string): CfctMicroFieldMapping | undefined {
  return Object.prototype.hasOwnProperty.call(CFCT_MICRO_FIELD_MAP, sourceKey)
    ? CFCT_MICRO_FIELD_MAP[sourceKey]
    : undefined;
}

/**
 * 把 CFCT 微量成分值合并进现有 profile。
 *
 * 口径：
 * - 只接受有限且 ≥0 的数值；null / 负数 / NaN / Infinity 一律忽略；
 *   明确的 0 是有效表值，必须保留；
 * - 只改 `vitamins` tab 与对应的 `meta.sourceForms` 条目，其它 tab 和
 *   meta 字段原样保留；
 * - 原值不换算：三者与目录单位一致（mg / μg / mg），profile 里存同样的
 *   数值，原始值保留在 `meta.sourceForms`；
 * - 纯函数：不修改 existing / micro。
 */
export function mergeCfctMicro(
  existing: NutritionProfileV2,
  micro: Record<string, number>,
): CfctMicroMergeResult {
  const filled: string[] = [];
  const skipped: string[] = [];
  const vitamins: NutritionProfileV2['vitamins'] = {
    ...(existing.vitamins ?? {}),
  };
  const sourceForms: Record<string, NutritionSourceForm> = {
    ...(existing.meta.sourceForms ?? {}),
  };

  for (const [sourceKey, value] of Object.entries(micro ?? {})) {
    const mapping = getMicroMapping(sourceKey);
    if (!mapping) {
      skipped.push(sourceKey);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      continue;
    }

    vitamins[mapping.field] = value;
    sourceForms[`${VITAMIN_TAB}.${mapping.field}`] = {
      sourceNutrientName: sourceKey,
      originalValue: value,
      originalUnit: mapping.unit,
      canonicalValue: value,
      canonicalUnit: mapping.unit,
      basisType: 'PER_100_G',
    };
    filled.push(mapping.field);
  }

  return {
    profile: {
      ...existing,
      vitamins,
      meta: {
        ...existing.meta,
        sourceForms,
      },
    },
    filled,
    skipped,
  };
}

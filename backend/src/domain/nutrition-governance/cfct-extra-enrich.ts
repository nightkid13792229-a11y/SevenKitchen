import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

/**
 * CFCT 碘 / 叶酸表 → 营养目录字段。
 *
 * 两张表在导入阶段都没有食品编码，只保留按名称唯一匹配的食品；抽取时
 * 已经是每 100g 口径，且与目录单位一致，因此这里只写入、不再换算：
 * - iodine µg/100g → minerals.iodine
 * - folate µg/100g → vitamins.vitaminB9
 *
 * 表里只有其中一项的食品不补另一项、不造 0；目录外的 key 只跳过。
 */
export const CFCT_EXTRA_FIELD_MAP = {
  iodine: { tab: 'minerals', field: 'iodine', unit: 'μg' },
  folate: { tab: 'vitamins', field: 'vitaminB9', unit: 'μg' },
} as const;

type CfctExtraFieldMapping =
  (typeof CFCT_EXTRA_FIELD_MAP)[keyof typeof CFCT_EXTRA_FIELD_MAP];

export interface CfctExtraMergeResult {
  profile: NutritionProfileV2;
  /** 实际写入 profile 的目录字段 key。 */
  filled: string[];
  /** 目录外、无法写入的原始 key。 */
  skipped: string[];
}

function getExtraMapping(sourceKey: string): CfctExtraFieldMapping | undefined {
  return Object.prototype.hasOwnProperty.call(CFCT_EXTRA_FIELD_MAP, sourceKey)
    ? CFCT_EXTRA_FIELD_MAP[sourceKey as keyof typeof CFCT_EXTRA_FIELD_MAP]
    : undefined;
}

/**
 * 把 CFCT 碘 / 叶酸原始值合并进现有 profile。
 *
 * 口径：
 * - 只接受有限且 ≥0 的数值；null / 负数 / NaN / Infinity 一律忽略；
 *   明确的 0 是有效表值，必须保留；
 * - 只改对应的 `minerals` / `vitamins` tab 与 `meta.sourceForms` 条目，
 *   其它 tab 和 meta 字段原样保留；
 * - 原值不换算：两张表与目录单位一致（µg），profile 里存同样的数值，
 *   原始值保留在 `meta.sourceForms`；
 * - 纯函数：不修改 existing / values。
 */
export function mergeCfctExtra(
  existing: NutritionProfileV2,
  values: Record<string, number>,
): CfctExtraMergeResult {
  const filled: string[] = [];
  const skipped: string[] = [];
  const minerals: NutritionProfileV2['minerals'] = {
    ...(existing.minerals ?? {}),
  };
  const vitamins: NutritionProfileV2['vitamins'] = {
    ...(existing.vitamins ?? {}),
  };
  const sourceForms: Record<string, NutritionSourceForm> = {
    ...(existing.meta.sourceForms ?? {}),
  };

  for (const [sourceKey, value] of Object.entries(values ?? {})) {
    const mapping = getExtraMapping(sourceKey);
    if (!mapping) {
      skipped.push(sourceKey);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      continue;
    }

    if (mapping.tab === 'minerals') {
      minerals[mapping.field] = value;
    } else {
      vitamins[mapping.field] = value;
    }
    sourceForms[`${mapping.tab}.${mapping.field}`] = {
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
      minerals,
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

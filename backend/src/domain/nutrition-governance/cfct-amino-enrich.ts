import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

/**
 * CFCT 氨基酸表（mg/100g）→ 营养目录字段。
 *
 * 只映射“CFCT 原表确实有列 + 目录里有这个字段”的交集：
 * - CFCT 表里的 alanine / asparticAcid / serine 不在 60 字段目录里，
 *   不进入 profile（原值仍在导入记录的 rawData / 本脚本的日志里）；
 * - 目录里虽然有 taurine，但 CFCT 氨基酸表没有牛磺酸列，不能凭空造来源，
 *   因此这里刻意不映射 taurine。
 */
export const CFCT_AMINO_FIELD_MAP: Record<string, string> = {
  isoleucine: 'isoleucine',
  leucine: 'leucine',
  lysine: 'lysine',
  methionine: 'methionine',
  cystine: 'cystine',
  phenylalanine: 'phenylalanine',
  tyrosine: 'tyrosine',
  threonine: 'threonine',
  tryptophan: 'tryptophan',
  valine: 'valine',
  histidine: 'histidine',
  arginine: 'arginine',
  glutamicAcid: 'glutamicAcid',
  glycine: 'glycine',
  proline: 'proline',
};

export interface CfctAminoMergeResult {
  profile: NutritionProfileV2;
  /** 实际写入 profile 的目录字段 key。 */
  filled: string[];
  /** 目录外、无法写入的原始氨基酸 key。 */
  skipped: string[];
}

const AMINO_ACID_TAB = 'aminoAcids';
const MG_PER_GRAM = 1000;
const CANONICAL_DECIMALS = 4;
const CANONICAL_FACTOR = 10 ** CANONICAL_DECIMALS;

/** mg/100g → g/100g，目录值保留 4 位小数。 */
function mgToGram(mg: number): number {
  return Math.round((mg / MG_PER_GRAM) * CANONICAL_FACTOR) / CANONICAL_FACTOR;
}

/**
 * 把 CFCT 氨基酸原始值合并进现有 profile。
 *
 * 口径：
 * - 只接受有限且 ≥0 的数值；null / 负数 / NaN / Infinity 一律忽略；
 *   明确的 0 是有效表值，必须保留；
 * - 只改 `aminoAcids` tab 与对应的 `meta.sourceForms` 条目，其它 tab 和
 *   meta 字段原样保留；
 * - 纯函数：不修改 existing / aminoMg。
 */
export function mergeCfctAmino(
  existing: NutritionProfileV2,
  aminoMg: Record<string, number>,
): CfctAminoMergeResult {
  const filled: string[] = [];
  const skipped: string[] = [];
  const aminoAcids: NutritionProfileV2['aminoAcids'] = {
    ...(existing.aminoAcids ?? {}),
  };
  const sourceForms: Record<string, NutritionSourceForm> = {
    ...(existing.meta.sourceForms ?? {}),
  };

  for (const [sourceKey, mg] of Object.entries(aminoMg ?? {})) {
    const field = CFCT_AMINO_FIELD_MAP[sourceKey] as
      | keyof NutritionProfileV2['aminoAcids']
      | undefined;
    if (!field) {
      skipped.push(sourceKey);
      continue;
    }
    if (typeof mg !== 'number' || !Number.isFinite(mg) || mg < 0) {
      continue;
    }

    const grams = mgToGram(mg);
    aminoAcids[field] = grams;
    sourceForms[`${AMINO_ACID_TAB}.${field}`] = {
      sourceNutrientName: sourceKey,
      originalValue: mg,
      originalUnit: 'mg',
      canonicalValue: grams,
      canonicalUnit: 'g',
      basisType: 'PER_100_G',
    };
    filled.push(field);
  }

  return {
    profile: {
      ...existing,
      aminoAcids,
      meta: {
        ...existing.meta,
        sourceForms,
      },
    },
    filled,
    skipped,
  };
}

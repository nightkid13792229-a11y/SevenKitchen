import type {
  CheckItem,
  NutritionEvidenceEntry,
  ProfileDraft,
} from '../../application/ingredient-creation/ingredient-creation.types';
import { readCatalogFieldValue } from '../ingredient/nutrition-coverage';
import { NUTRITION_FIELD_CATALOG } from '../ingredient/nutrition-field-catalog';

/**
 * 营养档案「数值 vs 来源」一致性核对。
 *
 * 为什么必须是阻断项：AI 写入时只携带一个合法的 sourceRecordId，很容易把
 * 25 抄成 45 而核验看不出来；这份纯函数把来源记录里同字段的值读出来比对，
 * 不一致就不许当成「直接来自来源」。工具层（writeNutrition）在写入时就先拦，
 * 这里再对历史草稿/人工补丁兜一道底。
 *
 * 只收纯数据，不碰 Prisma：调用方负责把来源记录读成
 * `SourceConsistencyRecord`（basis + 目录字段值）。
 */

export type SourceBasis =
  | 'PER_100_G'
  | 'PER_100_ML'
  | 'PER_1_G'
  | 'PER_1_ML'
  | 'PER_SERVING'
  | 'OTHER';

export interface SourceConsistencyRecord {
  id: string;
  basis: SourceBasis;
  /** 目录字段 -> 目录单位下的数值；没有的字段不出现。 */
  values: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 读来源口径。
 *
 * 2026-11-21 之前导入的食材来源大量没有 `meta.rawBasisType`，它们按每 100g
 * 使用；缺省不能当成「未知」而把历史数据全拦掉。
 */
export function readSourceBasis(normalizedNutrition: unknown): SourceBasis {
  const meta =
    isRecord(normalizedNutrition) && isRecord(normalizedNutrition.meta)
      ? normalizedNutrition.meta
      : null;
  const raw =
    meta && typeof meta.rawBasisType === 'string'
      ? meta.rawBasisType.trim().toUpperCase().replace(/\s+/g, '_')
      : '';

  if (!raw || raw === 'PER_100_G' || raw === 'PER_100G') {
    return 'PER_100_G';
  }
  if (raw === 'PER_100_ML' || raw === 'PER_100ML') {
    return 'PER_100_ML';
  }
  if (raw === 'PER_1_G' || raw === 'PER_1G') {
    return 'PER_1_G';
  }
  if (raw === 'PER_1_ML' || raw === 'PER_1ML') {
    return 'PER_1_ML';
  }
  if (raw === 'PER_SERVING') {
    return 'PER_SERVING';
  }
  return 'OTHER';
}

/** 口径的人话标签：工具结果与错误文案共用，避免页面/模型看到内部枚举。 */
export const SOURCE_BASIS_LABELS: Readonly<Record<SourceBasis, string>> = {
  PER_100_G: '每 100g',
  PER_1_G: '每 1g',
  PER_100_ML: '每 100ml',
  PER_1_ML: '每 1ml',
  PER_SERVING: '每份',
  OTHER: '未知口径',
};

/**
 * 来源值 → 「每 100g」的倍率；不可等价换算的口径返回 null（fail closed）。
 *
 * 每 1g 就是每 100g 的 1/100，线性可换；每份 / 每 100ml 缺份量克数或密度，
 * 本流程不换算，按设计直接拒绝。返回 null 的调用方必须当「不可用」处理，
 * 不能悄悄按 1 倍算——那会把每份的营养值当成每 100g 写进档案。
 */
export function sourceBasisToPer100gScale(basis: SourceBasis): number | null {
  if (basis === 'PER_100_G') {
    return 1;
  }
  if (basis === 'PER_1_G') {
    return 100;
  }
  return null;
}

/** 把来源记录的 normalizedNutrition 压成目录字段值；没有值的不补 0。 */
export function collectSourceConsistencyValues(
  normalizedNutrition: unknown,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const field of NUTRITION_FIELD_CATALOG) {
    const value = readCatalogFieldValue(
      normalizedNutrition,
      field.fieldPath,
    );
    if (value !== null) {
      values[field.fieldPath] = value;
    }
  }
  return values;
}

function isManual(entry: NutritionEvidenceEntry): boolean {
  return (
    entry.status === 'MANUAL' ||
    (typeof entry.confirmedBy === 'string' && entry.confirmedBy.trim() !== '')
  );
}

/**
 * 允许 0.5% 的四舍五入误差：来源表本身有小数位差异，抄同一个数应该严丝合缝，
 * 但换算/导入可能留下末位差。超过 0.5% 就是两个数，不是精度问题。
 */
export function sourceValuesMatch(written: number, source: number): boolean {
  if (!Number.isFinite(written) || !Number.isFinite(source)) {
    return false;
  }
  return Math.abs(written - source) <= Math.max(1e-6, Math.abs(source) * 0.005);
}

/**
 * 逐档案逐字段核对；返回的 item 直接进 `FinalCheckResult.blocking`。
 *
 * - 来源记录缺失 / 口径不是每 100g → 整份档案一条；
 * - 有值、非人工、却没有来源 / 来源里没有该字段 / 数值对不上 → 逐字段一条。
 */
export function checkProfileSourceConsistency(
  profiles: readonly ProfileDraft[],
  records: ReadonlyMap<string, SourceConsistencyRecord>,
): CheckItem[] {
  const items: CheckItem[] = [];

  profiles.forEach((profile, profileIndex) => {
    const record = records.get(profile.sourceRecordId);
    if (!record) {
      items.push({
        code: 'SOURCE_RECORD_MISSING',
        message: `第 ${profileIndex + 1} 份档案引用的来源记录 ${profile.sourceRecordId} 不存在，数值无法核对。`,
        fieldPath: `profiles.${profileIndex}`,
        suggestion: '重新选一条存在的来源记录，或让 AI 重新查库。',
      });
      return;
    }

    // 只有「有来源值的格子」才受口径约束：整份都是人工核对值时，
    // 值不是从来源抄的，口径不影响这些值能不能用。
    const hasSourceBackedValue = profile.entries.some(
      (entry) =>
        entry &&
        typeof entry.fieldPath === 'string' &&
        entry.finalValue !== null &&
        entry.finalValue !== undefined &&
        Number.isFinite(entry.finalValue) &&
        !isManual(entry),
    );
    const scale = sourceBasisToPer100gScale(record.basis);
    if (scale === null) {
      if (hasSourceBackedValue) {
        items.push({
          code: 'SOURCE_BASIS_NOT_PER_100G',
          message: `第 ${profileIndex + 1} 份档案的来源口径是 ${record.basis}，档案口径是每 100g；本流程不做换算，不能直接写入。`,
          fieldPath: `profiles.${profileIndex}`,
          suggestion:
            '换一条每 100g 的来源记录；不要拿每份/每 100ml 的数直接当每 100g。',
        });
        return;
      }
    }

    for (const entry of profile.entries) {
      if (
        !entry ||
        typeof entry.fieldPath !== 'string' ||
        entry.finalValue === null ||
        entry.finalValue === undefined ||
        !Number.isFinite(entry.finalValue) ||
        isManual(entry)
      ) {
        continue;
      }

      const sourceRecordId = entry.sourceRecordId ?? null;
      if (!sourceRecordId) {
        items.push({
          code: 'SOURCE_FIELD_MISSING',
          message: `字段 ${entry.fieldPath} 有值（${entry.finalValue}${entry.unit}），但没有来源记录，不能算「来自来源」。`,
          fieldPath: entry.fieldPath,
          suggestion: '补来源，或由人改成人工核对值（人工值不会被 AI 覆盖）。',
        });
        continue;
      }

      const entryRecord = records.get(sourceRecordId);
      if (!entryRecord) {
        items.push({
          code: 'SOURCE_RECORD_MISSING',
          message: `字段 ${entry.fieldPath} 引用的来源记录 ${sourceRecordId} 不存在，数值无法核对。`,
          fieldPath: entry.fieldPath,
          suggestion: '重新选一条存在的来源记录。',
        });
        continue;
      }

      const sourceValue = entryRecord.values[entry.fieldPath];
      if (!Number.isFinite(sourceValue)) {
        items.push({
          code: 'SOURCE_FIELD_MISSING',
          message: `来源记录 ${sourceRecordId} 里没有字段 ${entry.fieldPath} 的数值；不能把档案里的 ${entry.finalValue}${entry.unit} 当成来源值。`,
          fieldPath: entry.fieldPath,
          suggestion: '换一条有该字段的来源，或留空。',
        });
        continue;
      }

      // 每 1g 的来源要 ×100 才是每 100g 的可比值（见 sourceBasisToPer100gScale）。
      const comparableSource = scale === null ? sourceValue : sourceValue * scale;
      if (!sourceValuesMatch(entry.finalValue, comparableSource)) {
        items.push({
          code: 'SOURCE_VALUE_MISMATCH',
          message: `字段 ${entry.fieldPath} 写的是 ${entry.finalValue}${entry.unit}，来源是 ${comparableSource}${entry.unit}${
            scale === 100 ? '（按每 1g 记录，已换算成每 100g）' : ''
          }；两个数对不上，不能当成「直接来自来源」。`,
          fieldPath: entry.fieldPath,
          suggestion: '按来源值改正；来源确实不对就换一条来源。',
        });
      }
    }
  });

  return items;
}

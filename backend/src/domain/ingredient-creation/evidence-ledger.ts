import type {
  MergePlan,
  MergeRow,
  NutritionEvidenceEntry,
} from '../../application/ingredient-creation/ingredient-creation.types';
import { NUTRITION_FIELD_CATALOG } from '../ingredient/nutrition-field-catalog';

/**
 * 证据账本的一份来源：`normalizedNutrition` 是 `NutritionProfileV2` 形状的
 * JSON（来源记录里的原样数据），溯源信息在 `meta.fieldSources` /
 * `meta.sourceForms` 里。
 */
export interface EvidenceLedgerSource {
  sourceRecordId: string;
  normalizedNutrition: unknown;
}

export interface EvidenceLedger {
  entries: NutritionEvidenceEntry[];
  /**
   * 有最终值、但拿不到完整「来源原文值 + 来源原文单位」的字段。
   *
   * 缺失字段（`plan.missingFields`）不在这里：缺失是「没数据」，
   * 这里是「有数据、但说不清怎么来的」。按营养字段目录排序、去重。
   */
  missingProvenance: string[];
}

export interface BuildEvidenceLedgerInput {
  plan: MergePlan;
  sources: EvidenceLedgerSource[];
}

interface ProfileProvenance {
  originalValue: number | null;
  /** 原文值是否真的出现过（出现过但转不出数字，也算出现过）。 */
  originalValueWasPresent: boolean;
  originalUnit: string | null;
  canonicalValue: number | null;
  canonicalUnit: string | null;
}

interface ResolvedProvenance {
  sourceValue: number | null;
  sourceUnit: string | null;
  canonicalValue: number | null;
  canonicalUnit: string | null;
}

const EMPTY_PROVENANCE: ProfileProvenance = {
  originalValue: null,
  originalValueWasPresent: false,
  originalUnit: null,
  canonicalValue: null,
  canonicalUnit: null,
};

const FIELD_CATALOG_INDEX: ReadonlyMap<string, number> = new Map(
  NUTRITION_FIELD_CATALOG.map((field, index) => [field.fieldPath, index]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * 来源原文值可能是数字，也可能是字符串（如 `"0.55"`）。
 * 空串、`"n/a"`、非有限数一律算「转不出来」——返回 null，绝不返回 0。
 */
function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFieldEntry(
  container: Record<string, unknown> | null,
  fieldPath: string,
): Record<string, unknown> | null {
  if (!container) {
    return null;
  }
  return isRecord(container[fieldPath]) ? container[fieldPath] : null;
}

/**
 * 读来源档案的字段级溯源。
 *
 * 优先级：`meta.fieldSources[fieldPath]` → `meta.sourceForms[fieldPath]`。
 * 高优先级缺某个键时（例如只存了 canonical 值），用低优先级补那一个键；
 * 两边都有的键以 `fieldSources` 为准。`null` 与缺键都视为没有。
 */
function readProfileProvenance(
  profile: unknown,
  fieldPath: string,
): ProfileProvenance {
  if (!isRecord(profile) || !isRecord(profile.meta)) {
    return EMPTY_PROVENANCE;
  }

  const meta = profile.meta;
  const fieldSources = isRecord(meta.fieldSources) ? meta.fieldSources : null;
  const sourceForms = isRecord(meta.sourceForms) ? meta.sourceForms : null;
  const primary = readFieldEntry(fieldSources, fieldPath);
  const secondary = readFieldEntry(sourceForms, fieldPath);

  const rawOriginalValue = primary?.originalValue ?? secondary?.originalValue;
  const rawOriginalUnit = primary?.originalUnit ?? secondary?.originalUnit;
  const rawCanonicalValue =
    primary?.canonicalValue ?? secondary?.canonicalValue;
  const rawCanonicalUnit = primary?.canonicalUnit ?? secondary?.canonicalUnit;

  return {
    originalValue: parseNumeric(rawOriginalValue),
    originalValueWasPresent:
      rawOriginalValue !== null && rawOriginalValue !== undefined,
    originalUnit: readNonEmptyString(rawOriginalUnit),
    canonicalValue: parseNumeric(rawCanonicalValue),
    canonicalUnit: readNonEmptyString(rawCanonicalUnit),
  };
}

function readRowSourceValue(row: MergeRow): number | null {
  const value = row.sourceValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 溯源优先级：档案的 `fieldSources` / `sourceForms`，最后才回落到行上的
 * `sourceValue` / `sourceUnit`。
 *
 * 注意：档案里**明确写了**原文值但转不出数字时，不再回落到行上的值——
 * 那是「来源数据坏了」，不是「档案没给」，回落到行上会把问题藏起来。
 */
function resolveProvenance(
  row: MergeRow,
  profile: unknown,
): ResolvedProvenance {
  const profileProvenance = readProfileProvenance(profile, row.fieldPath);

  return {
    sourceValue: profileProvenance.originalValueWasPresent
      ? profileProvenance.originalValue
      : readRowSourceValue(row),
    sourceUnit:
      profileProvenance.originalUnit ?? readNonEmptyString(row.sourceUnit),
    canonicalValue: profileProvenance.canonicalValue,
    canonicalUnit: profileProvenance.canonicalUnit,
  };
}

/** 数字展示：去掉浮点尾巴，别把 `550.0000000000001` 写进账本。 */
function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toPrecision(12)));
}

/**
 * 没有换算信息时沿用行状态。行上的 `MANUAL` 目前可能还没进
 * `MergeRow['status']` 的类型联合（另一个任务在改类型），这里按字符串收窄，
 * 等类型补齐后行为不变。
 */
function inheritedStatus(
  status: MergeRow['status'],
): NutritionEvidenceEntry['status'] {
  switch (status as string) {
    case 'MANUAL':
      return 'MANUAL';
    case 'CONVERTED':
      return 'CONVERTED';
    case 'FILLED':
      return 'FILLED';
    default:
      return 'DIRECT';
  }
}

function catalogOrder(fieldPath: string): number {
  return FIELD_CATALOG_INDEX.get(fieldPath) ?? Number.MAX_SAFE_INTEGER;
}

function compareFieldPathsByCatalog(left: string, right: string): number {
  return catalogOrder(left) - catalogOrder(right);
}

/**
 * 把缝合方案的最终值转成可审计的证据行。
 *
 * - 只为 `status !== 'CONFLICT'` 且 `value !== null` 的行产出证据；
 *   冲突行、缺失字段（`plan.missingFields`）都不产出。
 * - 行的 `fieldPath` / `finalValue` / `unit` / `sourceRecordId` 原样落账。
 * - `sourceValue` / `sourceUnit` 能追到就写数字与单位，追不到保持 `null`，
 *   **不写 0**；同时该字段进 `missingProvenance`，但证据行仍然产出。
 * - 有换算（来源原文单位 ≠ 目标单位，或原文值 ≠ 档案 canonical 值）时，
 *   状态记 `CONVERTED`，并写一条 `"0.55 mg → 550 µg"` 的公式；
 *   没有换算信息时沿用行状态。
 * - 输出顺序跟 `plan.rows` 一致；`missingProvenance` 按字段目录排序并去重。
 */
export function buildEvidenceLedger(
  input: BuildEvidenceLedgerInput,
): EvidenceLedger {
  const profilesBySourceId = new Map<string, unknown>();
  for (const source of input.sources) {
    profilesBySourceId.set(source.sourceRecordId, source.normalizedNutrition);
  }

  const entries: NutritionEvidenceEntry[] = [];
  const missingProvenance = new Set<string>();

  for (const row of input.plan.rows) {
    if (row.status === 'CONFLICT' || row.value === null) {
      continue;
    }

    const profile = row.sourceRecordId
      ? profilesBySourceId.get(row.sourceRecordId)
      : undefined;
    const provenance = resolveProvenance(row, profile);

    const targetUnit = readNonEmptyString(row.unit) ?? provenance.canonicalUnit;
    let formula: string | null = null;
    if (
      provenance.sourceValue !== null &&
      provenance.sourceUnit !== null &&
      targetUnit !== null &&
      (provenance.sourceUnit !== targetUnit ||
        (provenance.canonicalValue !== null &&
          provenance.sourceValue !== provenance.canonicalValue))
    ) {
      formula = `${formatNumber(provenance.sourceValue)} ${provenance.sourceUnit} → ${formatNumber(row.value)} ${targetUnit}`;
    }

    entries.push({
      fieldPath: row.fieldPath,
      finalValue: row.value,
      unit: row.unit,
      status: formula ? 'CONVERTED' : inheritedStatus(row.status),
      sourceRecordId: row.sourceRecordId,
      sourceValue: provenance.sourceValue,
      sourceUnit: provenance.sourceUnit,
      formula,
      confirmedBy: null,
      confirmedAt: null,
    });

    if (provenance.sourceValue === null || provenance.sourceUnit === null) {
      missingProvenance.add(row.fieldPath);
    }
  }

  return {
    entries,
    missingProvenance: [...missingProvenance].sort(compareFieldPathsByCatalog),
  };
}

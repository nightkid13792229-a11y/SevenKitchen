import type {
  MergeConflict,
  MergePlan,
  MergeRow,
} from '../../application/ingredient-creation/ingredient-creation.types';
import {
  NUTRITION_FIELD_CATALOG,
  type NutritionFieldDefinition,
} from '../ingredient/nutrition-field-catalog';

/**
 * 缝合方案的一份来源（主来源或补位来源）。
 *
 * `values` 的键是字段目录里的 `fieldPath`（如 `minerals.iron`），值**必须已经
 * 按该字段的目录单位表示**——本模块不做任何单位换算（换算属于确定性换算模块，
 * 且必须能反算回原始值）。`null`、缺键、非有限数一律表示「来源没给这个字段」，
 * **不是 0**：来源真的给了 0，就传 0，两者必须区分开。
 *
 * `sourceValues` + `units` 是**成对的**来源原文（如 `0.55` + `mg`）：调用方已经
 * 按确定性规则把原文换算成 `values` 里的目录单位值（如 `550` + `μg`）。本模块
 * 只把原文照抄进证据/冲突候选，**不做换算**。只传 `units` 不传 `sourceValues`
 * 时按目录单位记（唯一已知的数值是目录单位值，不假装知道原文）。
 */
export interface SourceNutrition {
  sourceRecordId: string;
  values: Record<string, number | null | undefined>;
  units?: Record<string, string | null | undefined>;
  sourceValues?: Record<string, number | null | undefined>;
}

/** 两边（及多个补位来源）数值的相等判定：相对误差 1e-6，浮点噪声不算冲突。 */
const MERGE_RELATIVE_TOLERANCE = 1e-6;

const FIELD_CATALOG_INDEX: ReadonlyMap<string, number> = new Map(
  NUTRITION_FIELD_CATALOG.map((field, index) => [
    field.fieldPath as string,
    index,
  ]),
);

interface ProvidedFieldValue {
  sourceRecordId: string;
  value: number;
  unit: string;
  sourceValue: number;
  sourceUnit: string;
}

function readProvidedValue(
  source: SourceNutrition,
  fieldPath: string,
): number | null {
  const value = source.values[fieldPath];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRawValue(
  source: SourceNutrition,
  fieldPath: string,
): number | null {
  const value = source.sourceValues?.[fieldPath];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readDeclaredUnit(
  source: SourceNutrition,
  fieldPath: string,
): string | null {
  const unit = source.units?.[fieldPath]?.trim();
  return unit ? unit : null;
}

/**
 * 按「主来源在前、补位来源按传入顺序在后」收集一份字段的候选值。
 * 没给这个字段的来源直接跳过：缺失不进候选，更不会补成 0。
 *
 * 目录单位值与来源原文值成对存下：`value/unit` 一定是目录单位（可直接比较、
 * 写入档案），`sourceValue/sourceUnit` 是来源原文（只作证据展示）。没给原文值时
 * 回退成目录单位值与目录单位——不假装知道原文。
 */
function collectProvidedValues(
  primary: SourceNutrition,
  supplementals: readonly SourceNutrition[],
  field: NutritionFieldDefinition,
): ProvidedFieldValue[] {
  const provided: ProvidedFieldValue[] = [];

  for (const source of [primary, ...supplementals]) {
    const fieldPath = field.fieldPath as string;
    const value = readProvidedValue(source, fieldPath);
    if (value === null) {
      continue;
    }

    const rawValue = readRawValue(source, fieldPath);
    const hasRawValue = rawValue !== null;

    provided.push({
      sourceRecordId: source.sourceRecordId,
      value,
      unit: field.unit,
      sourceValue: hasRawValue ? rawValue : value,
      sourceUnit: hasRawValue
        ? (readDeclaredUnit(source, fieldPath) ?? field.unit)
        : field.unit,
    });
  }

  return provided;
}

function nutritionValuesEqual(left: number, right: number): boolean {
  if (left === right) {
    return true;
  }

  const scale = Math.max(Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= MERGE_RELATIVE_TOLERANCE * scale;
}

function providedValuesAgree(provided: readonly ProvidedFieldValue[]): boolean {
  const [reference] = provided;
  return provided.every((entry) =>
    nutritionValuesEqual(entry.value, reference.value),
  );
}

/**
 * 生成缝合方案：**只补缺，不覆盖**。
 *
 * - 主来源有值的字段：主来源自己那行，状态 `DIRECT`。
 * - 主来源没值、恰好一个（或几个取值一致的）补位来源有值：补进来，状态 `FILLED`。
 *   取值一致时按传入顺序取第一个补位来源，结果确定。
 * - 同一字段有值且互不相等（主来源与补位来源之间、或多个补位来源之间）：
 *   **不写最终值**，`MergeRow.value` 保持 `null`、状态 `CONFLICT`，
 *   候选全部进 `conflicts` 等人裁决。
 * - 所有来源都没有的字段：不产生行（也绝不写成 0），按目录顺序进 `missingFields`。
 *
 * 「缺失」与「冲突」是两件事：缺失字段不进 `rows`、不进 `conflicts`；
 * 冲突字段不进 `missingFields`。
 *
 * 行顺序固定按营养字段目录（`nutrition-field-catalog.ts`），不按来源顺序。
 * 目录之外的键一律忽略：缝合方案只承载目录里的字段。
 */
export function buildMergePlan(input: {
  primary: SourceNutrition;
  supplementals: SourceNutrition[];
}): MergePlan {
  const { primary, supplementals } = input;
  const rows: MergeRow[] = [];
  const conflicts: MergeConflict[] = [];
  const missingFields: string[] = [];

  for (const field of NUTRITION_FIELD_CATALOG) {
    const primaryHasValue =
      readProvidedValue(primary, field.fieldPath as string) !== null;
    const provided = collectProvidedValues(primary, supplementals, field);

    if (provided.length === 0) {
      missingFields.push(field.fieldPath);
      continue;
    }

    if (providedValuesAgree(provided)) {
      const [chosen] = provided;
      rows.push({
        fieldPath: field.fieldPath,
        value: chosen.value,
        unit: field.unit,
        status: primaryHasValue ? 'DIRECT' : 'FILLED',
        sourceRecordId: chosen.sourceRecordId,
        sourceValue: chosen.sourceValue,
        sourceUnit: chosen.sourceUnit,
      });
      continue;
    }

    rows.push({
      fieldPath: field.fieldPath,
      value: null,
      unit: field.unit,
      status: 'CONFLICT',
      sourceRecordId: null,
      sourceValue: null,
      sourceUnit: null,
    });
    conflicts.push({
      fieldPath: field.fieldPath,
      candidates: provided.map((entry) => ({
        sourceRecordId: entry.sourceRecordId,
        value: entry.value,
        unit: entry.unit,
        sourceValue: entry.sourceValue,
        sourceUnit: entry.sourceUnit,
      })),
    });
  }

  return {
    primarySourceRecordId: primary.sourceRecordId,
    rows,
    conflicts,
    missingFields,
  };
}

function catalogIndex(fieldPath: string): number {
  return FIELD_CATALOG_INDEX.get(fieldPath) ?? Number.MAX_SAFE_INTEGER;
}

function compareRowsByCatalogOrder(left: MergeRow, right: MergeRow): number {
  return catalogIndex(left.fieldPath) - catalogIndex(right.fieldPath);
}

/**
 * 人对冲突字段做裁决：按选定来源把值写进 `rows`（状态 `MANUAL`，
 * 与自动盖章的 `DIRECT`/`FILLED` 区分开，后面统计「改动率」才分得清），
 * 并从 `conflicts` 里移除这一条。其余行、其余冲突原样保留；
 * `missingFields` 也原样保留——冲突字段本来就不在缺失清单里（有值才冲突）。
 *
 * 写入的行同时保留两套数：`value`/`unit` 是目录单位下的最终值，
 * `sourceValue`/`sourceUnit` 照抄所选候选的来源原文。
 *
 * 候选值只能来自该字段冲突里的 `candidates`——`MergePlan` 不携带各来源的
 * 完整营养数据，所以「选了一个没提供该字段的来源」在这里就是「不在候选里」，
 * 一律抛错，**不猜、不补 0、不回退到别的来源**。
 *
 * 纯函数：不改传入的 `plan`，返回新的方案；行顺序仍然是字段目录顺序。
 */
export function applyManualResolution(
  plan: MergePlan,
  fieldPath: string,
  choice: { sourceRecordId: string },
): MergePlan {
  const field = NUTRITION_FIELD_CATALOG.find(
    (entry) => entry.fieldPath === fieldPath,
  );
  if (!field) {
    throw new Error(`Unknown nutrition field: ${fieldPath}`);
  }

  const conflict = plan.conflicts.find(
    (entry) => entry.fieldPath === fieldPath,
  );
  if (!conflict) {
    throw new Error(`No unresolved conflict for nutrition field: ${fieldPath}`);
  }

  const candidate = conflict.candidates.find(
    (entry) => entry.sourceRecordId === choice.sourceRecordId,
  );
  if (!candidate) {
    throw new Error(
      `Source ${choice.sourceRecordId} did not provide a value for ${fieldPath}`,
    );
  }

  const resolvedRow: MergeRow = {
    fieldPath,
    value: candidate.value,
    unit: field.unit,
    status: 'MANUAL',
    sourceRecordId: candidate.sourceRecordId,
    sourceValue: candidate.sourceValue,
    sourceUnit: candidate.sourceUnit,
  };

  const rows = plan.rows
    .filter((row) => row.fieldPath !== fieldPath)
    .concat(resolvedRow)
    .sort(compareRowsByCatalogOrder);

  return {
    primarySourceRecordId: plan.primarySourceRecordId,
    rows,
    conflicts: plan.conflicts.filter((entry) => entry.fieldPath !== fieldPath),
    missingFields: [...plan.missingFields],
  };
}

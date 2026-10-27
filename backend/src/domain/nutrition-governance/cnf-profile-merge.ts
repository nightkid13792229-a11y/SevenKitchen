import {
  AMINO_ACID_NUTRIENT_KEYS,
  FATTY_ACID_NUTRIENT_KEYS,
  MACRO_NUTRIENT_KEYS,
  MINERAL_NUTRIENT_KEYS,
  VITAMIN_NUTRIENT_KEYS,
} from '../ingredient/nutrition-profile.constants';
import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';
import type {
  NutritionMeta,
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

type NutritionTab = Record<string, number | null>;

const CNF_MERGE_TABS: ReadonlyArray<{
  tabKey: NutritionFieldTab;
  fieldKeys: readonly string[];
}> = [
  { tabKey: 'macros', fieldKeys: MACRO_NUTRIENT_KEYS },
  { tabKey: 'minerals', fieldKeys: MINERAL_NUTRIENT_KEYS },
  { tabKey: 'vitamins', fieldKeys: VITAMIN_NUTRIENT_KEYS },
  { tabKey: 'fattyAcids', fieldKeys: FATTY_ACID_NUTRIENT_KEYS },
  { tabKey: 'aminoAcids', fieldKeys: AMINO_ACID_NUTRIENT_KEYS },
];

export interface CnfProfileFieldDiff {
  /** existing 与 merged 数值不同的字段路径（含“新增有值”与“值变化”）。 */
  changed: string[];
  /** existing 为空、merged 有值的字段路径（验收项 4 的“补上来的字段”）。 */
  gained: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readTabValue(
  profile: NutritionProfileV2,
  tabKey: NutritionFieldTab,
  fieldKey: string,
): number | null {
  const tab = profile[tabKey] as Record<string, number | null | undefined>;
  const value = tab[fieldKey];
  return isFiniteNumber(value) ? value : null;
}

/**
 * 把一个 tab 里 built 的非空数值写进 existing。
 *
 * - 给了白名单（allowedFieldPaths）时只拷贝名单内的字段，其余字段原样保留。
 * - built 里为 null / undefined / 非有限数的字段一律跳过（绝不把 existing 清空）。
 * - existing 里有、built 里没有的字段原样保留（浅拷贝，不写回 existing）。
 * - 返回新对象；同时把真正拷贝的字段路径记进 copiedFieldPaths。
 */
function mergeTab<T extends NutritionTab>(
  tabKey: NutritionFieldTab,
  existingTab: T,
  builtTab: T,
  copiedFieldPaths: string[],
  allowedFieldPaths: ReadonlySet<string> | null,
): T {
  const nextTab: T = { ...existingTab };
  for (const fieldKey of Object.keys(builtTab)) {
    const fieldPath = `${tabKey}.${fieldKey}`;
    if (allowedFieldPaths && !allowedFieldPaths.has(fieldPath)) {
      continue;
    }
    const value = builtTab[fieldKey];
    if (!isFiniteNumber(value)) {
      continue;
    }
    nextTab[fieldKey as keyof T] = value as T[keyof T];
    copiedFieldPaths.push(fieldPath);
  }
  return nextTab;
}

/**
 * 合并单个字段的来源元数据：built 覆盖，但“源库自己的描述”保留 existing。
 *
 * `buildCnfNutritionProfile` 是从 CNF 编码重建的，`CnfRawAmount` 只有
 * code + value，拿不到 CNF 原始单位与原始营养素名（`unitName` 传的是空串，
 * `sourceNutrientName` 用的是我们映射表里的 USDA 名）。如果直接“built 全胜”，
 * 会把 existing 里真实的 `originalUnit`（g/mg/µg…）和 CNF 原始名称抹掉 ——
 * 那是信息丢失，不是更新。
 *
 * 所以：数值与换算信息（originalValue、canonicalValue、canonicalUnit、
 * sourceNutrientId、basisType、sourceFormMetadata…）以 built 为准；
 * `sourceNutrientName` / `originalUnit` 这两个“源库描述”优先保留 existing
 * 的非空值，existing 没有（例如本次才补上来的字段）才用 built 的。
 */
function mergeSourceFormEntry(
  existingEntry: NutritionSourceForm | undefined,
  builtEntry: NutritionSourceForm,
): NutritionSourceForm {
  if (!existingEntry) {
    return builtEntry;
  }
  return {
    ...builtEntry,
    sourceNutrientName: isBlank(existingEntry.sourceNutrientName)
      ? (builtEntry.sourceNutrientName ?? null)
      : existingEntry.sourceNutrientName,
    originalUnit: isBlank(existingEntry.originalUnit)
      ? (builtEntry.originalUnit ?? null)
      : existingEntry.originalUnit,
  };
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * 把 CNF 重新归一化出来的 profile 合并进现有 profile。
 *
 * 与 `mergeCnfMinerals` 的区别：不再只合并 minerals，而是把
 * macros / minerals / vitamins / fattyAcids / aminoAcids 五个 tab 里
 * built 有的非空数值合并进去（碳水 205、纤维 291、维生素 C 401、
 * 叶酸 417、胆碱 421、饱和/单不饱和/多不饱和脂肪酸 606/645/646 就是靠这一步补上来的）。
 *
 * `onlyFieldPaths`（验收项 4 之后加的收紧开关）：给了字段白名单就只拷贝名单内的
 * 字段及其 `sourceForms` / `conversionNotes`，名单外的字段即使 built 里有值、
 * 且与 existing 不同，也原样保留 existing —— 用来避免顺手改掉维生素 D、DHA/EPA/DPA
 * 这类“已有非空值但重建值不同”的字段。不传则维持“built 有值就覆盖”的老行为。
 *
 * 约束：
 * - 绝不把 existing 的数值清空（built 为 null 时跳过）。
 * - `meta` 除 `sourceForms` / `conversionNotes` 外原样保留（sampleState、
 *   sourceTitle、externalId、confidenceLevel、rawBasisType、customItems…）。
 * - `sourceForms` / `conversionNotes` 只合并“本次真正拷贝的字段”，且这些键由
 *   built 覆盖；未拷贝字段的元数据保持 existing 原值。唯一例外：`sourceForms`
 *   里的 `sourceNutrientName` / `originalUnit` 优先保留 existing 的非空值
 *   （重建过程拿不到 CNF 原始名称与单位；详见 `mergeSourceFormEntry`）。
 *
 * 纯函数：不修改 existing / built。
 */
export function mergeCnfProfile(
  existing: NutritionProfileV2,
  built: NutritionProfileV2,
  onlyFieldPaths?: readonly string[],
): NutritionProfileV2 {
  const allowedFieldPaths = onlyFieldPaths ? new Set(onlyFieldPaths) : null;
  const copiedFieldPaths: string[] = [];

  const macros = mergeTab(
    'macros',
    existing.macros,
    built.macros,
    copiedFieldPaths,
    allowedFieldPaths,
  );
  const minerals = mergeTab(
    'minerals',
    existing.minerals,
    built.minerals,
    copiedFieldPaths,
    allowedFieldPaths,
  );
  const vitamins = mergeTab(
    'vitamins',
    existing.vitamins,
    built.vitamins,
    copiedFieldPaths,
    allowedFieldPaths,
  );
  const fattyAcids = mergeTab(
    'fattyAcids',
    existing.fattyAcids,
    built.fattyAcids,
    copiedFieldPaths,
    allowedFieldPaths,
  );
  const aminoAcids = mergeTab(
    'aminoAcids',
    existing.aminoAcids,
    built.aminoAcids,
    copiedFieldPaths,
    allowedFieldPaths,
  );

  const builtSourceForms = built.meta.sourceForms ?? {};
  const builtConversionNotes = built.meta.conversionNotes ?? {};
  const existingSourceForms = existing.meta.sourceForms ?? {};
  const copiedSourceForms: Record<string, NutritionSourceForm> = {};
  const copiedConversionNotes: Record<string, string> = {};
  for (const fieldPath of copiedFieldPaths) {
    const sourceForm = builtSourceForms[fieldPath];
    if (sourceForm !== undefined) {
      copiedSourceForms[fieldPath] = mergeSourceFormEntry(
        existingSourceForms[fieldPath],
        sourceForm,
      );
    }
    const conversionNote = builtConversionNotes[fieldPath];
    if (conversionNote !== undefined) {
      copiedConversionNotes[fieldPath] = conversionNote;
    }
  }

  // meta 先整体浅拷贝，只有本次真的有新条目时才动 sourceForms / conversionNotes，
  // 避免“什么都没拷贝”却给 meta 塞进空对象。
  const meta: NutritionMeta = { ...existing.meta };
  if (Object.keys(copiedSourceForms).length > 0) {
    meta.sourceForms = {
      ...(existing.meta.sourceForms ?? {}),
      ...copiedSourceForms,
    };
  }
  if (Object.keys(copiedConversionNotes).length > 0) {
    meta.conversionNotes = {
      ...(existing.meta.conversionNotes ?? {}),
      ...copiedConversionNotes,
    };
  }

  return {
    ...existing,
    macros,
    minerals,
    vitamins,
    fattyAcids,
    aminoAcids,
    meta,
  };
}

/**
 * 对比 merge 前后的 profile，按字段路径列出“变了哪些字段 / 哪些字段从空变有值”。
 *
 * 回填脚本用它统计 `perField`（每个字段变了多少条）和 `perFieldGained`
 * （验收项 4 要的“补上来的记录数”）；纯函数，不修改入参。
 */
export function diffCnfProfileFields(
  existing: NutritionProfileV2,
  merged: NutritionProfileV2,
): CnfProfileFieldDiff {
  const changed: string[] = [];
  const gained: string[] = [];

  for (const { tabKey, fieldKeys } of CNF_MERGE_TABS) {
    for (const fieldKey of fieldKeys) {
      const before = readTabValue(existing, tabKey, fieldKey);
      const after = readTabValue(merged, tabKey, fieldKey);
      if (before === after) {
        continue;
      }
      const fieldPath = `${tabKey}.${fieldKey}`;
      changed.push(fieldPath);
      if (before === null && after !== null) {
        gained.push(fieldPath);
      }
    }
  }

  return { changed, gained };
}

/**
 * ③ 档案成型的数据搬运：缝合方案 → 证据账本 → 档案 → 编辑器 → 人改 → 写回账本。
 *
 * 三条硬规则都在这里落地：
 * 1. 缺失是 `null`，绝不补 0；
 * 2. 人工改过的字段状态记 `MANUAL`，并保留原始来源 / 原始值 / 换算公式；
 * 3. 重建档案时，自动行按最新缝合方案刷新，人工行原样保留。
 */
import {
  INGREDIENT_NUTRITION_TAB_DEFINITIONS,
  type IngredientNutritionTabKey
} from '@/constants/ingredientNutrition'
import type {
  CandidateRow,
  CoverageCategory,
  IntakeCard,
  MergePlan,
  MergeRow,
  NutritionEvidenceEntry,
  PreparationState,
  ProfileDraft
} from '@/types/ingredientCreation'
import type {
  NutritionProfile,
  NutritionProfileSourceType
} from '@/types/ingredient'
import {
  buildIngredientNutritionPayload,
  createEmptyIngredientNutritionFormValue,
  normalizeIngredientNutritionProfileToForm
} from '@/utils/ingredientNutrition'
import { resolveDefaultPrimaryState } from './stateCoverage'
import { sortProfilesByState } from './stepProfileHelpers'

/** 营养字段目录（与后端 `nutrition-field-catalog.ts` 同序、同单位）。 */
export interface ProfileFieldDefinition {
  fieldPath: string
  tabKey: IngredientNutritionTabKey
  fieldKey: string
  label: string
  unit: string
}

export const PROFILE_FIELD_DEFINITIONS: readonly ProfileFieldDefinition[] =
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) =>
    tab.fields.map((field) => ({
      fieldPath: `${tab.key}.${field.key}`,
      tabKey: tab.key,
      fieldKey: field.key,
      label: field.label,
      unit: field.unit
    }))
  )

export const PROFILE_FIELD_BY_PATH: ReadonlyMap<string, ProfileFieldDefinition> =
  new Map(PROFILE_FIELD_DEFINITIONS.map((field) => [field.fieldPath, field]))

const PROFILE_FIELD_INDEX: ReadonlyMap<string, number> = new Map(
  PROFILE_FIELD_DEFINITIONS.map((field, index) => [field.fieldPath, index])
)

const PREPARATION_STATES: readonly PreparationState[] = ['RAW', 'COOKED']

/** 与后端相同的浮点口径：相对误差 1e-6 以内不算改值。 */
const VALUE_RELATIVE_TOLERANCE = 1e-6

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function valuesEqual(left: number | null, right: number | null): boolean {
  if (left === right) {
    return true
  }
  if (left === null || right === null) {
    return false
  }
  const scale = Math.max(Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= VALUE_RELATIVE_TOLERANCE * scale
}

/** 数字展示：去掉浮点尾巴，别把 550.0000000000001 写进证据。 */
export function formatFieldNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  if (Number.isInteger(value)) {
    return String(value)
  }
  return String(Number(value.toPrecision(12)))
}

export function formatFieldValue(
  value: number | null | undefined,
  unit: string | null | undefined
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  return unit ? `${formatFieldNumber(value)} ${unit}` : formatFieldNumber(value)
}

/** `μg` / `µg` 这类写法差异不算单位不同，避免造出假换算公式。 */
function normalizeUnitText(unit: string | null | undefined): string {
  return (unit ?? '').trim().replace(/μ/g, 'µ').toLowerCase()
}

/**
 * 只有「原文单位 ≠ 目录单位」或「原文值 ≠ 目录值」时才写换算公式。
 * 没有原文时返回 null，不假装知道换算过程。
 */
export function buildConversionFormula(
  sourceValue: number | null,
  sourceUnit: string | null,
  finalValue: number,
  finalUnit: string
): string | null {
  if (sourceValue === null || !sourceUnit) {
    return null
  }

  const sameUnit = normalizeUnitText(sourceUnit) === normalizeUnitText(finalUnit)
  if (sameUnit && valuesEqual(sourceValue, finalValue)) {
    return null
  }

  return `${formatFieldNumber(sourceValue)} ${sourceUnit} → ${formatFieldNumber(finalValue)} ${finalUnit}`
}

function mergeRowStatus(
  row: MergeRow,
  formula: string | null
): NutritionEvidenceEntry['status'] {
  if (row.status === 'MANUAL') {
    return 'MANUAL'
  }
  if (formula) {
    return 'CONVERTED'
  }
  if (row.status === 'FILLED') {
    return 'FILLED'
  }
  return 'DIRECT'
}

/**
 * 把缝合方案里已确定的行转成证据账本。
 *
 * 冲突行（`value = null`）与缺失字段不产出证据行；有值但拿不到来源原文的
 * 字段仍然产出，只是 `sourceValue` / `sourceUnit` 保持 null，页面标「暂无溯源」。
 */
export function buildEvidenceEntriesFromPlan(
  plan: MergePlan | null | undefined
): NutritionEvidenceEntry[] {
  if (!plan || !Array.isArray(plan.rows)) {
    return []
  }

  const entries: NutritionEvidenceEntry[] = []
  for (const row of plan.rows) {
    if (!row || row.status === 'CONFLICT') {
      continue
    }

    const finalValue = toFiniteNumber(row.value)
    if (finalValue === null) {
      continue
    }

    const sourceValue = toFiniteNumber(row.sourceValue)
    const sourceUnit =
      typeof row.sourceUnit === 'string' && row.sourceUnit.trim()
        ? row.sourceUnit.trim()
        : null
    const unit =
      typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : ''
    const formula = buildConversionFormula(
      sourceValue,
      sourceUnit,
      finalValue,
      unit
    )

    entries.push({
      fieldPath: row.fieldPath,
      finalValue,
      unit,
      status: mergeRowStatus(row, formula),
      sourceRecordId: row.sourceRecordId,
      sourceValue,
      sourceUnit,
      formula,
      confirmedBy: null,
      confirmedAt: null
    })
  }

  return entries
}

function sortEntriesByCatalog(
  entries: readonly NutritionEvidenceEntry[]
): NutritionEvidenceEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftIndex =
        PROFILE_FIELD_INDEX.get(left.entry.fieldPath) ?? Number.MAX_SAFE_INTEGER
      const rightIndex =
        PROFILE_FIELD_INDEX.get(right.entry.fieldPath) ?? Number.MAX_SAFE_INTEGER

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }
      return left.index - right.index
    })
    .map(({ entry }) => entry)
}

function isEvidenceEntry(value: unknown): value is NutritionEvidenceEntry {
  return (
    isRecord(value) &&
    typeof value.fieldPath === 'string' &&
    value.fieldPath.trim().length > 0
  )
}

function cloneEvidenceEntry(entry: NutritionEvidenceEntry): NutritionEvidenceEntry {
  return { ...entry }
}

/** 草稿里存的档案可能是旧版本 / 脏数据：只收合法的生熟状态，同状态只留第一份。 */
export function normalizeStoredProfiles(
  profiles: readonly ProfileDraft[] | null | undefined
): ProfileDraft[] {
  if (!Array.isArray(profiles)) {
    return []
  }

  const seen = new Set<PreparationState>()
  const result: ProfileDraft[] = []

  for (const raw of profiles) {
    if (!raw || !PREPARATION_STATES.includes(raw.preparationState)) {
      continue
    }
    if (seen.has(raw.preparationState)) {
      continue
    }
    seen.add(raw.preparationState)

    result.push({
      preparationState: raw.preparationState,
      sourceRecordId:
        typeof raw.sourceRecordId === 'string' ? raw.sourceRecordId : '',
      entries: Array.isArray(raw.entries)
        ? raw.entries.filter(isEvidenceEntry).map(cloneEvidenceEntry)
        : [],
      notes: typeof raw.notes === 'string' ? raw.notes : null
    })
  }

  return result
}

export interface BuildProfileFromPlanInput {
  plan: MergePlan
  preparationState: PreparationState
  /**
   * 同一来源上一次保存的账本：只保留状态为 `MANUAL` 的行，
   * 自动行一律按当前方案刷新，避免旧方案的数值阴魂不散。
   */
  existingEntries?: readonly NutritionEvidenceEntry[]
  notes?: string | null
}

/**
 * 按缝合方案生成一份档案（可带人工修改的旧账本）。
 *
 * 缺失字段不写行；人工清空的行保留 `finalValue = null`，
 * 这样「人明确清空」与「来源本来就没给」在账本里仍然分得开。
 */
export function buildProfileFromPlan(
  input: BuildProfileFromPlanInput
): ProfileDraft {
  const byPath = new Map<string, NutritionEvidenceEntry>()

  for (const entry of buildEvidenceEntriesFromPlan(input.plan)) {
    byPath.set(entry.fieldPath, entry)
  }

  for (const entry of input.existingEntries ?? []) {
    if (entry?.status === 'MANUAL') {
      byPath.set(entry.fieldPath, cloneEvidenceEntry(entry))
    }
  }

  return {
    preparationState: input.preparationState,
    sourceRecordId: input.plan.primarySourceRecordId,
    entries: sortEntriesByCatalog([...byPath.values()]),
    notes: input.notes ?? null
  }
}

export interface MergeProfilesWithPlanInput {
  storedProfiles: readonly ProfileDraft[]
  plan: MergePlan
  /** 本次缝合方案对应哪一份生熟档案 */
  planState: PreparationState
}

export interface MergeProfilesWithPlanResult {
  profiles: ProfileDraft[]
  /** 同状态的老档案来源变了、被新方案整份替换时，返回被替换的状态 */
  replacedState: PreparationState | null
}

/**
 * 把本次缝合方案合进草稿里已有的档案：
 *
 * - 同一状态、同一来源：保留人工行，自动行按新方案刷新；
 * - 同一状态、来源变了：整份按新方案重建（旧来源的数值不能混进新档案）；
 * - 没有该状态：新增一份；
 * - 其它状态原样保留（生、熟各一份），最后按生熟排序。
 */
export function mergeProfilesWithPlan(
  input: MergeProfilesWithPlanInput
): MergeProfilesWithPlanResult {
  const profiles = normalizeStoredProfiles(input.storedProfiles)
  const index = profiles.findIndex(
    (profile) => profile.preparationState === input.planState
  )
  let replacedState: PreparationState | null = null

  if (index < 0) {
    profiles.push(
      buildProfileFromPlan({
        plan: input.plan,
        preparationState: input.planState
      })
    )
  } else {
    const existing = profiles[index]!
    if (existing.sourceRecordId === input.plan.primarySourceRecordId) {
      profiles[index] = buildProfileFromPlan({
        plan: input.plan,
        preparationState: input.planState,
        existingEntries: existing.entries,
        notes: existing.notes
      })
    } else {
      profiles[index] = buildProfileFromPlan({
        plan: input.plan,
        preparationState: input.planState
      })
      replacedState = input.planState
    }
  }

  return { profiles: sortProfilesByState(profiles), replacedState }
}

export interface ResolvePlanPreparationStateInput {
  plan: MergePlan | null | undefined
  candidates?: readonly CandidateRow[] | null
  intake?: IntakeCard | null
}

/**
 * 本次缝合方案该建「生」还是「熟」档案。
 *
 * 优先取主来源候选上的状态；来源没写状态时退回 ① 站清单，最后按类别默认值。
 * 绝不从值反推状态 —— 生熟是来源的属性，不是数字的属性。
 */
export function resolvePlanPreparationState(
  input: ResolvePlanPreparationStateInput
): PreparationState {
  const plan = input.plan
  if (plan) {
    const candidate = input.candidates?.find(
      (row) => row.sourceRecordId === plan.primarySourceRecordId
    )
    if (candidate?.preparationState === 'RAW') {
      return 'RAW'
    }
    if (candidate?.preparationState === 'COOKED') {
      return 'COOKED'
    }
  }

  const intake = input.intake
  for (const state of intake?.requiredStates ?? []) {
    if (state === 'RAW' || state === 'COOKED') {
      return state
    }
  }
  for (const state of intake?.suggestedStates ?? []) {
    if (state === 'RAW' || state === 'COOKED') {
      return state
    }
  }

  const category: CoverageCategory =
    intake?.category === 'MEAT_ORGAN' ||
    intake?.category === 'STARCHY_VEGETABLE' ||
    intake?.category === 'OTHER'
      ? intake.category
      : 'OTHER'

  return resolveDefaultPrimaryState(category)
}

const ALLOWED_NUTRITION_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'LAB_REPORT',
  'LABEL',
  'CFCT',
  'USDA',
  'NZFCD',
  'MEXT',
  'LITERATURE',
  'SUPPLIER',
  'SUPPLEMENT_LABEL',
  'MANUAL',
  'MANUAL_ESTIMATE'
])

function normalizeNutritionSourceType(
  raw: string | null | undefined
): NutritionProfileSourceType | null {
  if (typeof raw !== 'string') {
    return null
  }
  const value = raw.trim().toUpperCase()
  return ALLOWED_NUTRITION_SOURCE_TYPES.has(value)
    ? (value as NutritionProfileSourceType)
    : null
}

export interface ProfileSourceInfo {
  sourceLabel?: string | null
  sourceType?: string | null
}

/**
 * 档案账本 → 营养编辑器认识的 `NutritionProfile`。
 *
 * 目录字段进对应 tab，目录之外的（人工自定义项）进 `customItems`；
 * `finalValue = null` 的行不写入表单（表单里空着就是空着，不补 0）。
 */
export function profileDraftToNutritionProfile(
  draft: ProfileDraft,
  source: ProfileSourceInfo = {}
): NutritionProfile {
  const form = createEmptyIngredientNutritionFormValue()
  form.meta.rawBasisType = 'PER_100_G'
  form.meta.sampleState = draft.preparationState
  form.meta.sourceRecordId = draft.sourceRecordId || null
  form.meta.sourceTitle = source.sourceLabel ?? null
  form.meta.sourceType = normalizeNutritionSourceType(source.sourceType)
  form.meta.versionNote = draft.notes ?? null

  for (const entry of draft.entries) {
    const value = toFiniteNumber(entry.finalValue)
    if (value === null) {
      continue
    }

    const field = PROFILE_FIELD_BY_PATH.get(entry.fieldPath)
    if (field) {
      const tab = form[field.tabKey] as Record<string, number | null>
      tab[field.fieldKey] = value
      continue
    }

    form.customItems.push({
      name: entry.fieldPath,
      value,
      unit: entry.unit,
      rawBasisType: 'PER_100_G',
      note: entry.formula ?? null
    })
  }

  return buildIngredientNutritionPayload(form) ?? form
}

/**
 * 人改过的编辑器值写回证据账本。
 *
 * 只把「编辑器里的值 ≠ 账本里的最终值」的字段记成 `MANUAL`：
 * 没动过的字段保持原状态，不会因为编辑器整体 emit 一次就全部变成人工。
 * 人清空字段时保留一条 `finalValue = null` 的 MANUAL 行，留痕。
 */
export function applyEditorProfileToDraft(
  draft: ProfileDraft,
  editorProfile: NutritionProfile | null | undefined,
  operator: string,
  confirmedAt: string = new Date().toISOString()
): ProfileDraft {
  const normalized = normalizeIngredientNutritionProfileToForm(editorProfile)
  const entriesByPath = new Map<string, NutritionEvidenceEntry>()
  for (const entry of draft.entries) {
    if (isEvidenceEntry(entry)) {
      entriesByPath.set(entry.fieldPath, cloneEvidenceEntry(entry))
    }
  }

  const confirmedBy = operator.trim() || null

  function touchEntry(
    fieldPath: string,
    unit: string,
    nextValue: number | null
  ): void {
    const existing = entriesByPath.get(fieldPath)
    if (valuesEqual(existing?.finalValue ?? null, nextValue)) {
      return
    }

    if (!existing && nextValue === null) {
      return
    }

    entriesByPath.set(fieldPath, {
      fieldPath,
      finalValue: nextValue,
      unit,
      status: 'MANUAL',
      sourceRecordId: existing?.sourceRecordId ?? null,
      sourceValue: existing?.sourceValue ?? null,
      sourceUnit: existing?.sourceUnit ?? null,
      formula: existing?.formula ?? null,
      confirmedBy,
      confirmedAt
    })
  }

  for (const field of PROFILE_FIELD_DEFINITIONS) {
    const tab = normalized[field.tabKey] as Record<string, number | null>
    touchEntry(field.fieldPath, field.unit, toFiniteNumber(tab[field.fieldKey]))
  }

  const customNames = new Set<string>()
  for (const item of normalized.customItems) {
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name || PROFILE_FIELD_BY_PATH.has(name)) {
      continue
    }
    const value = toFiniteNumber(item.value)
    if (value === null) {
      continue
    }
    customNames.add(name)
    touchEntry(name, item.unit, value)
  }

  // 人删掉的自定义营养项：对应的账本行也一起删掉，避免提交时冒出来。
  for (const entry of [...entriesByPath.values()]) {
    if (
      !PROFILE_FIELD_BY_PATH.has(entry.fieldPath) &&
      !customNames.has(entry.fieldPath)
    ) {
      entriesByPath.delete(entry.fieldPath)
    }
  }

  return {
    ...draft,
    entries: sortEntriesByCatalog([...entriesByPath.values()]),
    notes: normalized.meta.versionNote?.trim() || null
  }
}

/** 一份档案里真正有值的字段数（0 是值，null 不是）。 */
export function countProfileValues(profile: ProfileDraft): number {
  return profile.entries.filter(
    (entry) => toFiniteNumber(entry.finalValue) !== null
  ).length
}

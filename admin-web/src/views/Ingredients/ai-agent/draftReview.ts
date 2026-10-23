/**
 * 审核页的纯映射：草稿 payload → 原料卡表单 / 营养档案分组 / 检查摘要 / 提交入参。
 *
 * 这里不请求接口、不依赖 DOM：页面只负责把结果画出来，改值后的 PATCH 也由
 * 页面拿着这些纯函数算出的新 payload 去做。这样分组、状态映射、待补计数
 * 都能直接单测，不靠组件挂载。
 */
import { INGREDIENT_NUTRITION_TAB_LABELS } from '@/constants/ingredientNutrition'
import type {
  CheckItem,
  CommitIngredientCreationInput,
  CoverageCategory,
  FinalCheckResult,
  IngredientCreationDraftPayload,
  IngredientDraft,
  PreparationState,
  ProfileDraft
} from '@/types/ingredientCreation'
import {
  PROFILE_FIELD_DEFINITIONS,
  resolvePrimaryProfileIndex,
  sortProfilesByState
} from './ingredientProfileRules'

/** 原料卡上人工可编辑、AI 也能写的字段（公共字段名）。 */
export type IngredientEditableField =
  | 'name'
  | 'nameEn'
  | 'category'
  | 'baseUnit'
  | 'unitDisplayLabel'
  | 'cfctClass'
  | 'edibleYieldPercent'

export const INGREDIENT_EDITABLE_FIELDS: readonly IngredientEditableField[] = [
  'name',
  'nameEn',
  'category',
  'baseUnit',
  'unitDisplayLabel',
  'cfctClass',
  'edibleYieldPercent'
]

export const DEFAULT_UNIT_DISPLAY_LABELS: Readonly<
  Record<IngredientDraft['baseUnit'], string>
> = {
  G: '克',
  ML: '毫升',
  PCS: '个'
}

/** 原料卡表单值：可食部用 0–100 的百分数，空值统一为 null。 */
export interface IngredientCardForm {
  name: string
  nameEn: string
  category: CoverageCategory | ''
  baseUnit: IngredientDraft['baseUnit']
  unitDisplayLabel: string
  cfctClass: string
  edibleYieldPercent: number | null
  manualFields: IngredientEditableField[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 类别是受控词表；脏值当作没填。 */
function toCategory(value: unknown): CoverageCategory | '' {
  return value === 'MEAT_ORGAN' ||
    value === 'STARCHY_VEGETABLE' ||
    value === 'OTHER'
    ? value
    : ''
}

function toBaseUnit(value: unknown): IngredientDraft['baseUnit'] {
  return value === 'ML' || value === 'PCS' ? value : 'G'
}

function toManualFields(value: unknown): IngredientEditableField[] {
  if (!Array.isArray(value)) {
    return []
  }

  const fields = value.filter(
    (field): field is IngredientEditableField =>
      typeof field === 'string' &&
      (INGREDIENT_EDITABLE_FIELDS as readonly string[]).includes(field)
  )
  return [...new Set(fields)]
}

/**
 * 读原料卡。优先用草稿里的 `payload.ingredient`，没有时按起手卡 / 草稿名兜底，
 * 页面永远能拿到一张可编辑的卡（只是值可能为空）。
 */
export function toIngredientCard(
  payload: IngredientCreationDraftPayload | null | undefined,
  fallbackName = ''
): IngredientCardForm {
  const source = isRecord(payload?.ingredient) ? payload.ingredient : null
  const intake = isRecord(payload?.intake) ? payload.intake : null

  const baseUnit = toBaseUnit(source?.baseUnit)
  const rate = toFiniteNumber(source?.edibleYieldRate)

  return {
    name: toText(source?.name) || toText(intake?.name) || fallbackName.trim(),
    nameEn: toText(source?.nameEn) || toText(intake?.nameEn),
    category: toCategory(source?.category) || toCategory(intake?.category),
    baseUnit,
    unitDisplayLabel:
      toText(source?.unitDisplayLabel) || DEFAULT_UNIT_DISPLAY_LABELS[baseUnit],
    cfctClass: toText(source?.cfctClass),
    edibleYieldPercent:
      rate !== null && rate > 0 && rate <= 1
        ? Math.round(rate * 10000) / 100
        : null,
    manualFields: toManualFields(source?.manualFields)
  }
}

/** 表单值写回草稿：百分数换比例，空串落成 null，人工标记原样带上。 */
export function toIngredientDraft(card: IngredientCardForm): IngredientDraft {
  return {
    name: card.name.trim(),
    nameEn: card.nameEn.trim() || null,
    type: 'FOOD',
    category: card.category || null,
    baseUnit: card.baseUnit,
    unitDisplayLabel:
      card.unitDisplayLabel.trim() ||
      DEFAULT_UNIT_DISPLAY_LABELS[card.baseUnit],
    cfctClass: card.cfctClass.trim() || null,
    edibleYieldRate:
      card.edibleYieldPercent === null
        ? null
        : Math.round(card.edibleYieldPercent * 100) / 10000,
    manualFields: [...card.manualFields]
  }
}

/** 人改了一个字段：把字段名并入人工改动清单（去重、不改原对象）。 */
export function markIngredientFieldManual(
  card: IngredientCardForm,
  field: IngredientEditableField
): IngredientCardForm {
  if (card.manualFields.includes(field)) {
    return card
  }

  return { ...card, manualFields: [...card.manualFields, field] }
}

export type ProfileRowStatus = 'DIRECT' | 'FILLED' | 'MANUAL' | 'PENDING'

/** 行状态文案：需求里的四档，换算仍归「直接」（公式单独展示）。 */
export const PROFILE_STATUS_META: Readonly<
  Record<
    ProfileRowStatus,
    { label: string; type: 'success' | 'primary' | 'warning' | 'info' }
  >
> = {
  DIRECT: { label: '直接', type: 'success' },
  FILLED: { label: '补位', type: 'primary' },
  MANUAL: { label: '人工', type: 'warning' },
  PENDING: { label: '待补', type: 'info' }
}

/** 营养档案的一格。 */
export interface ProfileFieldRow {
  fieldPath: string
  tabKey: string
  tabLabel: string
  label: string
  unit: string
  value: number | null
  status: ProfileRowStatus
  statusLabel: string
  statusType: 'success' | 'primary' | 'warning' | 'info'
  sourceRecordId: string | null
  sourceLabel: string
  formula: string | null
}

/** 一份营养档案（生或熟）在页面上的分组。 */
export interface ProfileGroup {
  /** 在草稿 `payload.profiles` 里的真实下标；PATCH 时按它定位 */
  profileIndex: number
  preparationState: PreparationState
  stateLabel: string
  sourceRecordId: string
  sourceLabel: string
  rows: ProfileFieldRow[]
  pendingCount: number
}

const PREPARATION_STATE_LABELS: Readonly<Record<PreparationState, string>> = {
  RAW: '生',
  COOKED: '熟'
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function formatSourceLabel(
  sourceRecordId: string | null,
  sourceNames?: ReadonlyMap<string, string>
): string {
  if (!sourceRecordId) {
    return '—'
  }

  return sourceNames?.get(sourceRecordId) ?? shortId(sourceRecordId)
}

function toProfileStatus(
  value: number | null,
  status: unknown
): ProfileRowStatus {
  if (value === null) {
    return 'PENDING'
  }
  if (status === 'MANUAL') {
    return 'MANUAL'
  }
  if (status === 'FILLED') {
    return 'FILLED'
  }
  return 'DIRECT'
}

/**
 * 把草稿里的 profiles 铺成审核表：先生后熟、每份都铺满字段目录。
 *
 * `sourceNames` 用候选列表把来源 id 翻成人能读的名字；没有就显示短 id。
 */
export function toProfileRows(
  payload: IngredientCreationDraftPayload | null | undefined,
  sourceNames?: ReadonlyMap<string, string>
): ProfileGroup[] {
  const stored = Array.isArray(payload?.profiles) ? payload.profiles : []

  const usable = stored
    .map((profile, index) => ({ profile, index }))
    .filter(
      (item): item is { profile: ProfileDraft; index: number } =>
        Boolean(item.profile) &&
        (item.profile.preparationState === 'RAW' ||
          item.profile.preparationState === 'COOKED') &&
        typeof item.profile.sourceRecordId === 'string' &&
        item.profile.sourceRecordId.length > 0
    )

  const indexByProfile = new Map(
    usable.map((item) => [item.profile, item.index] as const)
  )

  return sortProfilesByState(usable.map((item) => item.profile))
    .map((profile) => {
      const entryByPath = new Map(
        (Array.isArray(profile.entries) ? profile.entries : [])
          .filter(
            (entry) =>
              entry && typeof entry.fieldPath === 'string' && entry.fieldPath
          )
          .map((entry) => [entry.fieldPath, entry] as const)
      )

      const rows = PROFILE_FIELD_DEFINITIONS.map((field) => {
        const entry = entryByPath.get(field.fieldPath)
        const value = entry ? toFiniteNumber(entry.finalValue) : null
        const status = toProfileStatus(value, entry?.status)

        return {
          fieldPath: field.fieldPath,
          tabKey: field.tabKey,
          tabLabel:
            INGREDIENT_NUTRITION_TAB_LABELS[
              field.tabKey as keyof typeof INGREDIENT_NUTRITION_TAB_LABELS
            ] ?? field.tabKey,
          label: field.label,
          unit: field.unit,
          value,
          status,
          statusLabel: PROFILE_STATUS_META[status].label,
          statusType: PROFILE_STATUS_META[status].type,
          sourceRecordId: entry?.sourceRecordId ?? null,
          sourceLabel: formatSourceLabel(
            entry?.sourceRecordId ?? null,
            sourceNames
          ),
          formula: entry?.formula ?? null
        }
      })

      const preparationState = profile.preparationState

      return {
        profileIndex: indexByProfile.get(profile) ?? 0,
        preparationState,
        stateLabel: PREPARATION_STATE_LABELS[preparationState],
        sourceRecordId: profile.sourceRecordId,
        sourceLabel: formatSourceLabel(profile.sourceRecordId, sourceNames),
        rows,
        pendingCount: rows.filter((row) => row.status === 'PENDING').length
      }
    })
}

/** 顶部「待补 N 项」：所有档案里还没有值的格子数。 */
export function countPendingRows(groups: readonly ProfileGroup[]): number {
  return groups.reduce((total, group) => total + group.pendingCount, 0)
}

/**
 * 顶部「冲突 N 项」：缝合方案里还没裁决、且营养档案里也确实没有值的冲突。
 *
 * 审核页直接改营养格，不走「裁决冲突」接口，`mergePlan.conflicts` 不会自动清空；
 * 只按它计数会把已经手工填好的字段一直算成冲突，所以要以当前档案为准过滤。
 */
export function countPlanConflicts(
  payload: IngredientCreationDraftPayload | null | undefined
): number {
  const conflicts = payload?.mergePlan?.conflicts
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return 0
  }

  const filledFieldPaths = new Set<string>()
  for (const profile of payload?.profiles ?? []) {
    for (const entry of profile?.entries ?? []) {
      if (
        entry &&
        typeof entry.fieldPath === 'string' &&
        toFiniteNumber(entry.finalValue) !== null
      ) {
        filledFieldPaths.add(entry.fieldPath)
      }
    }
  }

  return conflicts.filter(
    (conflict) =>
      Boolean(conflict) &&
      typeof conflict.fieldPath === 'string' &&
      !filledFieldPaths.has(conflict.fieldPath)
  ).length
}

export type CheckState = 'PASS' | 'BLOCK' | 'UNKNOWN'

export interface CheckSummary {
  state: CheckState
  label: '通过' | '阻断' | '未检查'
  blocking: CheckItem[]
  exceptionable: number
  warnings: number
}

/** 终检摘要：只有 blocking 决定「通过 / 阻断」，提醒与可例外不拦。 */
export function toCheckSummary(
  result: FinalCheckResult | null | undefined
): CheckSummary {
  if (!result) {
    return {
      state: 'UNKNOWN',
      label: '未检查',
      blocking: [],
      exceptionable: 0,
      warnings: 0
    }
  }

  const blocking = Array.isArray(result.blocking) ? result.blocking : []
  const state: CheckState = blocking.length > 0 ? 'BLOCK' : 'PASS'

  return {
    state,
    label: state === 'BLOCK' ? '阻断' : '通过',
    blocking,
    exceptionable: Array.isArray(result.exceptionable)
      ? result.exceptionable.length
      : 0,
    warnings: Array.isArray(result.warnings) ? result.warnings.length : 0
  }
}

const MANUAL_CONFIRM_MARK = 'HUMAN_REVIEW'

/**
 * 人改营养格：返回新的 profiles（不改原数组）。
 *
 * - 有值 → `MANUAL`，保留原来源与原文单位，只换最终值与目录单位；
 * - 清空 → 保留证据行、`finalValue = null`、`MANUAL`（页面显示「待补」，
 *   提交审计里是「已被移除」）；本来就没有值的格子不新建空行。
 */
export function applyProfileCellEdit(
  profiles: readonly ProfileDraft[],
  profileIndex: number,
  fieldPath: string,
  value: number | null
): ProfileDraft[] {
  const profile = profiles[profileIndex]
  const field = PROFILE_FIELD_DEFINITIONS.find(
    (item) => item.fieldPath === fieldPath
  )
  if (!profile || !field) {
    return [...profiles]
  }

  const entries = Array.isArray(profile.entries) ? [...profile.entries] : []
  const index = entries.findIndex((entry) => entry.fieldPath === fieldPath)
  const confirmedAt = new Date().toISOString()

  if (value === null) {
    if (index < 0) {
      return [...profiles]
    }
    entries[index] = {
      ...entries[index]!,
      finalValue: null,
      status: 'MANUAL',
      // 人改过之后旧换算公式不再解释这个值，清掉避免误导。
      formula: null,
      confirmedBy: MANUAL_CONFIRM_MARK,
      confirmedAt
    }
  } else {
    if (!Number.isFinite(value) || value < 0) {
      return [...profiles]
    }

    if (index >= 0) {
      entries[index] = {
        ...entries[index]!,
        finalValue: value,
        unit: field.unit,
        status: 'MANUAL',
        formula: null,
        confirmedBy: MANUAL_CONFIRM_MARK,
        confirmedAt
      }
    } else {
      entries.push({
        fieldPath,
        finalValue: value,
        unit: field.unit,
        status: 'MANUAL',
        sourceRecordId: null,
        sourceValue: null,
        sourceUnit: null,
        formula: null,
        confirmedBy: MANUAL_CONFIRM_MARK,
        confirmedAt
      })
    }
  }

  return profiles.map((item, currentIndex) =>
    currentIndex === profileIndex ? { ...item, entries } : item
  )
}

/** 可提交的档案：状态合法、带来源记录 id；脏行不混进提交。 */
function usableCommitProfiles(
  payload: IngredientCreationDraftPayload | null | undefined
): ProfileDraft[] {
  const stored = Array.isArray(payload?.profiles) ? payload.profiles : []
  return stored.filter(
    (profile): profile is ProfileDraft =>
      Boolean(profile) &&
      (profile.preparationState === 'RAW' ||
        profile.preparationState === 'COOKED') &&
      typeof profile.sourceRecordId === 'string' &&
      profile.sourceRecordId.length > 0
  )
}

/**
 * 提交入参：原料卡 + 原始顺序的档案 + 主档案下标。
 *
 * `ingredientOverride` 给页面用：表单里刚改、可能还没 PATCH 完的原料卡以表单为准；
 * 不传时从 payload 读。没有任何档案 / 没有原料名时返回 null，页面据此禁用提交。
 */
export function toCommitInput(
  payload: IngredientCreationDraftPayload | null | undefined,
  ingredientOverride?: IngredientDraft
): CommitIngredientCreationInput | null {
  const profiles = usableCommitProfiles(payload)
  if (profiles.length === 0) {
    return null
  }

  const card = toIngredientCard(payload, '')
  const ingredient = ingredientOverride ?? toIngredientDraft(card)
  if (!ingredient.name) {
    return null
  }

  const primaryProfileIndex = resolvePrimaryProfileIndex(profiles, {
    primarySourceRecordId: payload?.mergePlan?.primarySourceRecordId ?? null,
    category: ingredient.category || card.category || null
  })
  if (primaryProfileIndex < 0) {
    return null
  }

  return { ingredient, profiles, primaryProfileIndex }
}

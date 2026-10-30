/**
 * 审核页的纯映射：草稿 payload → 原料卡表单 / 营养档案分组 / 检查摘要 / 提交入参。
 *
 * 这里不请求接口、不依赖 DOM：页面只负责把结果画出来，改值后的 PATCH 也由
 * 页面拿着这些纯函数算出的新 payload 去做。这样分组、状态映射、待补计数
 * 都能直接单测，不靠组件挂载。
 */
import {
  INGREDIENT_CARD_FIELDS,
  isIngredientCardField,
  type IngredientCardFieldKey
} from '@/constants/ingredientCardFields'
import { INGREDIENT_NUTRITION_TAB_LABELS } from '@/constants/ingredientNutrition'
import type {
  CheckItem,
  CommitIngredientCreationInput,
  CoverageCategory,
  FinalCheckResult,
  IngredientCardField,
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

export const DEFAULT_UNIT_DISPLAY_LABELS: Readonly<
  Record<IngredientDraft['baseUnit'], string>
> = {
  G: '克',
  ML: '毫升',
  PCS: '个'
}

/**
 * 原料卡表单的一格值，统一用**展示口径**：
 * - 可食部 `edibleYieldPercent` 是 0–100 的百分数（草稿里存比例 `edibleYieldRate`）；
 * - 生产损耗 `productionLossRate` 是倍数（1.05 = 5% 损耗）。
 */
export type IngredientCardFormValue =
  | string
  | number
  | boolean
  | string[]
  | null

/**
 * 原料卡表单：30 个格子 + 人工标记，键名与字段目录一一对应。
 *
 * 用映射类型而不是手写 30 个属性：目录里加一项，表单类型自动跟着长；
 * `toIngredientCard` 少读一项会直接报类型错，写回由单测逐项钉住。
 */
export type IngredientCardForm = {
  [K in IngredientCardFieldKey]: IngredientCardFormValue
} & {
  manualFields: IngredientCardField[]
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

function toNullableText(value: unknown): string | null {
  return toText(value) || null
}

function toBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function toTagList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function toBaseUnit(value: unknown): IngredientDraft['baseUnit'] {
  return value === 'ML' || value === 'PCS' ? value : 'G'
}

/**
 * 受控词表收敛：目录外的值不写回草稿。
 *
 * 后端 DTO 对枚举用 `@IsIn`，把未知值发回去会 400；页面仍然原样展示它
 * （并提示「目录外取值，保存时按空处理」），不会在加载时就悄悄清掉。
 */
function toKnownSelectValue(
  key: IngredientCardFieldKey,
  value: unknown
): string | null {
  const text = toText(value)
  if (!text) {
    return null
  }
  const field = INGREDIENT_CARD_FIELDS.find((item) => item.key === key)
  if (!field?.options) {
    return text
  }
  return field.options.some((option) => option.value === text) ? text : null
}

/** 类别是受控词表里唯一带 TS 字面量类型的字段，主档案判定要再收窄一层。 */
function toKnownCoverageCategory(value: unknown): CoverageCategory | null {
  const known = toKnownSelectValue('category', value)
  return known === null ? null : (known as CoverageCategory)
}

/**
 * 人工标记只收目录内的 30 个公共键；旧草稿 / 脏数据里的其它字符串丢掉。
 * 可食部的标记用公共名 `edibleYieldPercent`，不用存储名。
 */
function toManualFields(value: unknown): IngredientCardField[] {
  if (!Array.isArray(value)) {
    return []
  }

  const fields = value.filter(
    (field): field is IngredientCardField =>
      typeof field === 'string' && isIngredientCardField(field)
  )
  return [...new Set(fields)]
}

/**
 * 读原料卡。优先用草稿里的 `payload.ingredient`，没有时按起手卡 / 草稿名兜底，
 * 页面永远能拿到一张可编辑的卡（只是值可能为空）。
 *
 * 30 项全部读出：少读一项，页面上就是「看不见」，下一次整卡保存还会把它抹掉。
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
    // BASIC
    name: toText(source?.name) || toText(intake?.name) || fallbackName.trim(),
    nameEn: toText(source?.nameEn) || toText(intake?.nameEn),
    type: toText(source?.type) || 'FOOD',
    // 未知枚举原样保留，页面原样展示，不静默清空。
    category: toText(source?.category) || toText(intake?.category),
    notes: toText(source?.notes),
    // MEASURE
    baseUnit,
    unitDisplayLabel:
      toText(source?.unitDisplayLabel) || DEFAULT_UNIT_DISPLAY_LABELS[baseUnit],
    weightG: toFiniteNumber(source?.weightG),
    maxCapacityG: toFiniteNumber(source?.maxCapacityG),
    // NUTRITION
    cfctClass: toText(source?.cfctClass),
    edibleYieldPercent:
      rate !== null && rate >= 0 && rate <= 1
        ? Math.round(rate * 10000) / 100
        : null,
    mainNutrientsDesc: toText(source?.mainNutrientsDesc),
    // PURCHASE
    procurementStrategy: toText(source?.procurementStrategy),
    purchaseUnit: toText(source?.purchaseUnit),
    purchaseToBaseRatio: toFiniteNumber(source?.purchaseToBaseRatio),
    currentPricePerPurchaseUnit: toFiniteNumber(
      source?.currentPricePerPurchaseUnit
    ),
    brand: toText(source?.brand),
    productModel: toText(source?.productModel),
    purchaseChannel: toText(source?.purchaseChannel),
    // STOCK
    safetyStock: toFiniteNumber(source?.safetyStock),
    reorderPoint: toFiniteNumber(source?.reorderPoint),
    targetStock: toFiniteNumber(source?.targetStock),
    // USAGE
    diyEnabled: toBooleanOrNull(source?.diyEnabled),
    addTiming: toText(source?.addTiming),
    productionLossRate: toFiniteNumber(source?.productionLossRate),
    tags: toTagList(source?.tags),
    // STORAGE
    shelfLifeMonths: toFiniteNumber(source?.shelfLifeMonths),
    storageCondition: toText(source?.storageCondition),
    openedShelfLifeDays: toFiniteNumber(source?.openedShelfLifeDays),
    isOilBased: toBooleanOrNull(source?.isOilBased),
    manualFields: toManualFields(source?.manualFields)
  }
}

/**
 * 表单值写回草稿：**30 项一个不少**，可食部百分数换比例，空串落成 null。
 *
 * 为什么一项都不能省：后端草稿 PATCH 是 `payload = payload || $1::jsonb` 的浅替换，
 * `payload.ingredient` 会被整块覆盖。少发一个键 = 把 AI 填的其它字段悄悄抹掉。
 */
export function toIngredientDraft(card: IngredientCardForm): IngredientDraft {
  const baseUnit = toBaseUnit(card.baseUnit)
  const percent = toFiniteNumber(card.edibleYieldPercent)

  return {
    // BASIC
    name: toText(card.name),
    nameEn: toNullableText(card.nameEn),
    type: 'FOOD',
    category: toKnownSelectValue(
      'category',
      card.category
    ) as CoverageCategory | null,
    notes: toNullableText(card.notes),
    // MEASURE
    baseUnit,
    unitDisplayLabel:
      toText(card.unitDisplayLabel) || DEFAULT_UNIT_DISPLAY_LABELS[baseUnit],
    weightG: toFiniteNumber(card.weightG),
    maxCapacityG: toFiniteNumber(card.maxCapacityG),
    // NUTRITION
    cfctClass: toNullableText(card.cfctClass),
    edibleYieldRate:
      percent === null ? null : Math.round(percent * 100) / 10000,
    mainNutrientsDesc: toNullableText(card.mainNutrientsDesc),
    // PURCHASE
    procurementStrategy: toKnownSelectValue(
      'procurementStrategy',
      card.procurementStrategy
    ),
    purchaseUnit: toNullableText(card.purchaseUnit),
    purchaseToBaseRatio: toFiniteNumber(card.purchaseToBaseRatio),
    currentPricePerPurchaseUnit: toFiniteNumber(
      card.currentPricePerPurchaseUnit
    ),
    brand: toNullableText(card.brand),
    productModel: toNullableText(card.productModel),
    purchaseChannel: toNullableText(card.purchaseChannel),
    // STOCK
    safetyStock: toFiniteNumber(card.safetyStock),
    reorderPoint: toFiniteNumber(card.reorderPoint),
    targetStock: toFiniteNumber(card.targetStock),
    // USAGE
    diyEnabled: toBooleanOrNull(card.diyEnabled),
    addTiming: toKnownSelectValue('addTiming', card.addTiming),
    productionLossRate: toFiniteNumber(card.productionLossRate),
    tags: toTagList(card.tags),
    // STORAGE
    shelfLifeMonths: toFiniteNumber(card.shelfLifeMonths),
    storageCondition: toNullableText(card.storageCondition),
    openedShelfLifeDays: toFiniteNumber(card.openedShelfLifeDays),
    isOilBased: toBooleanOrNull(card.isOilBased),
    manualFields: toManualFields(card.manualFields)
  }
}

/** 人改了一个字段：把字段名并入人工改动清单（去重、不改原对象）。 */
export function markIngredientFieldManual(
  card: IngredientCardForm,
  field: IngredientCardField
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
 * 把「可用档案列表」里选中的对象映射回草稿**原始** `payload.profiles` 的下标。
 *
 * 后端 authorize 按原始数组下标挑主档案，明确不做过滤重排；前端若直接传
 * 可用列表（过滤掉脏档案后）的下标，前面有脏档案时会指向空或错位，甚至
 * 把另一份档案当成主档案写进正式表。对象引用来自同一份 payload，用
 * `indexOf` 精确映射；找不到时返回 -1，调用方必须停下报错，不能猜。
 */
export function resolveRawPrimaryProfileIndex(
  payload: IngredientCreationDraftPayload | null | undefined,
  chosen: ProfileDraft | null | undefined
): number {
  if (!chosen) {
    return -1
  }
  const profiles = Array.isArray(payload?.profiles) ? payload.profiles : []
  return profiles.indexOf(chosen)
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
    category:
      toKnownCoverageCategory(ingredient.category) ??
      toKnownCoverageCategory(card.category)
  })
  if (primaryProfileIndex < 0) {
    return null
  }

  return { ingredient, profiles, primaryProfileIndex }
}

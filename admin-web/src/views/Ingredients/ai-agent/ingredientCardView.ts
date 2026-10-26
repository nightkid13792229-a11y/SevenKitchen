/**
 * 原料档案页的纯视图模型：字段目录 → 30 个可渲染的格子。
 *
 * 这层不依赖 Vue、不发请求，只做三件事：
 * - 把草稿里的存储口径翻成展示口径（可食部比例 → 百分数，损耗 → 倍数）；
 * - 补齐空格子的展示（空 → 「空」，而不是隐藏）；
 * - 把页面上的 30 个格子原样写回一份完整草稿（整卡保存，绝不只发改动的那一格）。
 *
 * 后端草稿 PATCH 是浅替换：`payload.ingredient` 会被整块覆盖，所以写回必须 30 项齐全。
 */
import {
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS,
  type IngredientCardFieldDef,
  type IngredientCardFieldKey,
  type IngredientFieldGroup
} from '@/constants/ingredientCardFields'
import type { IngredientDraft } from '@/types/ingredientCreation'
import {
  toIngredientCard,
  toIngredientDraft,
  type IngredientCardForm,
  type IngredientCardFormValue
} from './draftReview'

/** 页面控件类型：数字 / 文本 / 布尔 / 枚举 / 标签。 */
export type IngredientCardCellKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'tags'

/** 一个格子的全部渲染信息（纯数据，模板只照着画）。 */
export interface IngredientCardCell {
  key: IngredientCardFieldKey
  group: IngredientFieldGroup
  groupLabel: string
  label: string
  kind: IngredientCardCellKind
  /** 展示口径的值：可食部 0–100、损耗倍率 1.05、空值 null / '' / [] */
  value: IngredientCardFormValue
  /** 文本形式的展示值；空格子固定为「空」 */
  display: string
  isManual: boolean
  isAfterCreate: boolean
  /** 来源标记：人工 / AI / 空（没有值就不标来源） */
  sourceLabel: 'AI' | '人工' | null
  options?: readonly { label: string; value: string }[]
  unit?: string
  /** 口径提示，例如倍数的「= 损耗 5%」 */
  hint?: string
}

/**
 * 页面表单的形状：30 个键都可能出现，值来自控件（未知键忽略）。
 *
 * 用 Partial 是为了让调用方可以只覆盖改动过的键，其余沿用草稿原值。
 */
export type IngredientCardCellForm = Partial<
  Record<IngredientCardFieldKey | 'manualFields', unknown>
>

const FIELD_BY_KEY: ReadonlyMap<
  IngredientCardFieldKey,
  IngredientCardFieldDef
> = new Map(INGREDIENT_CARD_FIELDS.map((field) => [field.key, field] as const))

const GROUP_LABEL_BY_KEY: ReadonlyMap<IngredientFieldGroup, string> = new Map(
  INGREDIENT_CARD_FIELD_GROUPS.map((group) => [group.key, group.label] as const)
)

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 数字展示：最多两位小数，去掉尾随 0（75.00 → 75，1.050 → 1.05）。 */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * 空值判定：null / undefined / 纯空白串 / 空数组都算空。
 * `0` 与 `false` 是有效值，不算空（否则会被误显示成「空」并丢掉）。
 */
export function isEmptyIngredientCardValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value === 'string') {
    return value.trim().length === 0
  }
  if (Array.isArray(value)) {
    return value.length === 0
  }
  return false
}

/** 数组按内容比较，其余按严格相等比较（用于判断某格是否真的改过）。 */
export function ingredientCellValuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index])
  }
  return Object.is(a, b)
}

/**
 * 生产损耗的提示：1.05 → 「= 损耗 5%」。
 *
 * 倍数是**存 1.05**，不是 105%；提示只负责把差额翻译成人话，不改存储值。
 */
export function formatMultiplierHint(value: unknown): string | null {
  const multiplier = finiteNumber(value)
  if (multiplier === null) {
    return null
  }
  const lossPercent = Math.round((multiplier - 1) * 10000) / 100
  return `= 损耗 ${formatNumber(lossPercent)}%`
}

/**
 * 单格展示文本。按目录的 `valueType` 与 key 特判：
 * 百分数带 %、倍数保持 1.05、布尔用「是 / 否」、枚举显示 label（未知值原样）。
 */
export function formatCellDisplay(
  key: IngredientCardFieldKey,
  value: unknown
): string {
  if (isEmptyIngredientCardValue(value)) {
    return '空'
  }

  const field = FIELD_BY_KEY.get(key)

  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    return items.length > 0 ? items.join('、') : '空'
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '空'
    }
    return field?.valueType === 'percent'
      ? `${formatNumber(value)}%`
      : formatNumber(value)
  }

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) {
      return '空'
    }
    if (field?.valueType === 'select') {
      return (
        field.options?.find((option) => option.value === text)?.label ?? text
      )
    }
    return text
  }

  return '空'
}

/** 枚举选项 + 当前值：未知值补一条同名选项，保证下拉里看得见、不会被清空。 */
export function selectOptionsForValue(
  options: readonly { label: string; value: string }[] | undefined,
  value: unknown
): { label: string; value: string }[] {
  const list = (options ?? []).map((option) => ({ ...option }))
  const text = typeof value === 'string' ? value.trim() : ''
  if (text && !list.some((option) => option.value === text)) {
    list.push({ label: text, value: text })
  }
  return list
}

function kindFor(
  valueType: IngredientCardFieldDef['valueType']
): IngredientCardCellKind {
  switch (valueType) {
    case 'text':
      return 'text'
    case 'number':
    case 'percent':
    case 'multiplier':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'select':
      return 'select'
    case 'tags':
      return 'tags'
  }
}

/**
 * 从草稿读一格，翻成展示口径。
 *
 * 可食部在草稿里是比例 `edibleYieldRate`（0–1），页面用百分数
 * `edibleYieldPercent`（0–100）；换算只在这里发生一次。
 */
function draftFieldValue(
  draft: IngredientDraft | null | undefined,
  field: IngredientCardFieldDef
): IngredientCardFormValue {
  if (!draft) {
    return field.valueType === 'tags'
      ? []
      : field.valueType === 'text' || field.valueType === 'select'
        ? ''
        : null
  }

  if (field.key === 'edibleYieldPercent') {
    const rate = finiteNumber(draft.edibleYieldRate)
    return rate === null ? null : Math.round(rate * 10000) / 100
  }

  const raw = (draft as unknown as Record<string, unknown>)[field.key]

  switch (field.valueType) {
    case 'tags':
      return Array.isArray(raw)
        ? raw
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    case 'boolean':
      return typeof raw === 'boolean' ? raw : null
    case 'number':
    case 'multiplier':
      return finiteNumber(raw)
    case 'percent': {
      // 目录里以后若新增百分数字段，按 0–1 存量 → 0–100 展示。
      const rate = finiteNumber(raw)
      return rate === null ? null : Math.round(rate * 10000) / 100
    }
    case 'text':
    case 'select':
      return typeof raw === 'string' ? raw.trim() : ''
  }
}

function hintFor(
  field: IngredientCardFieldDef,
  value: IngredientCardFormValue
): string | undefined {
  if (field.valueType === 'select' && typeof value === 'string') {
    const text = value.trim()
    if (
      text &&
      field.options &&
      !field.options.some((option) => option.value === text)
    ) {
      return '目录外取值，保存时按空处理'
    }
  }
  if (field.valueType === 'multiplier') {
    return formatMultiplierHint(value) ?? undefined
  }
  return undefined
}

/**
 * 铺满 30 个格子：顺序、分组、label 全部来自字段目录，空值也占位。
 *
 * @param draft 草稿里的原料卡（可食部是比例）；没有就传 null
 * @param manualFields 人工改动过的公共字段名
 */
export function buildIngredientCardCells(
  draft: IngredientDraft | null | undefined,
  manualFields: readonly string[]
): IngredientCardCell[] {
  const manual = new Set(manualFields)

  return INGREDIENT_CARD_FIELDS.map((field) => {
    const value = draftFieldValue(draft, field)
    const isManual = manual.has(field.key)

    return {
      key: field.key,
      group: field.group,
      groupLabel: GROUP_LABEL_BY_KEY.get(field.group) ?? field.group,
      label: field.label,
      kind: kindFor(field.valueType),
      value,
      display: formatCellDisplay(field.key, value),
      isManual,
      isAfterCreate: field.stage === 'AFTER_CREATE',
      sourceLabel: isManual
        ? '人工'
        : isEmptyIngredientCardValue(value)
          ? null
          : 'AI',
      options: field.options,
      unit: field.unit ?? (field.valueType === 'percent' ? '%' : undefined),
      hint: hintFor(field, value)
    }
  })
}

/**
 * 页面表单 → 完整草稿（30 项）。
 *
 * 以草稿为底、用表单覆盖：表单里没出现的键保留草稿原值，
 * 因此任何一次保存发出去的都是完整原料卡，不会因浅替换丢字段。
 */
export function toIngredientDraftFromCells(
  draft: IngredientDraft | null | undefined,
  form: IngredientCardCellForm
): IngredientDraft {
  const card: IngredientCardForm = toIngredientCard(
    draft ? { ingredient: draft } : null
  )
  const target = card as unknown as Record<string, unknown>

  for (const field of INGREDIENT_CARD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(form, field.key)) {
      target[field.key] = form[field.key]
    }
  }
  if (Object.prototype.hasOwnProperty.call(form, 'manualFields')) {
    target.manualFields = form.manualFields
  }

  return toIngredientDraft(card)
}

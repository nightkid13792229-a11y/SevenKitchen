/**
 * 补剂目标营养素工具（2026-10-22）。
 *
 * 目标定义永远只对应一个 `fieldPath`；组合（如 EPA+DHA）使用派生字段。
 * 添加浓度 = 补剂提供的目标营养素总量 ÷ 配方总重量（g）× 1000。
 *
 * 这里不做任何「移除补剂后是否出现缺口」的推断：纤维素粉这类功能性补剂
 * 不会造成营养缺口，目标必须由营养师显式选择。
 */
import {
  DERIVED_NUTRITION_FIELD_CATALOG,
  NUTRITION_FIELD_CATALOG,
  findNutritionField,
} from './nutritionFieldCatalog'
import {
  buildIngredientNutritionPayload,
  normalizeIngredientNutritionProfileToForm,
} from '@/utils/ingredientNutrition'
import { normalizeNutritionProfile } from './nutritionProfileUtils'
import { readProfileFieldAmount } from './nutritionProfileReader'
import type { NutritionProfile, NutritionProfileV2 } from './nutritionProfileTypes'

/** 可保存的补剂目标定义（label/unit 以营养字段目录为准） */
export interface SupplementTargetDefinition {
  fieldPath: string
  label: string
  unit: string
}

/** 营养档案里可作为补剂目标的非空字段 */
export interface SupplementTargetFieldCandidate extends SupplementTargetDefinition {
  source: 'FIELD' | 'DERIVED'
  quantityKind: string
  /** 档案中的当前数值（派生字段为组合求和值） */
  value: number
  /** 供选择器展示的提示文案 */
  valueText: string
}

function hasAnyCatalogValue(profile: NutritionProfileV2 | null): boolean {
  if (!profile) {
    return false
  }
  return NUTRITION_FIELD_CATALOG.some((field) => {
    const tabValues = profile[field.tabKey] as
      | Record<string, number | null | undefined>
      | undefined
    const value = tabValues?.[field.fieldKey]
    return typeof value === 'number' && Number.isFinite(value) && value !== 0
  })
}

/**
 * 统一成 v2 档案后再读取。
 *
 * 历史营养档案可能是 legacy items[] 或扁平字段表；设计器侧
 * 只做展示 / 校验，沿用原料营养成分编辑器那套归一化，避免
 * 「档案里明明有值，补剂目标选择器却是空的」。
 */
function toReadableProfile(profile: unknown): NutritionProfileV2 | null {
  const normalized = normalizeNutritionProfile(
    (profile ?? null) as NutritionProfile | null,
  )
  if (hasAnyCatalogValue(normalized)) {
    return normalized
  }

  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return normalized
  }

  try {
    const rebuilt = buildIngredientNutritionPayload(
      normalizeIngredientNutritionProfileToForm(
        profile as Parameters<typeof normalizeIngredientNutritionProfileToForm>[0],
      ),
    )
    return (rebuilt as unknown as NutritionProfileV2 | null) ?? normalized
  } catch {
    return normalized
  }
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '-'
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function readDirectFieldValue(
  profile: NutritionProfileV2,
  fieldPath: string,
): number | null {
  const field = findNutritionField(fieldPath)
  if (!field) {
    return null
  }
  const tabValues = profile[field.tabKey] as
    | Record<string, number | null | undefined>
    | undefined
  const value = tabValues?.[field.fieldKey]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readDerivedFieldValue(
  profile: NutritionProfileV2,
  fieldPath: string,
): number | null {
  const derived = DERIVED_NUTRITION_FIELD_CATALOG.find(
    (candidate) => candidate.fieldPath === fieldPath,
  )
  if (!derived || derived.formula !== 'SUM') {
    return null
  }

  let total = 0
  for (const sourceFieldPath of derived.sourceFieldPaths) {
    const value = readDirectFieldValue(profile, sourceFieldPath)
    if (value === null) {
      return null
    }
    total += value
  }
  return total
}

/** 补剂目标允许使用的所有字段（直接字段 + 派生字段） */
export function resolveSupplementTargetDefinition(
  fieldPath: string | null | undefined,
): SupplementTargetDefinition | null {
  const path = typeof fieldPath === 'string' ? fieldPath.trim() : ''
  if (!path) {
    return null
  }

  const directField = NUTRITION_FIELD_CATALOG.find(
    (field) => field.fieldPath === path,
  )
  if (directField) {
    return {
      fieldPath: directField.fieldPath,
      label: directField.label,
      unit: directField.unit,
    }
  }

  const derivedField = DERIVED_NUTRITION_FIELD_CATALOG.find(
    (field) => field.fieldPath === path,
  )
  if (derivedField) {
    return {
      fieldPath: derivedField.fieldPath,
      label: derivedField.label,
      unit: derivedField.unit,
    }
  }

  return null
}

/**
 * 把存档 / 接口返回的目标定义归一化为字段目录定义。
 *
 * 未知字段直接忽略（不静默显示 `-`，由调用方给出明确提示）；
 * 重复 fieldPath 只保留第一次，保证「一个目标对应一个 fieldPath」。
 */
export function normalizeSupplementTargetDefinitions(
  targets: unknown,
): SupplementTargetDefinition[] {
  if (!Array.isArray(targets)) {
    return []
  }

  const definitions: SupplementTargetDefinition[] = []
  const seenFieldPaths = new Set<string>()

  for (const target of targets) {
    const rawPath =
      typeof target === 'string'
        ? target
        : target && typeof target === 'object'
          ? (target as { fieldPath?: unknown }).fieldPath
          : null
    const definition = resolveSupplementTargetDefinition(
      typeof rawPath === 'string' ? rawPath : null,
    )
    if (!definition || seenFieldPaths.has(definition.fieldPath)) {
      continue
    }
    seenFieldPaths.add(definition.fieldPath)
    definitions.push(definition)
  }

  return definitions
}

/**
 * 读取营养档案详情里配置的默认目标。
 *
 * 只做字段目录归一化；字段在当前档案里是否为空由编辑器和后端保存时校验。
 */
export function readDefaultSupplementTargets(
  detail: { defaultSupplementTargets?: unknown } | null | undefined,
): SupplementTargetDefinition[] {
  return normalizeSupplementTargetDefinitions(
    detail?.defaultSupplementTargets,
  )
}

/**
 * 列出营养档案中「已填写且大于 0」的字段，供默认目标 / 添加补剂时选择。
 *
 * 组合字段（如 derived.epaDha）只有在来源字段齐全且合计大于 0 时才出现；
 * 比例类派生字段（钙磷比）不是「添加浓度」，不参与补剂目标选择。
 */
export function listSupplementTargetFieldCandidates(
  profile: unknown,
): SupplementTargetFieldCandidate[] {
  const normalized = toReadableProfile(profile)
  if (!normalized) {
    return []
  }

  const candidates: SupplementTargetFieldCandidate[] = []

  for (const field of NUTRITION_FIELD_CATALOG) {
    const value = readDirectFieldValue(normalized, field.fieldPath)
    if (value === null || !isPositiveFiniteNumber(value)) {
      continue
    }
    candidates.push({
      fieldPath: field.fieldPath,
      label: field.label,
      unit: field.unit,
      source: 'FIELD',
      quantityKind: field.quantityKind,
      value,
      valueText: `档案值 ${formatNumber(value)} ${field.unit}`,
    })
  }

  for (const derived of DERIVED_NUTRITION_FIELD_CATALOG) {
    if (derived.formula !== 'SUM') {
      continue
    }
    const value = readDerivedFieldValue(normalized, derived.fieldPath)
    if (value === null || !isPositiveFiniteNumber(value)) {
      continue
    }
    candidates.push({
      fieldPath: derived.fieldPath,
      label: derived.label,
      unit: derived.unit,
      source: 'DERIVED',
      quantityKind: derived.quantityKind,
      value,
      valueText: `组合合计 ${formatNumber(value)} ${derived.unit}`,
    })
  }

  return candidates
}

function normalizeLookupKey(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase()
}

/**
 * 把评估指标 key（如 epaDha / calcium）解析成补剂目标 fieldPath。
 *
 * 用于「从营养评估面板智能添加补剂」时预选当前营养素。
 * 解析不出来时返回 null，调用方要求用户手动选择，不猜。
 */
export function resolveSupplementTargetFieldPath(
  nutrientKey: string | null | undefined,
): string | null {
  const key = normalizeLookupKey(nutrientKey)
  if (!key) {
    return null
  }

  for (const field of NUTRITION_FIELD_CATALOG) {
    if (
      normalizeLookupKey(field.fieldKey) === key ||
      normalizeLookupKey(field.fieldPath) === key
    ) {
      return field.fieldPath
    }
  }

  for (const derived of DERIVED_NUTRITION_FIELD_CATALOG) {
    const derivedKey = derived.fieldPath.slice(
      derived.fieldPath.lastIndexOf('.') + 1,
    )
    if (
      normalizeLookupKey(derived.fieldPath) === key ||
      normalizeLookupKey(derivedKey) === key
    ) {
      return derived.fieldPath
    }
  }

  return null
}

/**
 * 读取补剂在 `weightG` 用量下提供的目标营养素总量。
 *
 * 派生组合字段按来源字段逐个读取后求和；任一来源字段缺失即视为缺数据，
 * 不按 0 静默处理。
 */
export function readSupplementTargetAmount(
  profile: unknown,
  fieldPath: string,
  weightG: number,
): number | null {
  const normalized = toReadableProfile(profile)
  if (!normalized || !Number.isFinite(weightG) || weightG <= 0) {
    return null
  }

  const derived = DERIVED_NUTRITION_FIELD_CATALOG.find(
    (candidate) => candidate.fieldPath === fieldPath,
  )
  if (derived) {
    if (derived.formula !== 'SUM') {
      return null
    }
    let total = 0
    for (const sourceFieldPath of derived.sourceFieldPaths) {
      const read = readProfileFieldAmount(normalized, sourceFieldPath, weightG)
      if (read.missing || read.amount === null || !Number.isFinite(read.amount)) {
        return null
      }
      total += read.amount
    }
    return total
  }

  const read = readProfileFieldAmount(normalized, fieldPath, weightG)
  if (read.missing || read.amount === null || !Number.isFinite(read.amount)) {
    return null
  }
  return read.amount
}

/**
 * 计算每 kg 配方的实际添加浓度。
 *
 * 分母固定使用当前评估的有效原料总重量；总重量未知 / 无效时返回 null，
 * 界面显示「缺数据」并保留硬阻断，不按 0 处理。
 */
export function computeSupplementTargetConcentration(
  profile: unknown,
  fieldPath: string,
  weightG: number,
  totalWeightG: number | null | undefined,
): number | null {
  if (
    typeof totalWeightG !== 'number' ||
    !Number.isFinite(totalWeightG) ||
    totalWeightG <= 0
  ) {
    return null
  }

  const amount = readSupplementTargetAmount(profile, fieldPath, weightG)
  if (amount === null || amount <= 0) {
    return null
  }

  const valuePerKg = (amount / totalWeightG) * 1000
  if (!Number.isFinite(valuePerKg) || valuePerKg <= 0) {
    return null
  }

  return Math.round((valuePerKg + Number.EPSILON) * 100) / 100
}

/** 添加浓度展示文案，如「EPA + DHA 1234.56 mg/kg」 */
export function formatSupplementTargetConcentration(
  definition: SupplementTargetDefinition,
  valuePerKg: number | null,
): string {
  if (valuePerKg === null || !Number.isFinite(valuePerKg)) {
    return `${definition.label} 缺数据`
  }
  return `${definition.label} ${formatNumber(valuePerKg)} ${definition.unit}/kg`
}

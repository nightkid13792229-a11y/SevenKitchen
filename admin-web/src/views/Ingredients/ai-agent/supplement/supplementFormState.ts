/**
 * 补剂档案的表单状态。
 *
 * 一条规矩：**人填的是标签上"每份"的值，写进库的是"每粒"的值。**
 * 折算只在这里做一次，门禁再校验一次，两处用同一个数——否则门禁就是自说自话。
 *
 * 这里不碰 Vue，只做纯数据，好在 node 环境里直接测。
 */
import type {
  CreateSupplementIngredientPayload,
  SupplementLinkPreviewDto,
  SupplementPhysicalForm
} from '@/types/ingredientCreation'
import { supplementNutrientGroups } from '@/constants/supplementNutrients'
import type { SupplementGateInput } from './supplementGates'
import { convertPerUnit } from './supplementGates'

export interface SupplementEvidenceValue {
  productUrl: string
  labelImageUrl: string
  labelText: string
}

export interface SupplementDraftValue {
  name: string
  brand: string
  productModel: string
  purchaseChannel: string
  unitDisplayLabel: string
  physicalForm: SupplementPhysicalForm
  servingUnitsPerDose: number | null
  purchaseUnit: string
  purchaseToBaseRatio: number | null
  currentPricePerPurchaseUnit: number | null
  addTiming: string
  productionLossRate: number
  diyEnabled: boolean
  procurementEnabled: boolean
  tagNames: string[]
  labelCategory: 'FEED_MATERIAL' | 'FEED_ADDITIVE' | null
  labelNames: string[]
  labelNameSource: string
  /** 标签上每份的值（人看着抄进来的） */
  servingNutrients: Record<string, number>
  /** 人手改过的每粒值（默认不填，等于自动折算） */
  perUnitOverrides: Record<string, number>
  evidence: SupplementEvidenceValue
}

export function emptySupplementDraft(): SupplementDraftValue {
  return {
    name: '',
    brand: '',
    productModel: '',
    purchaseChannel: '',
    unitDisplayLabel: '粒',
    physicalForm: 'CAPSULE',
    servingUnitsPerDose: null,
    purchaseUnit: '瓶',
    purchaseToBaseRatio: null,
    currentPricePerPurchaseUnit: null,
    addTiming: '',
    productionLossRate: 1.05,
    diyEnabled: true,
    procurementEnabled: true,
    tagNames: [],
    labelCategory: null,
    labelNames: [],
    labelNameSource: '',
    servingNutrients: {},
    perUnitOverrides: {},
    evidence: { productUrl: '', labelImageUrl: '', labelText: '' }
  }
}

/**
 * 每份值 ÷ 每份粒数 = 每粒值。
 * 手改过的字段以手改值为准——但也只在这里取值，门禁会拿它跟 ÷N 的结果对一次。
 */
export function computePerUnit(
  servingNutrients: Record<string, number>,
  servingUnitsPerDose: number | null,
  overrides: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, servingValue] of Object.entries(servingNutrients)) {
    const override = overrides[key]
    if (typeof override === 'number' && Number.isFinite(override)) {
      result[key] = override
      continue
    }
    const computed = convertPerUnit(servingValue, servingUnitsPerDose)
    if (computed !== null) {
      result[key] = computed
    }
  }
  return result
}

export function toGateInput(draft: SupplementDraftValue): SupplementGateInput {
  return {
    servingUnitsPerDose: draft.servingUnitsPerDose,
    servingNutrients: draft.servingNutrients,
    perUnitNutrients: computePerUnit(
      draft.servingNutrients,
      draft.servingUnitsPerDose,
      draft.perUnitOverrides
    ),
    baseUnit: 'PCS',
    purchasePricePerPurchaseUnit: draft.currentPricePerPurchaseUnit,
    purchaseToBaseRatio: draft.purchaseToBaseRatio
  }
}

/**
 * 人定项没填完就不发请求——返回 null，界面据此禁用写入按钮。
 * 这些是"没填"，不是"填错"，所以不进三道门禁。
 */
export function findMissingHumanFields(draft: SupplementDraftValue): string[] {
  const missing: string[] = []
  if (!draft.addTiming.trim()) {
    missing.push('addTiming')
  }
  if (draft.tagNames.length === 0) {
    missing.push('tagNames')
  }
  // 合规两格：阶段四由 AI 查目录预填，在那之前没人填就是没人填
  if (!draft.labelCategory) {
    missing.push('labelCategory')
  }
  if (draft.labelNames.length === 0) {
    missing.push('labelNames')
  }
  return missing
}

export function toCreatePayload(
  draft: SupplementDraftValue
): CreateSupplementIngredientPayload | null {
  if (!draft.name.trim()) {
    return null
  }
  if (findMissingHumanFields(draft).length > 0) {
    return null
  }
  if (!draft.purchaseUnit.trim()) {
    return null
  }
  if (!draft.servingUnitsPerDose || draft.servingUnitsPerDose < 1) {
    return null
  }
  if (!draft.purchaseToBaseRatio || draft.purchaseToBaseRatio <= 0) {
    return null
  }
  if (!draft.currentPricePerPurchaseUnit || draft.currentPricePerPurchaseUnit <= 0) {
    return null
  }

  const text = (value: string): string | null => (value.trim() ? value.trim() : null)

  return {
    name: draft.name.trim(),
    brand: text(draft.brand) ?? undefined,
    productModel: text(draft.productModel) ?? undefined,
    purchaseChannel: text(draft.purchaseChannel) ?? undefined,
    unitDisplayLabel: draft.unitDisplayLabel,
    physicalForm: draft.physicalForm,
    purchaseUnit: draft.purchaseUnit.trim(),
    purchaseToBaseRatio: draft.purchaseToBaseRatio,
    currentPricePerPurchaseUnit: draft.currentPricePerPurchaseUnit,
    addTiming: draft.addTiming,
    productionLossRate: draft.productionLossRate,
    diyEnabled: draft.diyEnabled,
    procurementEnabled: draft.procurementEnabled,
    labelCategory: draft.labelCategory ?? undefined,
    labelNames: draft.labelNames,
    labelNameSource: text(draft.labelNameSource) ?? undefined,
    tagNames: draft.tagNames,
    servingUnitsPerDose: draft.servingUnitsPerDose,
    // 送「每份」值：折算只有服务端那一处说了算，这里最多是预览
    servingNutrients: { ...draft.servingNutrients },
    evidence: {
      productUrl: text(draft.evidence.productUrl),
      labelImageUrl: text(draft.evidence.labelImageUrl),
      labelText: text(draft.evidence.labelText)
    }
  }
}

/** 每个规范字段的目标单位，来自补剂营养字段组——换算要对齐它，不能自己另开一套。 */
export function supplementFieldUnits(): Record<string, string> {
  const units: Record<string, string> = {}
  for (const group of supplementNutrientGroups) {
    for (const field of group.fields) {
      units[field.fieldPath] = field.unit
    }
  }
  return units
}

/** 标签单位 → 毫克，只处理质量单位；IU、CFU 这类不换算。 */
const MASS_TO_MG: Record<string, number> = {
  g: 1000,
  mg: 1,
  mcg: 0.001,
  'µg': 0.001,
  'μg': 0.001
}

function convertUnit(value: number, from: string, to: string): number | null {
  const source = from.toLowerCase()
  const target = to.toLowerCase()
  if (source === target) {
    return value
  }
  const fromMg = MASS_TO_MG[source]
  const toMg = MASS_TO_MG[target]
  if (fromMg === undefined || toMg === undefined) {
    return null
  }
  return (value * fromMg) / toMg
}

export interface PreviewPatchResult {
  patch: Partial<SupplementDraftValue>
  /** 单位对不上、没放进来的行，原样交给界面提示 */
  skipped: string[]
}

/**
 * 把「链接读出来的初稿」翻成表单上能填的值。
 *
 * 单位对不上就不硬塞——宁可让人手填一格，也不要悄悄把 120µg 记成 120mg。
 */
export function patchFromPreview(
  preview: SupplementLinkPreviewDto
): PreviewPatchResult {
  const units = supplementFieldUnits()
  const servingNutrients: Record<string, number> = {}
  const skipped: string[] = []

  for (const nutrient of preview.nutrients) {
    const target = units[nutrient.fieldPath]
    if (!target) {
      skipped.push(nutrient.rawName)
      continue
    }
    const converted = convertUnit(nutrient.value, nutrient.unit, target)
    if (converted === null) {
      skipped.push(`${nutrient.rawName}（${nutrient.unit || '无单位'}，档案按 ${target} 记）`)
      continue
    }
    servingNutrients[nutrient.fieldPath] = converted
  }

  const patch: Partial<SupplementDraftValue> = {
    evidence: {
      productUrl: preview.productUrl,
      labelImageUrl: '',
      labelText: preview.labelText ?? ''
    },
    servingNutrients
  }

  if (preview.servingUnitsPerDose && preview.servingUnitsPerDose > 0) {
    patch.servingUnitsPerDose = preview.servingUnitsPerDose
  }
  if (preview.productName) {
    patch.name = preview.productName
  }

  return { patch, skipped: [...skipped, ...preview.unrecognized] }
}

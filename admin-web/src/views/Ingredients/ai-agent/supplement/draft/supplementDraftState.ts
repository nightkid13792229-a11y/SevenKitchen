/**
 * 补剂草稿的前端纯逻辑（不依赖 Vue，可在 node 环境直接测）。
 *
 * 三件事：
 * - 最终审核门禁：有阻断项、或有提醒项没逐条确认，就不允许写入；
 * - AI 重填 diff：只列真正变化的字段，人工改过的路径打标记；
 * - 字段映射表：审核屏「写入后会写什么」的只读清单（spec §12 的落点）。
 *
 * 门禁判断必须与后端 finalize 同一口径：后端按 `ackKey`（缺省回退 `code`）
 * 匹配已确认提醒，前端这里也用 `ackKeyOf`，不能自己拼 code。
 */
import type {
  SupplementDraftPayload,
  SupplementDraftReview,
  SupplementDraftValidationIssue
} from '@/api/supplementDrafts'

/** AI 重填时参与 diff 的区块（`review` 是人已经确认过的提醒，不参与）。 */
export const DRAFT_DIFF_SECTIONS = [
  'basic',
  'nutrition',
  'label',
  'retail',
  'diy',
  'procurement',
  'equivalence',
  'evidence'
] as const

export type SupplementDraftDiffSection = (typeof DRAFT_DIFF_SECTIONS)[number]

/** 一行 diff：字段路径、改动前后值、是否属于人改过的路径。 */
export interface SupplementDraftDiffRow {
  path: string
  before: unknown
  after: unknown
  /** 该路径是否在 `manualFields` 里（含其子路径），UI 要标「人改，AI 未覆盖」 */
  manual: boolean
}

/** 字段映射表的一行：草稿路径 → 生产落点。 */
export interface SupplementDraftFieldMapRow {
  /** 草稿 payload 的点路径，如 `retail.shelfLifeMonths` */
  path: string
  /** 给人看的字段名 */
  label: string
  /** 生产落点，如 `ingredient.shelf_life_months`（多落点时用 ` + ` 连接） */
  target: string
  /** 审核屏分组（与编辑页区块一致） */
  section: string
}

/** 需要人确认的提醒项：优先后端给的 `ackKey`，没有就回退 `code`。 */
export function ackKeyOf(
  issue: Pick<SupplementDraftValidationIssue, 'ackKey' | 'code'>
): string {
  const explicit = issue.ackKey?.trim()
  return explicit ? explicit : issue.code
}

/** 是否有阻断项；有就不允许写入，也不提供「仍然写入」。 */
export function hasBlocker(review: SupplementDraftReview | null | undefined): boolean {
  return (review?.blockers.length ?? 0) > 0
}

/**
 * 是否允许最终写入。
 *
 * 条件（与后端 finalize 前置校验一致）：
 * - 有审核结果；
 * - 阻断项为 0；
 * - 每一条提醒项都能在 `acknowledged` 里找到自己的 ackKey（缺省回退 code）。
 */
export function canFinalize(
  review: SupplementDraftReview | null | undefined,
  acknowledged: readonly string[]
): boolean {
  if (!review) return false
  if (hasBlocker(review)) return false
  const accepted = new Set(acknowledged)
  return review.warnings.every((issue) => accepted.has(ackKeyOf(issue)))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 把一段草稿展平成「点路径 → 叶子值」。
 *
 * 普通对象逐层展开（营养素是按字段路径为键的映射，也要落到具体营养素），
 * 数组当整值比较 —— 标签名/默认目标是一组值，改一个就整组替换，没有
 * `labelNames.0` 这种下标路径给 UI 选。
 */
function flattenSection(
  section: unknown,
  prefix: string,
  out: Map<string, unknown>
): void {
  if (!isPlainObject(section)) {
    out.set(prefix, section)
    return
  }
  for (const [key, value] of Object.entries(section)) {
    const path = `${prefix}.${key}`
    if (isPlainObject(value)) {
      flattenSection(value, path, out)
    } else {
      out.set(path, value)
    }
  }
}

/** 与键序无关的深比较：数字正常比较，数组按顺序比较，对象按键排序。 */
function canonicalValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null'
  }
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalValue(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
    .join(',')}}`
}

function isSameValue(left: unknown, right: unknown): boolean {
  return canonicalValue(left) === canonicalValue(right)
}

/** `manualFields` 里记的是父路径时，其子路径也算人改过。 */
function isManualPath(path: string, manualFields: readonly string[]): boolean {
  return manualFields.some((field) => {
    const normalized = field.trim()
    return (
      normalized.length > 0 &&
      (path === normalized || path.startsWith(`${normalized}.`))
    )
  })
}

/**
 * 对比两份草稿载荷，返回真正变化的字段。
 *
 * - 只比 §5.2 的业务区块；`review.acknowledgedWarnings` 由页面自己管理；
 * - 值没变的不返回（`[]` 表示 AI 没有带来任何变化）；
 * - `manualFields` 可选：传了就按路径（含父路径）标 `manual`，
 *   没传也能正常 diff，只是全部标 false。
 */
export function diffDraft(
  before: SupplementDraftPayload,
  after: SupplementDraftPayload,
  manualFields: readonly string[] = []
): SupplementDraftDiffRow[] {
  const rows: SupplementDraftDiffRow[] = []

  for (const section of DRAFT_DIFF_SECTIONS) {
    const beforeLeaves = new Map<string, unknown>()
    const afterLeaves = new Map<string, unknown>()
    flattenSection(before[section], section, beforeLeaves)
    flattenSection(after[section], section, afterLeaves)

    const paths = [...new Set([...beforeLeaves.keys(), ...afterLeaves.keys()])].sort()
    for (const path of paths) {
      const beforeValue = beforeLeaves.get(path)
      const afterValue = afterLeaves.get(path)
      if (isSameValue(beforeValue, afterValue)) continue
      rows.push({
        path,
        before: beforeValue,
        after: afterValue,
        manual: isManualPath(path, manualFields)
      })
    }
  }

  return rows
}

/**
 * 审核屏「写入后会写什么」的字段 → 生产落点表（spec §12 的关键行）。
 *
 * 这张表只用于展示与人工核对，不参与校验；真正的阻断/提醒由后端 validate 出。
 * 多落点的字段（每份量、营养素、标签分类标签）用 ` + ` 列出全部落点，
 * 避免人以为只写进一处。
 */
export const fieldMapRows: readonly SupplementDraftFieldMapRow[] = [
  {
    path: 'basic.name',
    label: '原料名称',
    target: 'ingredient.name',
    section: '商品与基本'
  },
  {
    path: 'basic.brand',
    label: '品牌',
    target: 'ingredient.brand',
    section: '商品与基本'
  },
  {
    path: 'basic.productModel',
    label: '产品规格',
    target: 'ingredient.product_model',
    section: '商品与基本'
  },
  {
    path: 'basic.purchaseChannel',
    label: '采购渠道',
    target: 'ingredient.purchase_channel',
    section: '商品与基本'
  },
  {
    path: 'basic.baseUnit',
    label: '基准单位',
    target: 'ingredient.base_unit',
    section: '商品与基本'
  },
  {
    path: 'basic.unitDisplayLabel',
    label: '展示单位',
    target: 'ingredient.unit_display_label',
    section: '商品与基本'
  },
  {
    path: 'basic.physicalForm',
    label: '物理形态',
    target: 'ingredient.physical_form',
    section: '商品与基本'
  },
  {
    path: 'basic.servingUnitsPerDose',
    label: '每份多少',
    target:
      'ingredient.properties.serving_units_per_dose + supplement_label_evidence.serving_units_per_dose',
    section: '商品与基本'
  },
  {
    path: 'basic.purchaseUnit',
    label: '采购单位',
    target: 'ingredient.purchase_unit',
    section: '商品与基本'
  },
  {
    path: 'basic.purchaseToBaseRatio',
    label: '换算倍数',
    target: 'ingredient.purchase_to_base_ratio',
    section: '商品与基本'
  },
  {
    path: 'basic.currentPricePerPurchaseUnit',
    label: '当前采购价',
    target: 'ingredient.current_price_per_purchase_unit',
    section: '商品与基本'
  },
  {
    path: 'basic.productionLossRate',
    label: '生产损耗率',
    target: 'ingredient.properties.production_loss_rate',
    section: '商品与基本'
  },
  {
    path: 'basic.addTiming',
    label: '添加时机',
    target: 'ingredient.properties.add_timing',
    section: '商品与基本'
  },
  {
    path: 'nutrition.servingNutrients',
    label: '每份含量',
    target: 'ingredient.nutrition_profile + nutrition_food.nutrition_data',
    section: '营养'
  },
  {
    path: 'nutrition.defaultTargetFields',
    label: '默认目标营养素',
    target: 'nutrition_food.default_supplement_targets',
    section: '营养'
  },
  {
    path: 'nutrition.labelText',
    label: '标签原文',
    target: 'supplement_label_evidence.label_text',
    section: '营养'
  },
  {
    path: 'label.labelCategory',
    label: '标签分类',
    target: 'ingredient.properties.label_category',
    section: '标签与合规'
  },
  {
    path: 'label.labelNames',
    label: '标签名称',
    target: 'ingredient.properties.label_names',
    section: '标签与合规'
  },
  {
    path: 'label.tagNames',
    label: '标签分类标签',
    target: 'ingredient.properties.tags + ingredient_tag_assignment',
    section: '标签与合规'
  },
  {
    path: 'label.labelNameSource',
    label: '标签名称依据',
    target: 'ingredient.properties.label_name_source',
    section: '标签与合规'
  },
  {
    path: 'retail.enabled',
    label: '是否上架',
    target: 'ingredient.supplement_retail_enabled',
    section: '上架与商城'
  },
  {
    path: 'retail.shelfLifeMonths',
    label: '原厂保质期（月）',
    target: 'ingredient.shelf_life_months',
    section: '上架与商城'
  },
  {
    path: 'retail.openedShelfLifeDays',
    label: '开盖后保质期（天）',
    target: 'ingredient.opened_shelf_life_days',
    section: '上架与商城'
  },
  {
    path: 'retail.storageCondition',
    label: '储存条件',
    target: 'ingredient.storage_condition',
    section: '上架与商城'
  },
  {
    path: 'retail.isOilBased',
    label: '内容物油性',
    target: 'ingredient.is_oil_based',
    section: '上架与商城'
  },
  {
    path: 'retail.noSaleReason',
    label: '不上架原因',
    target: 'ingredient.properties.no_sale_reason',
    section: '上架与商城'
  },
  {
    path: 'diy.enabled',
    label: '是否用于 DIY',
    target: 'ingredient.diy_enabled',
    section: 'DIY'
  },
  {
    path: 'diy.platform',
    label: '购买平台',
    target: 'ingredient.properties.purchase_link.platform',
    section: 'DIY'
  },
  {
    path: 'diy.linkUrl',
    label: '购买链接',
    target: 'ingredient.properties.purchase_link.url',
    section: 'DIY'
  },
  {
    path: 'diy.imageUrl',
    label: '商品图片',
    target: 'ingredient.properties.image_url',
    section: 'DIY'
  },
  {
    path: 'procurement.enabled',
    label: '是否用于生产/采购',
    target: 'ingredient.procurement_enabled',
    section: '采购与生产'
  },
  {
    path: 'equivalence.groupId',
    label: '归组/暂不归组',
    target: 'ingredient.equivalence_group_id',
    section: '等价组'
  },
  {
    path: 'equivalence.priority',
    label: '组内优先级',
    target: 'ingredient.equivalence_priority',
    section: '等价组'
  },
  {
    path: 'evidence.frontImageUrl',
    label: '商品正面图',
    target: 'supplement_label_evidence.front_image_url',
    section: '证据与来源'
  },
  {
    path: 'evidence.labelImageUrl',
    label: '标签图',
    target: 'supplement_label_evidence.label_image_url',
    section: '证据与来源'
  },
  {
    path: 'evidence.productUrl',
    label: '商品链接',
    target: 'supplement_label_evidence.product_url',
    section: '证据与来源'
  },
  {
    path: 'evidence.selectionNote',
    label: '选品依据',
    target: 'supplement_label_evidence.selection_snapshot',
    section: '证据与来源'
  }
]

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
import { supplementNutrientGroups } from '@/constants/supplementNutrients'

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

/** 枚举代码 → 中文。差异弹窗和审核屏不再把内部代码直接给人看。 */
const DRAFT_CODE_LABELS: Record<string, Record<string, string>> = {
  'basic.baseUnit': { PCS: '个（粒/片/胶囊）', G: '克', ML: '毫升' },
  'basic.physicalForm': {
    POWDER: '粉剂',
    TABLET: '片剂',
    CAPSULE: '胶囊',
    LIQUID: '液体'
  },
  'basic.addTiming': {
    BEFORE_MIXING: '制作中添加',
    BEFORE_MEAL: '随餐'
  },
  'label.labelCategory': {
    FEED_MATERIAL: '饲料原料',
    FEED_ADDITIVE: '饲料添加剂'
  },
  'diy.platform': {
    TAOBAO: '淘宝',
    JD: '京东',
    PINDUODUO: '拼多多',
    IHERB: 'iHerb',
    OTHER: '其他'
  },
  'retail.noSaleReason': {
    SELF_MADE: '自制原料',
    BULK: '散装采购',
    NO_SUPPLY: '暂无稳定货源',
    UNDECIDED: '待定'
  }
}

/** 布尔字段的两种说法；没登记的布尔默认「是/否」。 */
const DRAFT_BOOLEAN_LABELS: Record<string, [string, string]> = {
  'retail.enabled': ['上架', '不上架'],
  'retail.isOilBased': ['是', '否'],
  'diy.enabled': ['参与', '不参与'],
  'procurement.enabled': ['参与', '不参与'],
  'equivalence.reapproveGroup': ['本次一并审核', '不一并审核']
}

const NUTRIENT_SERVING_PREFIX = 'nutrition.servingNutrients.'
const NUTRIENT_BY_PATH = new Map(
  supplementNutrientGroups.flatMap((group) =>
    group.fields.map((field) => [field.fieldPath, field] as const)
  )
)

function nutrientLabel(fieldPath: string): string {
  return NUTRIENT_BY_PATH.get(fieldPath)?.label ?? fieldPath
}

/**
 * 差异弹窗/核验页的值展示。
 *
 * 后端存的是枚举代码和数字；直接 `String(value)` 会把 `BEFORE_MIXING`、
 * `G`、`POWDER` 这种内部值展示给用户。这里统一翻成人话，同时保留
 * 空值/缺失值的区别，避免「空」和「没有这个字段」混在一起。
 */
export function formatDraftFieldValue(path: string, value: unknown): string {
  if (value === undefined) return '（原草稿没有）'
  if (value === null) return '空'

  if (typeof value === 'boolean') {
    const labels = DRAFT_BOOLEAN_LABELS[path]
    if (labels) return value ? labels[0] : labels[1]
    return value ? '是' : '否'
  }

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return '空'
    if (path === 'equivalence.groupId') {
      return text === '__SKIP__' ? '暂不归组' : '已选等价组'
    }
    return DRAFT_CODE_LABELS[path]?.[text] ?? text
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '空'
    if (path === 'basic.currentPricePerPurchaseUnit') return `${value} 元`
    if (path === 'retail.shelfLifeMonths') return `${value} 个月`
    if (path === 'retail.openedShelfLifeDays') return `${value} 天`
    if (path === 'basic.productionLossRate') {
      const percent = Math.round((value - 1) * 100)
      return `${value}（${percent}% 损耗）`
    }
    if (path.startsWith(NUTRIENT_SERVING_PREFIX)) {
      const field = NUTRIENT_BY_PATH.get(path.slice(NUTRIENT_SERVING_PREFIX.length))
      if (field) return `${value} ${field.unit}`
    }
    return String(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '（空列表）'
    if (path === 'nutrition.defaultTargetFields') {
      return value.map((item) => (typeof item === 'string' ? nutrientLabel(item) : String(item))).join('、')
    }
    return value.map((item) => formatDraftFieldValue(path, item)).join('、')
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
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

/** 去空白、去重；保持人第一次改的顺序，便于 diff/调试时按操作顺序读。 */
export function mergeManualFields(
  ...lists: ReadonlyArray<readonly string[] | null | undefined>
): string[] {
  const result: string[] = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const field of list) {
      const normalized = typeof field === 'string' ? field.trim() : ''
      if (normalized && !result.includes(normalized)) {
        result.push(normalized)
      }
    }
  }
  return result
}

/**
 * 路径是否属于人改过的字段。
 *
 * 与后端 `isManualPath` 同一口径：精确命中，或记的是父路径（如整块
 * `nutrition.servingNutrients` 被锁）时子路径也算。
 */
export function isManualDraftPath(
  path: string,
  manualFields: readonly string[]
): boolean {
  return manualFields.some((field) => {
    const normalized = field.trim()
    return (
      normalized.length > 0 &&
      (path === normalized || path.startsWith(`${normalized}.`))
    )
  })
}

/**
 * 草稿路径读写。
 *
 * 营养素是**扁平键**（`servingNutrients['minerals.copper']`），不能按点号
 * 逐层拆；除此之外 payload 只有「区块.字段」一层，和 diff 的叶子路径一致。
 * 与后端 `applyAiFieldValue` 保持同一套路径语义。
 */
const NUTRIENT_SECTION_PREFIX = 'nutrition.servingNutrients.'

/** JSON 深拷贝：payload 只含可序列化值，避开结构化克隆对响应式代理的限制。 */
export function cloneDraftValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

/** 深拷贝整份草稿载荷。 */
export function cloneDraftPayload(
  payload: SupplementDraftPayload
): SupplementDraftPayload {
  return cloneDraftValue(payload)
}

/** 与 diff 同一口径的值比较（数字、数组、对象键序无关）。 */
export function isSameDraftValue(left: unknown, right: unknown): boolean {
  return isSameValue(left, right)
}

/** 读叶子路径的值；读不到返回 undefined。 */
export function readDraftPath(
  payload: SupplementDraftPayload,
  path: string
): unknown {
  if (path.startsWith(NUTRIENT_SECTION_PREFIX)) {
    const fieldPath = path.slice(NUTRIENT_SECTION_PREFIX.length)
    return fieldPath ? payload.nutrition.servingNutrients[fieldPath] : undefined
  }
  const dotIndex = path.indexOf('.')
  if (dotIndex <= 0) return undefined
  const section = path.slice(0, dotIndex) as keyof SupplementDraftPayload
  if (section === 'review') return undefined
  const key = path.slice(dotIndex + 1)
  const target = payload[section] as unknown as Record<string, unknown>
  if (!target || typeof target !== 'object' || !(key in target)) {
    return undefined
  }
  return target[key]
}

/** 写叶子路径；`undefined` 表示「原来没有这个字段」，直接删键。 */
export function writeDraftPath(
  payload: SupplementDraftPayload,
  path: string,
  value: unknown
): void {
  if (path.startsWith(NUTRIENT_SECTION_PREFIX)) {
    const fieldPath = path.slice(NUTRIENT_SECTION_PREFIX.length)
    if (!fieldPath) return
    if (value === undefined) {
      delete payload.nutrition.servingNutrients[fieldPath]
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      payload.nutrition.servingNutrients[fieldPath] = value
    }
    return
  }
  const dotIndex = path.indexOf('.')
  if (dotIndex <= 0) return
  const section = path.slice(0, dotIndex) as keyof SupplementDraftPayload
  if (section === 'review') return
  const key = path.slice(dotIndex + 1)
  const target = payload[section] as unknown as Record<string, unknown>
  if (!target || typeof target !== 'object') return
  if (value === undefined) {
    delete target[key]
  } else {
    target[key] = value
  }
}

/** AI diff 的选择结果：采用哪些路径，以及要回退并标记人改的路径。 */
export interface SupplementDraftAiApplyResult {
  /** 已按选择合并后的新载荷（以 AI 版本为底，未采用的路径回退成原值）。 */
  payload: SupplementDraftPayload
  /** 被回退的路径；调用方要逐条 `markManual`，防止 AI 下次再改。 */
  manualPaths: string[]
}

/**
 * 把「AI diff 弹窗的选择」落到载荷上。
 *
 * - `applyPaths` 里的非人改路径采用 AI 新值；
 * - 其余变化路径（含全部人改路径）一律回退成 `before` 的原值，并记进
 *   `manualPaths`——这就是「保留我的」。
 * - 人改路径即使被勾选也不会采用，避免绕过 `manualFields` 保护。
 */
export function applyDraftAiSelection(
  before: SupplementDraftPayload,
  after: SupplementDraftPayload,
  manualFields: readonly string[],
  applyPaths: readonly string[],
  /**
   * 当前本地载荷（默认用 after）。人改行必须保留这里的最新值，
   * 不能回退成 AI 起草前的 before——否则等于把 AI 期间的人改丢掉。
   */
  localPayload: SupplementDraftPayload = after
): SupplementDraftAiApplyResult {
  const selected = new Set(applyPaths)
  const payload = cloneDraftPayload(after)
  const manualPaths: string[] = []
  for (const row of diffDraft(before, after, manualFields)) {
    if (row.manual) {
      // 人改行：保留当前本地值，并继续锁进 manualFields。
      writeDraftPath(
        payload,
        row.path,
        cloneDraftValue(readDraftPath(localPayload, row.path))
      )
      if (!manualPaths.includes(row.path)) {
        manualPaths.push(row.path)
      }
      continue
    }
    if (selected.has(row.path)) continue
    // 非人改且未勾选：回退成原值，并标人改。
    writeDraftPath(
      payload,
      row.path,
      cloneDraftValue(readDraftPath(before, row.path))
    )
    if (!manualPaths.includes(row.path)) {
      manualPaths.push(row.path)
    }
  }
  return { payload, manualPaths }
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
        manual: isManualDraftPath(path, manualFields)
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

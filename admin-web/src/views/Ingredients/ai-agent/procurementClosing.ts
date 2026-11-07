/**
 * AI 建档收尾「补一条采购商品」（2026-11-07 成本口径归位）。
 *
 * 为什么要有这一步：食材的成本 = 每基准单位多少钱，而这个数只能由采购结算产生。
 * 没有采购商品 → 买不了 → 成本永远是 0 → 食谱里按「免费」算，售价跟着偏低。
 *
 * 这里只放纯判断，页面只负责把表单值喂进来、把结果发出去。
 */

export type ClosingState = 'MISSING_PRICE' | 'MISSING_UNIT' | 'READY'

export interface ClosingInput {
  pricePerPackage: number | null | undefined
  netContent: number | null | undefined
  /**
   * 采购单位（袋 / 盒 / 箱）。后端会拒空单位（没有单位就没法折算采购数量），
   * 所以这里也算一道：不然点下去才被拒。
   */
  purchaseUnit: string | null | undefined
}

/**
 * 这一屏本身就是「新建一条采购商品」，所以不判断「有没有商品」——
 * 只看这几格能不能算出每克成本、能不能折算采购数量。
 * 缺任一个都不能存：只填价不填净含量，系统没法把「一件 39.9 元」折成「每克多少钱」。
 */
export function computeClosingState(input: ClosingInput): ClosingState {
  const price = Number(input.pricePerPackage)
  const net = Number(input.netContent)
  if (!Number.isFinite(price) || price <= 0) {
    return 'MISSING_PRICE'
  }
  if (!Number.isFinite(net) || net <= 0) {
    return 'MISSING_PRICE'
  }
  if (!input.purchaseUnit || !input.purchaseUnit.trim()) {
    return 'MISSING_UNIT'
  }
  return 'READY'
}

export interface ClosingForm {
  name: string
  purchaseChannel: string
  purchaseUnit: string
  packCount: number
  netContentPerPack: number
  currentPurchasePrice: number | null
}

/**
 * 提交体：只发「人话」字段。
 * `purchaseToBaseRatio` 由服务端算（件数 × 净含量）—— 前端算错一次，库存就差几十倍。
 */
export function buildCreateSkuPayload(form: ClosingForm) {
  return {
    name: form.name.trim(),
    purchaseChannel: form.purchaseChannel,
    purchaseUnit: form.purchaseUnit,
    packCount: form.packCount,
    netContentPerPack: form.netContentPerPack,
    currentPurchasePrice: form.currentPurchasePrice,
  }
}

/** 输入框下方的实时换算：让「一件 39.9 元」立刻变成「一克 0.0798 元」 */
export function formatCostPreview(
  pricePerPackage: number | null | undefined,
  netContent: number | null | undefined,
  baseUnitLabel: string,
): string {
  const price = Number(pricePerPackage)
  const net = Number(netContent)
  if (!Number.isFinite(price) || price <= 0) return ''
  if (!Number.isFinite(net) || net <= 0) return ''
  return `≈ ¥${(price / net).toFixed(6)} / ${baseUnitLabel}`
}

/** 数字去掉浮点尾巴：1000 → "1000"，7920.0 → "7920"，0.50 → "0.5" */
function trimmedNumber(value: number): string {
  return String(Number(value.toFixed(6)))
}

/**
 * 换算倍率的人话版（2026-11-08）：`24 件 × 330 ml → 一箱 = 7920 ml`。
 *
 * 倍率本身由**服务端**算（件数 × 每件净含量），这里只是给它一个能目视核对的写法：
 * 人一眼能看出「一箱到底多少克」，倍率填错的代价是库存差几十倍。
 */
export function formatRatioText(
  packCount: number | null | undefined,
  netContent: number | null | undefined,
  baseUnitLabel: string,
  purchaseUnit?: string | null,
): string {
  const count = Number(packCount)
  const net = Number(netContent)
  if (!Number.isInteger(count) || count <= 0) return ''
  if (!Number.isFinite(net) || net <= 0) return ''

  const total = count * net
  const packLabel = (purchaseUnit ?? '').trim() || (count > 1 ? '箱' : '袋')
  return `${count} 件 × ${trimmedNumber(net)} ${baseUnitLabel} → 一${packLabel} = ${trimmedNumber(
    total,
  )} ${baseUnitLabel}`
}

/**
 * 后端「商品详情页截图识别」返回的草稿（字段口径与员工端完全一致）。
 *
 * 读不到的字段一律是 null，并进 `missing`；`confidence` 里是 `low` 的字段
 * 表示模型自己没把握（例如渠道是猜的），页面上要标出来让人核对。
 */
export interface RecognizedSkuDraft {
  name: string | null
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  purchaseUnit: string | null
  packCount: number | null
  netContentPerPack: number | null
  netContentUnitText: string | null
  unitPrice: number | null
  missing: string[]
  confidence: Record<string, 'high' | 'low'>
}

export type ClosingFieldKey =
  | 'name'
  | 'purchaseChannel'
  | 'purchaseUnit'
  | 'packCount'
  | 'netContentPerPack'
  | 'currentPurchasePrice'

export interface RecognizedApplyResult {
  form: {
    name: string
    purchaseChannel: string
    purchaseUnit: string
    packCount: number
    netContentPerPack: number | undefined
    currentPurchasePrice: number | undefined
  }
  /** 这一轮被 AI 填上的格子（页面上打「AI 识别」标记） */
  aiFilled: ClosingFieldKey[]
  /** 模型自己没把握的格子（标「AI 推测·可改」） */
  lowConfidence: string[]
  /** 还缺什么（原样来自后端，读不出的不编） */
  missing: string[]
}

/**
 * 把识别结果填进表单（2026-11-08）。
 *
 * 两条铁律：
 * ① **只填空格子** —— 人手打进去的价格、名字不许被 AI 盖掉；
 * ② **读不出的不填** —— 留空、进 `missing`，绝不编一个数（净含量错一次库存差几十倍）。
 *
 * 件数是个例外：它默认就是 1（大多数商品本来就按 1 件买），所以「还是 1」时允许被
 * AI 读到的多件覆盖（「24×330ml」这种）；人填过的非 1 值不覆盖。
 */
export function applyRecognizedDraft(
  form: {
    name: string
    purchaseChannel: string
    purchaseUnit: string
    packCount: number
    netContentPerPack: number | undefined
    currentPurchasePrice: number | undefined
  },
  draft: RecognizedSkuDraft,
): RecognizedApplyResult {
  const next = { ...form }
  const aiFilled: ClosingFieldKey[] = []

  const fillText = (
    key: 'name' | 'purchaseChannel' | 'purchaseUnit',
    value: string | null,
  ) => {
    const current = (next[key] ?? '').trim()
    const incoming = (value ?? '').trim()
    if (current || !incoming) return
    next[key] = incoming
    aiFilled.push(key)
  }

  fillText('name', draft.name)
  fillText('purchaseChannel', draft.purchaseChannel)
  fillText('purchaseUnit', draft.purchaseUnit)

  if (
    draft.packCount !== null &&
    Number.isInteger(draft.packCount) &&
    draft.packCount > 0 &&
    (next.packCount === 1 || !Number.isFinite(next.packCount))
  ) {
    next.packCount = draft.packCount
    aiFilled.push('packCount')
  }

  if (
    (next.netContentPerPack === undefined ||
      !Number.isFinite(Number(next.netContentPerPack))) &&
    draft.netContentPerPack !== null &&
    Number.isFinite(draft.netContentPerPack) &&
    draft.netContentPerPack > 0
  ) {
    next.netContentPerPack = draft.netContentPerPack
    aiFilled.push('netContentPerPack')
  }

  if (
    (next.currentPurchasePrice === undefined ||
      !Number.isFinite(Number(next.currentPurchasePrice))) &&
    draft.unitPrice !== null &&
    Number.isFinite(draft.unitPrice) &&
    draft.unitPrice > 0
  ) {
    next.currentPurchasePrice = draft.unitPrice
    aiFilled.push('currentPurchasePrice')
  }

  const lowConfidence = Object.keys(draft.confidence ?? {}).filter(
    (key) => draft.confidence[key] === 'low',
  )

  return {
    form: next,
    aiFilled,
    lowConfidence,
    missing: Array.isArray(draft.missing) ? [...draft.missing] : [],
  }
}

/** 原样带进授权请求：渠道与识别用的截图（2026-11-08）。 */
export function buildClosingSkuInput(form: {
  name: string
  purchaseChannel: string
  purchaseUnit: string
  packCount: number
  netContentPerPack: number | undefined
  currentPurchasePrice: number | undefined
  sourceScreenshotUrl?: string | null
}) {
  return {
    name: form.name.trim() || undefined,
    purchaseChannel: form.purchaseChannel.trim() || undefined,
    purchaseUnit: form.purchaseUnit,
    packCount: form.packCount,
    netContentPerPack: form.netContentPerPack ?? 0,
    currentPurchasePrice: form.currentPurchasePrice ?? 0,
    sourceScreenshotUrl: form.sourceScreenshotUrl ?? undefined,
  }
}

/**
 * 「这条原料的采购商品」板块什么时候出现（2026-11-08 老板定）。
 *
 * 规则：原料卡写全（有基准单位）+ 两页核验都通过。
 * 为什么这么严：截图识别要按基准单位归一净含量、倍率要按「件数 × 每件净含量」算；
 * 原料档案还没定，先让人填采购商品就是让他填一个算不出来的东西。
 * 改了原料 → 报告变旧 → `checksReady` 变 false → 板块自己收起，重跑核验再出现。
 */
export function shouldShowProcurementCard(input: {
  line: string
  hasDraft: boolean
  hasIngredientBaseUnit: boolean
  checksReady: boolean
}): boolean {
  if (input.line !== 'FOOD') return false
  if (!input.hasDraft) return false
  if (!input.hasIngredientBaseUnit) return false
  return input.checksReady
}

/**
 * 补剂下单页的"算价状态机"。
 *
 * 为什么要抽出来：这一页最容易出事的地方全是状态，不是画面 ——
 *   · 改完套数、算价还没回来就点提交（页面显示旧金额，实际按新套数扣款）
 *   · 连续快速改勾选，先发的响应后到，把金额覆盖成上一次选择的结果
 *   · 算价失败后界面停在"新选择 + 旧金额"，顾客照着下单
 *
 * 规则只有三条：
 *   1. `summary` 只在**服务端确认成功**后替换；
 *   2. 任何本地改动在服务端确认前都算"待确认"，此时 `isAmountReady` 为 false；
 *   3. 失败一律回滚到上一次确认成功的状态（勾选 + 套数一起回滚）。
 *
 * 页面只负责渲染与转发事件，不碰这里的状态迁移。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  SupplementQuote,
  SupplementQuoteLineInput,
  SupplementQuoteResponse,
  SupplementUnavailableLine
} from '../api/supplements'

export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** 从制作单/复购草稿带进来的初始行：有 recipeItemId 就由服务端算量，否则用 amount */
export interface SeedLine {
  ingredientId: string
  recipeItemId?: string
  amount?: number
  name?: string
  unit?: string
  specText?: string
}

export interface QuoteLineState extends SeedLine {
  /** 整单用量（服务端按制作单算） */
  amount: number
  /** 每袋分装量（服务端取整后） */
  packedAmount: number
  unavailableReason?: string
}

export interface QuoteFnInput extends Array<SupplementQuoteLineInput> {}

export type QuoteFn = (
  lines: SupplementQuoteLineInput[],
  options: { portionMultiplier?: number; diySheetId?: string }
) => Promise<{
  code: number
  data: Pick<
    SupplementQuoteResponse,
    | 'quote'
    | 'unavailable'
    | 'enabled'
    | 'minOrderAmount'
    | 'paymentTimeoutMinutes'
    | 'bulkBagThreshold'
  >
}>

export interface UseSupplementQuoteOptions {
  quote: QuoteFn
  diySheetId?: () => string | undefined
  initialPortionMultiplier?: number
}

export interface UseSupplementQuoteReturn {
  lines: Ref<QuoteLineState[]>
  selectedIds: Ref<string[]>
  selectableLines: ComputedRef<QuoteLineState[]>
  selectedLines: ComputedRef<QuoteLineState[]>
  allSelectableSelected: ComputedRef<boolean>
  portionMultiplier: Ref<number>
  summary: Ref<SupplementQuote | null>
  unavailable: Ref<SupplementUnavailableLine[]>
  status: Ref<QuoteStatus>
  errorMessage: Ref<string>
  enabled: Ref<boolean>
  minOrderAmount: Ref<number>
  paymentTimeoutMinutes: Ref<number>
  bulkBagThreshold: Ref<number>
  bagCount: ComputedRef<number>
  isAmountReady: ComputedRef<boolean>
  canSubmit: ComputedRef<boolean>
  load: (seed: SeedLine[]) => Promise<void>
  toggleLine: (ingredientId: string) => Promise<void>
  toggleAll: () => Promise<void>
  setPortion: (next: number) => Promise<void>
  retry: () => Promise<void>
}

const MIN_PORTION = 1
const MAX_PORTION = 99

export function useSupplementQuote(
  options: UseSupplementQuoteOptions
): UseSupplementQuoteReturn {
  const lines = ref<QuoteLineState[]>([])
  const selectedIds = ref<string[]>([])
  const portionMultiplier = ref<number>(
    clampPortion(options.initialPortionMultiplier ?? 1)
  )
  const summary = ref<SupplementQuote | null>(null)
  const unavailable = ref<SupplementUnavailableLine[]>([])
  const status = ref<QuoteStatus>('idle')
  const errorMessage = ref('')
  const enabled = ref(true)
  const minOrderAmount = ref(0)
  const paymentTimeoutMinutes = ref(30)
  const bulkBagThreshold = ref(60)

  /** 递增序号：只采纳最新一次请求的结果 */
  let seq = 0
  /** 上一次**服务端确认成功**的状态，失败时回滚到这里 */
  let confirmedIds: string[] = []
  let confirmedPortion = portionMultiplier.value

  const selectableLines = computed(() =>
    lines.value.filter((line) => !line.unavailableReason)
  )

  const selectedLines = computed(() =>
    selectableLines.value.filter((line) => selectedIds.value.includes(line.ingredientId))
  )

  const allSelectableSelected = computed(
    () =>
      selectableLines.value.length > 0 &&
      selectableLines.value.every((line) => selectedIds.value.includes(line.ingredientId))
  )

  const bagCount = computed(() => summary.value?.bagCount ?? 0)

  const isAmountReady = computed(
    () => status.value === 'ready' && summary.value !== null
  )

  const canSubmit = computed(() => isAmountReady.value && selectedLines.value.length > 0)

  function buildPayload(ids: string[]): SupplementQuoteLineInput[] {
    const payload: SupplementQuoteLineInput[] = []
    for (const id of ids) {
      const line = lines.value.find((item) => item.ingredientId === id)
      if (!line) continue
      payload.push(
        line.recipeItemId
          ? { ingredientId: id, recipeItemId: line.recipeItemId }
          : { ingredientId: id, amount: line.amount }
      )
    }
    return payload
  }

  async function requestQuote(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      // 一种都没选：没有可算的金额，直接进"未就绪"，但不报错
      seq += 1
      summary.value = null
      unavailable.value = []
      status.value = 'idle'
      errorMessage.value = ''
      confirmedIds = []
      confirmedPortion = portionMultiplier.value
      return
    }

    const mine = ++seq
    status.value = 'loading'
    errorMessage.value = ''

    try {
      const res = await options.quote(buildPayload(ids), {
        portionMultiplier: portionMultiplier.value,
        diySheetId: options.diySheetId?.()
      })

      if (mine !== seq) return

      const quote = res.data.quote
      const reasonById = new Map(
        (res.data.unavailable ?? []).map((item) => [item.ingredientId, item.reason])
      )
      const quoteById = new Map(quote.lines.map((item) => [item.ingredientId, item]))

      lines.value = lines.value.map((line) => {
        const quoted = quoteById.get(line.ingredientId)
        if (quoted) {
          return {
            ...line,
            name: quoted.name || line.name,
            unit: quoted.unit || line.unit,
            amount: quoted.requestedAmount,
            packedAmount: quoted.packedAmount,
            unavailableReason: undefined
          }
        }
        const reason = reasonById.get(line.ingredientId)
        return reason ? { ...line, unavailableReason: reason } : line
      })

      summary.value = quote
      unavailable.value = res.data.unavailable ?? []
      enabled.value = res.data.enabled !== false
      minOrderAmount.value = Number(res.data.minOrderAmount ?? 0)
      paymentTimeoutMinutes.value = Number(res.data.paymentTimeoutMinutes ?? 0)
      bulkBagThreshold.value = Number(res.data.bulkBagThreshold ?? 0)

      // 勾选要跟着"现在还能不能买"收口：不可购买的不许留在选中态
      const selectableIds = new Set(
        lines.value.filter((line) => !line.unavailableReason).map((line) => line.ingredientId)
      )
      selectedIds.value = selectedIds.value.filter((id) => selectableIds.has(id))

      status.value = 'ready'
      confirmedIds = [...selectedIds.value]
      confirmedPortion = portionMultiplier.value
    } catch (error) {
      if (mine !== seq) return
      selectedIds.value = [...confirmedIds]
      portionMultiplier.value = confirmedPortion
      status.value = 'failed'
      errorMessage.value = readErrorMessage(error)
    }
  }

  async function load(seed: SeedLine[]): Promise<void> {
    lines.value = seed.map((line) => ({
      ...line,
      name: line.name || '补剂',
      unit: line.unit || '',
      amount: Number(line.amount) || 0,
      packedAmount: 0
    }))
    selectedIds.value = seed.map((line) => line.ingredientId)
    await requestQuote(selectedIds.value)
  }

  async function toggleLine(ingredientId: string): Promise<void> {
    const line = lines.value.find((item) => item.ingredientId === ingredientId)
    if (!line || line.unavailableReason) return
    selectedIds.value = selectedIds.value.includes(ingredientId)
      ? selectedIds.value.filter((id) => id !== ingredientId)
      : [...selectedIds.value, ingredientId]
    await requestQuote(selectedIds.value)
  }

  async function toggleAll(): Promise<void> {
    selectedIds.value = allSelectableSelected.value
      ? []
      : selectableLines.value.map((line) => line.ingredientId)
    await requestQuote(selectedIds.value)
  }

  async function setPortion(next: number): Promise<void> {
    const target = clampPortion(next)
    if (target === portionMultiplier.value) return
    portionMultiplier.value = target
    await requestQuote(selectedIds.value)
  }

  async function retry(): Promise<void> {
    await requestQuote(selectedIds.value)
  }

  return {
    lines,
    selectedIds,
    selectableLines,
    selectedLines,
    allSelectableSelected,
    portionMultiplier,
    summary,
    unavailable,
    status,
    errorMessage,
    enabled,
    minOrderAmount,
    paymentTimeoutMinutes,
    bulkBagThreshold,
    bagCount,
    isAmountReady,
    canSubmit,
    load,
    toggleLine,
    toggleAll,
    setPortion,
    retry
  }
}

function clampPortion(value: number): number {
  const num = Math.floor(Number(value))
  if (!Number.isFinite(num)) return MIN_PORTION
  return Math.min(MAX_PORTION, Math.max(MIN_PORTION, num))
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '价格没算出来，请重试'
}

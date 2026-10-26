/**
 * 核验报告与授权闸门的纯函数。
 *
 * 页面（`index.vue`）只做「调接口 + 把状态摆到 ref 里」，所有判定、
 * 文案与人话原因都放在这里，方便单测，也避免模板里塞一长串条件。
 *
 * 三条口径：
 * - `fresh` 由 `GET drafts/:id/checks` 给出，不在前端重算草稿哈希；
 * - `blocking` 一项都不放过，`exceptionable` 必须有登记过的例外才算数；
 * - 原因按「原料档案 → 营养档案」固定顺序产出，页面只展示第一条。
 */
import type {
  AuthorizeBlockedReason,
  AuthorizeBlockedReasonCode,
  CheckDomain,
  CheckItem,
  CheckRunView,
  ExceptionRecord
} from '@/types/ingredientCreation'

/** 两页的固定称呼：原因文案与弹窗标题共用，避免一处写「原料卡」一处写「原料档案」。 */
const DOMAIN_LABELS: Record<CheckDomain, string> = {
  INGREDIENT: '原料档案',
  NUTRITION: '营养档案'
}

const CHECK_STATES: Record<
  'blocking' | 'exceptionable' | 'warning',
  { label: string; type: 'danger' | 'warning' | 'info' }
> = {
  blocking: { label: '阻断', type: 'danger' },
  exceptionable: { label: '不合格（可例外）', type: 'warning' },
  warning: { label: '提醒', type: 'info' }
}

const VALID_DOMAINS: readonly CheckDomain[] = ['INGREDIENT', 'NUTRITION']

/** 一页报告的摘要：计数给闸门用，明细给弹窗用。 */
export interface CheckRunSummary {
  domain: CheckDomain
  fresh: boolean
  blocking: number
  exceptionable: number
  warning: number
  checkedAt: string | null
  rulesVersion: string | null
  blockingItems: CheckItem[]
  exceptionableItems: CheckItem[]
  warningItems: CheckItem[]
}

export interface GateInput {
  /** 没有报告时传 null，闸门据此写「还没核验」。 */
  ingredient: CheckRunSummary | null
  nutrition: CheckRunSummary | null
  /** `payload.verify.exceptions`；裸 code 字符串也接受，方便页面只传 code。 */
  exceptions?: readonly (ExceptionRecord | string)[]
  /** 保存队列还没跑完：按钮也要置灰，避免授权到一半的草稿。 */
  saving?: boolean
}

export interface GateState {
  ready: boolean
  /** 至少一条；`ready` 为 true 时为空数组。页面只展示第一条。 */
  reasons: string[]
}

export interface LocateTarget {
  tab: 'ingredient' | 'profiles'
  /** 原料卡是高亮用的 `data-field-key`；营养档案是 `row.fieldPath`。 */
  key: string
  fieldPath: string
}

export interface CheckReportSection {
  key: 'blocking' | 'exceptionable' | 'warning'
  label: string
  type: 'danger' | 'warning' | 'info'
  items: CheckItem[]
}

export interface CheckRunCountsView {
  blocking: number
  exceptionable: number
  warning: number
  total: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCheckDomain(value: unknown): value is CheckDomain {
  return (
    typeof value === 'string' &&
    (VALID_DOMAINS as readonly string[]).includes(value)
  )
}

/**
 * 报告里的明细数组可能会是脏数据（历史数据 / 后端升级中）；
 * 只保留还像一条 `CheckItem` 的项，其它一律当空，页面不渲染 undefined。
 */
function readItems(value: unknown): CheckItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  const items: CheckItem[] = []
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.code !== 'string') {
      continue
    }
    const message = typeof raw.message === 'string' ? raw.message : ''
    const item: CheckItem = { code: raw.code, message }
    if (typeof raw.fieldPath === 'string' && raw.fieldPath.trim()) {
      item.fieldPath = raw.fieldPath.trim()
    }
    if (typeof raw.suggestion === 'string' && raw.suggestion.trim()) {
      item.suggestion = raw.suggestion
    }
    items.push(item)
  }
  return items
}

function readCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

/** 两页的称呼（弹窗标题、原因都从这里取）。 */
export function checkDomainLabel(domain: CheckDomain): string {
  return DOMAIN_LABELS[domain] ?? DOMAIN_LABELS.INGREDIENT
}

/**
 * 报告 → 摘要。
 *
 * `run` 为空时返回 null（没有报告就没有 domain 可归），页面据此显示
 * 「还没核验」；`fresh` 必须由调用方从 `GET /checks` 传进来，前端不重算哈希。
 */
export function toCheckRunSummary(
  run: CheckRunView | null | undefined,
  fresh: boolean
): CheckRunSummary | null {
  if (!run) {
    return null
  }

  const result: unknown = run.result
  const blockingItems = isRecord(result)
    ? readItems(result.blocking)
    : []
  const exceptionableItems = isRecord(result)
    ? readItems(result.exceptionable)
    : []
  const warningItems = isRecord(result) ? readItems(result.warnings) : []
  const counts: unknown = run.counts

  return {
    domain: isCheckDomain(run.domain) ? run.domain : 'INGREDIENT',
    fresh: fresh === true,
    blocking: isRecord(counts)
      ? readCount(counts.blocking, blockingItems.length)
      : blockingItems.length,
    exceptionable: isRecord(counts)
      ? readCount(counts.exceptionable, exceptionableItems.length)
      : exceptionableItems.length,
    warning: isRecord(counts)
      ? readCount(counts.warning, warningItems.length)
      : warningItems.length,
    checkedAt: typeof run.createdAt === 'string' ? run.createdAt : null,
    rulesVersion:
      typeof run.rulesVersion === 'string' ? run.rulesVersion : null,
    blockingItems,
    exceptionableItems,
    warningItems
  }
}

/** 例外 code 集合：占位/空白记录不算数。 */
function toExceptionCodes(
  exceptions: readonly (ExceptionRecord | string)[] | undefined
): Set<string> {
  const codes = new Set<string>()
  for (const record of exceptions ?? []) {
    const code =
      typeof record === 'string'
        ? record
        : isRecord(record) && typeof record.code === 'string'
          ? record.code
          : ''
    if (code.trim()) {
      codes.add(code.trim())
    }
  }
  return codes
}

/**
 * 授权闸门（设计 §6.4）：
 * - 两页都有报告且是对当前草稿的（fresh）；
 * - 两页都没有阻断项；
 * - 两页所有 exceptionable 都被 `verify.exceptions` 按 code 覆盖；
 * - 保存队列空了（`saving = false`）。
 *
 * 不满足时按固定顺序给出人话原因：先原料档案、再营养档案，
 * 每页按「没核验 → 过期 → 阻断 → 未登记例外」排。
 */
export function gateState(input: GateInput): GateState {
  const reasons: string[] = []
  const approvedCodes = toExceptionCodes(input.exceptions)

  const pages: Array<[CheckRunSummary | null, string]> = [
    [input.ingredient, DOMAIN_LABELS.INGREDIENT],
    [input.nutrition, DOMAIN_LABELS.NUTRITION]
  ]

  for (const [summary, label] of pages) {
    if (!summary) {
      reasons.push(`${label}还没有核验报告，先点「核验此页」跑一次。`)
      continue
    }

    if (!summary.fresh) {
      reasons.push(
        `${label}的核验报告已过期（核验之后又改过草稿），重跑核验才能授权。`
      )
      continue
    }

    // 摘要可能只带计数（例如只从报告计数构造），明细数组缺失时按空处理，
    // 不能因为字段没给就抛错或默认放行。
    const blockingItems = Array.isArray(summary.blockingItems)
      ? summary.blockingItems
      : []
    const exceptionableItems = Array.isArray(summary.exceptionableItems)
      ? summary.exceptionableItems
      : []
    const blocking = readCount(summary.blocking, blockingItems.length)
    const exceptionable = readCount(
      summary.exceptionable,
      exceptionableItems.length
    )

    if (blocking > 0) {
      reasons.push(`${label}还有 ${blocking} 项阻断，先按报告改完再授权。`)
    }

    const codes = [
      ...new Set(
        exceptionableItems
          .map((item) => (typeof item?.code === 'string' ? item.code.trim() : ''))
          .filter(Boolean)
      )
    ]
    const uncovered = codes.filter((code) => !approvedCodes.has(code))

    if (uncovered.length > 0) {
      reasons.push(
        `${label}的 ${uncovered.join('、')} 还没登记例外，先修复或点「登记例外」。`
      )
    } else if (exceptionable > codes.length) {
      // 明细里没有 code 可查（或计数与明细对不上）时不能放行：
      // 授权只认「每一项都有 code 且被例外覆盖」，绝不按计数猜通过。
      const missing = exceptionable - codes.length
      reasons.push(
        `${label}还有 ${missing} 项不合格没登记例外，先修复或逐项登记。`
      )
    }
  }

  if (input.saving) {
    reasons.push('正在保存草稿，保存完再授权。')
  }

  return { ready: reasons.length === 0, reasons }
}

/**
 * 从 400 的 axios 错误里提取 `reasons`。
 *
 * 后端拒绝授权时 body 形如 `{ message, reasons: [...] }`；拦截器已经用
 * `message` 弹过一次提示，页面只要读 reasons 列明细，**不能再弹一次**。
 * 任何形状不符的输入都返回空数组，调用方据此退回普通错误处理。
 */
export function toAuthorizeReasons(errorLike: unknown): AuthorizeBlockedReason[] {
  if (!isRecord(errorLike)) {
    return []
  }

  const response = errorLike.response
  const data = isRecord(response) ? response.data : undefined
  const source = isRecord(data) ? data : errorLike
  const rawReasons = source.reasons

  if (!Array.isArray(rawReasons)) {
    return []
  }

  const reasons: AuthorizeBlockedReason[] = []
  for (const raw of rawReasons) {
    if (!isRecord(raw) || typeof raw.code !== 'string' || !raw.code.trim()) {
      continue
    }

    const reason: AuthorizeBlockedReason = {
      code: raw.code as AuthorizeBlockedReasonCode,
      detail: typeof raw.detail === 'string' ? raw.detail : ''
    }
    if (isCheckDomain(raw.domain)) {
      reason.domain = raw.domain
    }
    reasons.push(reason)
  }

  return reasons
}

/**
 * 定位目标：原料卡的 `fieldPath` 是 `ingredient.<key>`，营养档案直接是行键。
 *
 * 返回 null 表示这条问题没有可定位的格子（例如整份档案缺失），页面
 * 只切页签、不随便高亮一格。
 */
export function toLocateTarget(item: CheckItem | null | undefined): LocateTarget | null {
  const fieldPath =
    typeof item?.fieldPath === 'string' ? item.fieldPath.trim() : ''
  if (!fieldPath) {
    return null
  }

  const INGREDIENT_PREFIX = 'ingredient.'
  if (fieldPath.startsWith(INGREDIENT_PREFIX)) {
    const key = fieldPath.slice(INGREDIENT_PREFIX.length)
    if (!key) {
      return null
    }
    return { tab: 'ingredient', key, fieldPath }
  }

  return { tab: 'profiles', key: fieldPath, fieldPath }
}

/** 弹窗用的三档分区：顺序与标签固定，空档也保留。 */
export function toCheckReportSections(
  run: CheckRunView | null | undefined
): CheckReportSection[] {
  const result: unknown = run?.result
  const read = (key: 'blocking' | 'exceptionable' | 'warnings') =>
    isRecord(result) ? readItems(result[key]) : []

  return [
    { key: 'blocking', ...CHECK_STATES.blocking, items: read('blocking') },
    {
      key: 'exceptionable',
      ...CHECK_STATES.exceptionable,
      items: read('exceptionable')
    },
    { key: 'warning', ...CHECK_STATES.warning, items: read('warnings') }
  ] as CheckReportSection[]
}

/** 三档计数（`run.counts` 优先，缺了按明细数组兜底）。 */
export function checkRunCounts(
  run: CheckRunView | null | undefined
): CheckRunCountsView {
  const summary = toCheckRunSummary(run, true)
  if (!summary) {
    return { blocking: 0, exceptionable: 0, warning: 0, total: 0 }
  }

  return {
    blocking: summary.blocking,
    exceptionable: summary.exceptionable,
    warning: summary.warning,
    total: summary.blocking + summary.exceptionable + summary.warning
  }
}

/** 报告时间：非法或缺失显示「—」，不把 Invalid Date 端给人看。 */
export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

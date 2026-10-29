/**
 * AI 添加原料的流式协议（SSE）解析与状态归并。
 *
 * 页面用 `streamIngredientAgent` 直接读 `ReadableStream`：后端每开始 / 结束一次
 * 工具调用就推一条事件，`parseSseChunk` 处理分片，`reduceAgentEvents` 把事件
 * 归并成可渲染的状态。三个函数都是纯的（只有 stream 会发请求），方便测试。
 */
import type { IngredientLine } from './lineEntry'
import {
  aiVerdictLabel,
  aiVerdictTagType,
  isAiVerdict,
  toolLabel,
  toRecordEvidenceFromEvent,
  toSearchEvidenceFromEvent,
  type AgentAiVerdict,
  type AgentAiVerdictTagType,
  type AgentRecordEvidenceView,
  type AgentSearchEvidenceView
} from './stepView'

/** AI 读词条名判出的生熟 / 做法 / 部位（后端 step_end.matches 的精简结构）。 */
export interface AgentStreamClassification {
  state: string
  method: string
  cutLabel: string | null
  cutGroup: string | null
  evidence: string | null
}

/** 查库命中的一条词条（后端 step_end.matches 的精简结构）。 */
export interface AgentStreamMatch {
  name: string
  matchedBy: string
  matchedKeyword: string
  score: number | null
  /** 服务端 AI 复核判断；旧后端没有这个字段。 */
  review?: {
    verdict: AgentAiVerdict
    reason: string
  }
  /** AI 分类标签与依据词；旧后端没有这个字段。 */
  classification?: AgentStreamClassification
}

/** 读来源记录的步骤摘要（后端 step_end.record）。 */
export interface AgentStreamRecord {
  name: string
  sourceType: string | null
  coverage: number | null
  valueCount: number
}

/** 查库分组概览（后端 step_end.groups 的精简结构）。 */
export interface AgentStreamGroup {
  key: string
  label: string
  count: number
  states: string[]
}

/** 查库复核概要：页面用 relevantCount 写「11 条相关」。 */
export interface AgentStreamReviewSummary {
  relevantCount: number
  uncertainCount?: number
  irrelevantCount?: number
  failed?: boolean
}

/** AI 停下来问人的问题；`options` 是可直接点选的答案。 */
export interface AgentPendingQuestionOption {
  label: string
  /** 分组 / 生熟 / 自由输入兜底；普通候选与普通问题没有这个字段。 */
  kind?: 'GROUP' | 'STATE' | 'FREE'
  /** true=库里已收录；false=未收录；null=核实失败 / 超时，状态未知 */
  inLibrary: boolean | null
  /** 命中时的库内词条名；未命中 / 未知时为 null */
  matchedName: string | null
  /** 页面展示文案（未收录时后端会带「会去线上找」的后缀） */
  displayLabel: string
  /** 候选名（从 `候选名 —— 相关：理由` 里拆出）；普通问题没有 */
  candidateLabel?: string
  /** AI 复核对这条选项的判断；没有判断时为 null / 缺失 */
  aiVerdict?: AgentAiVerdict | null
  /** AI 复核的一句理由（≤40 字） */
  aiReason?: string | null
  /** AI 读词条名判出的生熟 / 做法 / 部位 + 依据词；普通问题没有 */
  classification?: AgentStreamClassification
}

/** ask 选项上的 AI 判断小标；没有判断时返回 null。 */
export interface AgentAskOptionAiBadge {
  label: string
  type: AgentAiVerdictTagType
  reason: string
}

export function askOptionAiBadge(
  option: AgentPendingQuestionOption | null | undefined
): AgentAskOptionAiBadge | null {
  if (!option || !isAiVerdict(option.aiVerdict)) {
    return null
  }
  return {
    label: aiVerdictLabel(option.aiVerdict),
    type: aiVerdictTagType(option.aiVerdict),
    reason: (option.aiReason ?? '').trim()
  }
}

/**
 * 选项按钮的悬停标题：完整展示被单行省略截掉的文案。
 *
 * 选项允许 120 字，按钮里单行省略才不会撑破面板；完整文案（含候选全称）
 * 放在 title 里，悬停即可看全。命中库内词条且与展示文案不同时补一行全称。
 */
export function askOptionTitle(
  displayLabel: string,
  matchedName: string | null
): string {
  const text = displayLabel.trim()
  const name = (matchedName ?? '').trim()
  if (!text) {
    return name ? `库里词条：${name}` : ''
  }
  if (name && name !== text && !text.includes(name)) {
    return `${text}\n库里词条：${name}`
  }
  return text
}

/** 从 `候选名 —— 相关：理由` 里拆出候选名与 AI 判断。 */
export function splitAskOptionLabel(label: string): {
  candidateLabel: string
  aiVerdict: AgentAiVerdict | null
  aiReason: string
} {
  const text = label.trim()
  const match = text.match(
    /^(.*?)\s*(?:——|—{1,2}|--)\s*(不相关|存疑|相关)\s*[:：]\s*(.*)$/u
  )
  if (!match) {
    return { candidateLabel: text, aiVerdict: null, aiReason: '' }
  }
  const verdictText = match[2] ?? ''
  const aiVerdict: AgentAiVerdict | null =
    verdictText === '不相关'
      ? 'IRRELEVANT'
      : verdictText === '存疑'
        ? 'UNCERTAIN'
        : 'RELEVANT'
  return {
    candidateLabel: (match[1] ?? '').trim() || text,
    aiVerdict,
    aiReason: (match[3] ?? '').replace(/\s+/g, ' ').trim()
  }
}

export interface AgentPendingQuestion {
  question: string
  options: string[]
  /** 与 options 同序的库内核实结果；旧草稿可能没有。 */
  optionChecks?: AgentPendingQuestionOption[]
}

export type AgentStreamEvent =
  | {
      type: 'step_start'
      index: number
      name: string
      summary: string
    }
  | {
      type: 'step_end'
      index: number
      ok: boolean
      found?: boolean
      resultSummary: string
      error?: string
      /** 查库：本次实际用过的关键词。 */
      keywords?: string[]
      /** 查库：候选总数（页面用于提示还有多少条没展示）。 */
      candidateCount?: number
      /** 查库：截断前的候选总数。 */
      totalCandidates?: number
      /** 查库：部位分组概览。 */
      groups?: AgentStreamGroup[]
      /** 查库：AI 复核概要。 */
      reviewSummary?: AgentStreamReviewSummary
      /** 查库：最多 5 条匹配依据。 */
      matches?: AgentStreamMatch[]
      /** 读来源记录：词条名 / 覆盖率 / 读到多少项。 */
      record?: AgentStreamRecord
      /** 本次工具耗时；展开步骤时显示。 */
      durationMs?: number
    }
  | {
      type: 'reply'
      reply: string
      draftId: string
      steps: number
      toolCallCount: number
      /** 本轮运行报告；旧后端没有。 */
      report?: AgentRunReport
    }
  /**
   * AI 先问人：页面渲染提问气泡 + 可点选项；点击等于用同一个 draftId
   * 把选项文本发出去。`ask` 后面紧接 `done`，没有 `reply`。
   */
  | {
      type: 'ask'
      question: string
      options: string[]
      /** 每个选项的库内核实结果，与 options 同序。 */
      optionChecks?: AgentPendingQuestionOption[]
      draftId?: string
      /** 问人也是本轮正常结束：报告一并带回。 */
      report?: AgentRunReport
    }
  | { type: 'done'; report?: AgentRunReport }
  | { type: 'error'; message: string; report?: AgentRunReport }

/** 页面上的一步：开始即「执行中」，结束改成成功 / 失败。 */
export interface AgentStreamStep {
  index: number
  name: string
  label: string
  summary: string
  status: 'running' | 'success' | 'failed'
  ok: boolean | null
  found?: boolean
  resultSummary?: string
  error?: string
  /** 查库步骤的展开数据：关键词 / 词条 / 匹配方式 / 分数 */
  search?: AgentSearchEvidenceView
  /** 读来源记录步骤的展开摘要 */
  record?: AgentRecordEvidenceView
  /** 本次工具耗时；报告摘要与展开列表都用它。 */
  durationMs?: number
}

/** 本轮运行结果分类（后端 AgentRunReport.result）。 */
export type AgentRunOutcome = 'FINISHED' | 'TIMEOUT' | 'NO_PROGRESS' | 'ERROR'

/** 运行报告里的一条失败工具记录。 */
export interface AgentRunReportFailedTool {
  name: string
  error: string
}

/**
 * 每轮 run 结束返回的运行报告。
 *
 * 只做展示与排查：页面在「已执行 N 步」后显示工具数 / 耗时 / token，
 * 展开后能看到每个工具的耗时和失败原因。
 */
export interface AgentRunReport {
  runId: string
  draftId: string
  text: string
  steps: number
  toolCalls: number
  tokensIn: number
  tokensOut: number
  durationMs: number
  stopReason: string | null
  tools: string[]
  failedTools: AgentRunReportFailedTool[]
  result: AgentRunOutcome
}

export interface AgentStreamMeta {
  steps: number
  toolCallCount: number
}

export interface AgentStreamState {
  steps: AgentStreamStep[]
  reply: string | null
  draftId: string | null
  meta: AgentStreamMeta | null
  error: string | null
  done: boolean
  /** 当前在等用户回答的问题；没有时为 null。 */
  pendingQuestion: AgentPendingQuestion | null
  /** 本轮运行报告；旧后端没有时为 null。 */
  report: AgentRunReport | null
}

export function createAgentStreamState(): AgentStreamState {
  return {
    steps: [],
    reply: null,
    draftId: null,
    meta: null,
    error: null,
    done: false,
    pendingQuestion: null,
    report: null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null
}

function readNonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 自由输入兜底选项的固定文案；旧草稿没有 kind 时靠它识别。 */
const FREE_OPTION_LABEL = '都不对，我直接说'

function readOptionKind(
  raw: Record<string, unknown> | null,
  label: string
): AgentPendingQuestionOption['kind'] {
  const kind = raw?.kind
  if (kind === 'GROUP' || kind === 'STATE' || kind === 'FREE') {
    return kind
  }
  // 旧草稿 / 旧后端没有 kind：兜底选项按固定文案识别。
  return label.trim() === FREE_OPTION_LABEL ? 'FREE' : undefined
}

/**
 * 把后端附带的「选项是否在库里」还原成页面结构。
 *
 * 旧草稿没有 `optionChecks`；缺少 `displayLabel` 时按状态补：未收录的选项
 * 必须让用户点之前就知道会去线上找，不能只显示一个裸名字。
 */
function readOptionChecks(
  value: unknown,
  options: readonly string[]
): AgentPendingQuestionOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    return []
  }
  return options.map((label, index) => {
    const raw = isRecord(value[index]) ? value[index] : null
    const kind = readOptionKind(raw, label)
    const inLibrary =
      raw && typeof raw.inLibrary === 'boolean' ? raw.inLibrary : null
    const matchedName =
      raw && typeof raw.matchedName === 'string' && raw.matchedName.trim()
        ? raw.matchedName.trim()
        : null

    // 新后端直接给结构化 AI 判断；旧草稿只有「候选名 —— 相关：理由」文案，
    // 从文案里还原，保证刷新后标签不丢。
    const parsed = splitAskOptionLabel(label)
    const rawVerdict = raw && isAiVerdict(raw.aiVerdict) ? raw.aiVerdict : null
    const aiVerdict = rawVerdict ?? parsed.aiVerdict
    const candidateLabel =
      (raw && typeof raw.candidateLabel === 'string'
        ? raw.candidateLabel.trim()
        : '') ||
      (aiVerdict ? parsed.candidateLabel : '')
    const aiReason = aiVerdict
      ? (raw && typeof raw.aiReason === 'string' ? raw.aiReason.trim() : '') ||
        parsed.aiReason
      : ''
    const baseLabel = aiVerdict ? candidateLabel || label : label
    const displayLabel =
      raw && typeof raw.displayLabel === 'string' && raw.displayLabel.trim()
        ? raw.displayLabel.trim()
        : inLibrary === false
          ? `${baseLabel}（库里未收录，选了会去线上找）`
          : baseLabel
    const classification =
      raw &&
      isRecord(raw.classification) &&
      typeof raw.classification.state === 'string' &&
      typeof raw.classification.method === 'string'
        ? {
            state: raw.classification.state.trim(),
            method: raw.classification.method.trim(),
            cutLabel:
              typeof raw.classification.cutLabel === 'string'
                ? raw.classification.cutLabel.trim() || null
                : null,
            cutGroup:
              typeof raw.classification.cutGroup === 'string'
                ? raw.classification.cutGroup.trim() || null
                : null,
            evidence:
              typeof raw.classification.evidence === 'string'
                ? raw.classification.evidence.trim() || null
                : null
          }
        : undefined
    return {
      label,
      ...(kind ? { kind } : {}),
      inLibrary,
      matchedName,
      displayLabel,
      ...(aiVerdict
        ? { candidateLabel: baseLabel, aiVerdict, aiReason }
        : {}),
      ...(classification ? { classification } : {})
    }
  })
}

/**
 * 把「待回答的问题」归一成页面结构。
 *
 * 三个入口共用：SSE `ask` 事件、非流式 `runAgent` 返回值、草稿 payload
 * （刷新后恢复）。认不出来（没问题 / 选项不足 2 个）就返回 null，不渲染半截问题。
 */
export function readPendingQuestion(
  value: unknown
): AgentPendingQuestion | null {
  if (!isRecord(value)) {
    return null
  }
  const question = readText(value.question)
  if (!question) {
    return null
  }
  const options = Array.isArray(value.options)
    ? value.options
        .map((option) => readText(option))
        .filter((option) => option.length > 0)
        // 收窄后允许 5 条词条 + 最后一条「都不对，我直接说」，共 6 个。
        .slice(0, 6)
    : []
  if (options.length < 2) {
    return null
  }
  const optionChecks = readOptionChecks(value.optionChecks, options)
  return {
    question,
    options,
    ...(optionChecks.length > 0 ? { optionChecks } : {})
  }
}

/** 选项按钮上的小标：已收录 / 未收录 / 未核实。 */
export interface AgentPendingOptionBadge {
  label: string
  type: 'success' | 'warning' | 'info'
}

export function pendingOptionBadge(
  option: AgentPendingQuestionOption | null | undefined
): AgentPendingOptionBadge | null {
  if (!option) {
    return null
  }
  if (option.kind === 'GROUP') {
    return { label: '分组', type: 'info' }
  }
  if (option.kind === 'STATE') {
    return { label: '生熟', type: 'info' }
  }
  if (option.kind === 'FREE') {
    return null
  }
  if (option.inLibrary === true) {
    return { label: '库里已收录', type: 'success' }
  }
  if (option.inLibrary === false) {
    return { label: '未收录', type: 'warning' }
  }
  return { label: '未核实', type: 'info' }
}

/**
 * 点选项回答：用当前草稿 id 发送选项原文。
 *
 * 没有待答问题、选项不在列表里、或还不知道 draftId 时返回 null——
 * 宁可不发，也不新建一份草稿把问答接错地方。
 */
export function answerInputFromPendingQuestion(
  state: Pick<AgentStreamState, 'draftId' | 'pendingQuestion'>,
  option: string
): { draftId: string; text: string } | null {
  const pending = state.pendingQuestion
  if (!pending || !state.draftId) {
    return null
  }
  const text = option.trim()
  if (!text || !pending.options.includes(text)) {
    return null
  }
  return { draftId: state.draftId, text }
}

function replaceStep(
  steps: AgentStreamStep[],
  next: AgentStreamStep
): AgentStreamStep[] {
  const at = steps.findIndex((step) => step.index === next.index)
  if (at === -1) {
    return [...steps, next]
  }
  return steps.map((step, index) => (index === at ? next : step))
}

/**
 * 解析一个 SSE 分片。
 *
 * - 只消费以空行结尾的完整帧，半帧留在 `rest` 等下一块；
 * - 兼容 `\r\n`、心跳注释（`: keep-alive`）与多行 `data:`；
 * - 坏 JSON 直接跳过，不让一条脏数据打断整轮。
 */
export function parseSseChunk(buffer: string): {
  events: AgentStreamEvent[]
  rest: string
} {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized.split('\n\n')
  const rest = blocks.pop() ?? ''
  const events: AgentStreamEvent[] = []

  for (const block of blocks) {
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) {
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (dataLines.length === 0) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(dataLines.join('\n'))
      if (isRecord(parsed) && typeof parsed.type === 'string') {
        events.push(parsed as unknown as AgentStreamEvent)
      }
    } catch {
      // 半帧 / 脏数据：留给下一块或直接丢弃。
    }
  }

  return { events, rest }
}

function readDurationMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
}

const AGENT_RUN_OUTCOMES: ReadonlyArray<AgentRunOutcome> = [
  'FINISHED',
  'TIMEOUT',
  'NO_PROGRESS',
  'ERROR'
]

/**
 * 校验后端报告：字段缺了 / 类型不对就当没有报告。
 *
 * 旧后端不发 report，页面必须保持原样；新后端字段以后也可能增加，
 * 这里只取自己认识的，不因为多一个字段就整份丢掉。
 */
export function readAgentRunReport(value: unknown): AgentRunReport | null {
  if (!isRecord(value)) {
    return null
  }
  const runId = readText(value.runId)
  const result = typeof value.result === 'string' ? value.result : ''
  if (
    !runId ||
    !AGENT_RUN_OUTCOMES.includes(result as AgentRunOutcome)
  ) {
    return null
  }

  const numbers = [
    value.steps,
    value.toolCalls,
    value.tokensIn,
    value.tokensOut,
    value.durationMs
  ]
  if (numbers.some((item) => readNonNegativeInt(item) === null)) {
    return null
  }

  const tools = Array.isArray(value.tools)
    ? value.tools.filter((item): item is string => typeof item === 'string')
    : []
  const failedTools = Array.isArray(value.failedTools)
    ? value.failedTools.flatMap((item) => {
        if (!isRecord(item)) {
          return []
        }
        const name = readText(item.name)
        if (!name) {
          return []
        }
        return [{ name, error: readText(item.error) || '工具执行失败' }]
      })
    : []

  return {
    runId,
    draftId: readText(value.draftId),
    text: typeof value.text === 'string' ? value.text : '',
    steps: readNonNegativeInt(value.steps) ?? 0,
    toolCalls: readNonNegativeInt(value.toolCalls) ?? 0,
    tokensIn: readNonNegativeInt(value.tokensIn) ?? 0,
    tokensOut: readNonNegativeInt(value.tokensOut) ?? 0,
    durationMs: readNonNegativeInt(value.durationMs) ?? 0,
    stopReason:
      typeof value.stopReason === 'string' && value.stopReason
        ? value.stopReason
        : null,
    tools,
    failedTools,
    result: result as AgentRunOutcome
  }
}

/** 耗时展示：<1s 用 ms，<60s 用秒，更长用「分m秒s」。 */
export function formatAgentDuration(durationMs: number): string {
  const safe = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  if (safe < 1000) {
    return `${Math.round(safe)}ms`
  }
  const totalSeconds = Math.round(safe / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`
}

/** token 展示：>=1000 用 k，保留一位小数并去掉 .0。 */
export function formatAgentTokenCount(tokens: number): string {
  const safe =
    Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0
  if (safe < 1000) {
    return String(safe)
  }
  const thousands = safe / 1000
  const text =
    thousands >= 100
      ? String(Math.round(thousands))
      : thousands.toFixed(1).replace(/\.0$/, '')
  return `${text}k`
}

/**
 * 「已执行 N 步」后面的摘要：`12 次工具 · 38s · 24k tokens`。
 *
 * 没有报告时返回空串，旧后端 / 断流时页面只显示原来的「已执行 N 步」。
 */
export function buildAgentReportSummary(
  report: AgentRunReport | null | undefined
): string {
  if (!report) {
    return ''
  }
  return (
    `${report.toolCalls} 次工具 · ` +
    `${formatAgentDuration(report.durationMs)} · ` +
    `${formatAgentTokenCount(report.tokensIn + report.tokensOut)} tokens`
  )
}

/**
 * 把一条事件并进页面状态。
 *
 * 未知事件、缺字段的事件、乱序到达的 step_end 都不能让页面崩：
 * 认不出来就原样返回；step_end 找不到对应 start 时补一条已完成步骤，
 * 已经收到的步骤永远不删。
 */
export function reduceAgentEvents(
  state: AgentStreamState,
  event: unknown
): AgentStreamState {
  if (!isRecord(event) || typeof event.type !== 'string') {
    return state
  }

  switch (event.type) {
    case 'step_start': {
      const index = readIndex(event.index)
      if (index === null) {
        return state
      }
      const name = readText(event.name) || 'unknown'
      return {
        ...state,
        steps: replaceStep(state.steps, {
          index,
          name,
          label: toolLabel(name),
          summary: readText(event.summary),
          status: 'running',
          ok: null
        })
      }
    }

    case 'step_end': {
      const index = readIndex(event.index)
      if (index === null) {
        return state
      }
      const existing = state.steps.find((step) => step.index === index)
      const ok = event.ok === true
      const found = typeof event.found === 'boolean' ? event.found : undefined
      const resultSummary = readText(event.resultSummary)
      const error = readText(event.error)
      // 只有查库 / 读记录事件才带展开数据；其它步骤仍然只有一行摘要。
      const search = toSearchEvidenceFromEvent({
        found: event.found,
        keywords: event.keywords,
        matches: event.matches,
        candidateCount: event.candidateCount,
        totalCandidates: event.totalCandidates,
        groups: event.groups,
        reviewSummary: event.reviewSummary
      })
      const record = toRecordEvidenceFromEvent(event.record)
      const durationMs = readDurationMs(event.durationMs)
      return {
        ...state,
        steps: replaceStep(state.steps, {
          index,
          name: existing?.name ?? '',
          label: existing?.label ?? `步骤 ${index}`,
          summary: existing?.summary ?? '',
          status: ok ? 'success' : 'failed',
          ok,
          ...(found === undefined ? {} : { found }),
          ...(resultSummary ? { resultSummary } : {}),
          ...(error ? { error } : {}),
          ...(search ? { search } : {}),
          ...(record ? { record } : {}),
          ...(durationMs === null ? {} : { durationMs })
        })
      }
    }

    case 'reply': {
      const steps = readNonNegativeInt(event.steps)
      const toolCallCount = readNonNegativeInt(event.toolCallCount)
      return {
        ...state,
        reply: typeof event.reply === 'string' ? event.reply : state.reply,
        draftId: readText(event.draftId) || state.draftId,
        meta:
          steps !== null && toolCallCount !== null
            ? { steps, toolCallCount }
            : state.meta,
        report: readAgentRunReport(event.report) ?? state.report
      }
    }

    case 'ask': {
      const pending = readPendingQuestion(event)
      if (!pending) {
        return state
      }
      return {
        ...state,
        pendingQuestion: pending,
        draftId: readText(event.draftId) || state.draftId,
        report: readAgentRunReport(event.report) ?? state.report
      }
    }

    case 'done':
      return {
        ...state,
        done: true,
        report: readAgentRunReport(event.report) ?? state.report
      }

    case 'error':
      return {
        ...state,
        error: readText(event.message) || '运行失败，请稍后重试。',
        report: readAgentRunReport(event.report) ?? state.report
      }

    default:
      return state
  }
}

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL
  const base = (configured && configured.trim()) || '/api/v1'
  return base.replace(/\/+$/, '')
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream'
  }
  const token =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('admin_token')
      : null
  if (token) {
    headers.Authorization = `Bearer ${token}`
  } else {
    // 与 axios 拦截器一致：本地开发没有 token 时走后端 dev-auth 兜底。
    headers['X-Customer-Id'] = 'admin-system'
  }
  return headers
}

async function readHttpErrorMessage(response: Response): Promise<string> {
  let text = ''
  try {
    text = await response.text()
  } catch {
    // 读不到响应体时用状态码兜底。
  }
  if (text.trim()) {
    try {
      const body: unknown = JSON.parse(text)
      if (isRecord(body)) {
        const message = body.message
        if (Array.isArray(message)) {
          const joined = message
            .filter((item): item is string => typeof item === 'string')
            .join('；')
          if (joined) {
            return joined
          }
        }
        if (typeof message === 'string' && message.trim()) {
          return message.trim()
        }
      }
    } catch {
      // 不是 JSON；下行按纯文本处理。
    }
    const plain = text.trim()
    if (plain && plain.length <= 300) {
      return plain
    }
  }
  return `请求失败（HTTP ${response.status}）`
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'This operation was aborted')
  )
}

export interface StreamIngredientAgentOptions {
  onEvent?: (event: AgentStreamEvent) => void
  onState?: (state: AgentStreamState) => void
  signal?: AbortSignal
}

/**
 * 调用流式 Agent 接口。
 *
 * 不抛异常：网络断开、HTTP 失败、流提前结束都折成 `state.error`，
 * 已归并的步骤保留在 `state.steps` 里（页面同时通过 `onState` 实时收到）。
 */
export async function streamIngredientAgent(
  input: { draftId?: string; text: string; line?: IngredientLine },
  options: StreamIngredientAgentOptions = {}
): Promise<AgentStreamState> {
  let state = createAgentStreamState()

  const apply = (event: unknown) => {
    state = reduceAgentEvents(state, event)
    options.onEvent?.(event as AgentStreamEvent)
    options.onState?.(state)
  }

  try {
    const response = await fetch(
      `${apiBaseUrl()}/admin/ingredient-creation/agent/stream`,
      {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(input),
        ...(options.signal ? { signal: options.signal } : {})
      }
    )

    if (!response.ok) {
      state = { ...state, error: await readHttpErrorMessage(response) }
      options.onState?.(state)
      return state
    }
    if (!response.body) {
      state = {
        ...state,
        error: '当前浏览器不支持流式读取，请升级浏览器后重试。'
      }
      options.onState?.(state)
      return state
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let terminal = false

    try {
      while (!terminal) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const parsed = parseSseChunk(buffer)
        buffer = parsed.rest
        for (const event of parsed.events) {
          apply(event)
          if (event.type === 'error' || event.type === 'done') {
            terminal = true
            break
          }
        }
      }

      if (!terminal && buffer.trim()) {
        for (const event of parseSseChunk(`${buffer}\n\n`).events) {
          apply(event)
        }
      }
    } finally {
      if (terminal) {
        await reader.cancel().catch(() => undefined)
      }
      reader.releaseLock()
    }
  } catch (error) {
    if (isAbortError(error)) {
      state = {
        ...state,
        error: '已取消本轮运行。已保留收到的步骤。'
      }
    } else {
      const reason =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : '网络异常'
      state = {
        ...state,
        error: `连接中断（${reason}）。已保留收到的 ${state.steps.length} 个步骤，可重试。`
      }
    }
    options.onState?.(state)
    return state
  }

  // ask 之后不会有 reply：有待答问题也算「正常收尾」，不能报成断流。
  if (!state.reply && !state.error && !state.pendingQuestion) {
    state = {
      ...state,
      error: `连接意外结束：没有收到 AI 的最终回复。已保留收到的 ${state.steps.length} 个步骤，请重试。`
    }
  }
  options.onState?.(state)
  return state
}

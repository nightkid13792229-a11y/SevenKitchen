/**
 * AI 添加原料的流式协议（SSE）解析与状态归并。
 *
 * 页面用 `streamIngredientAgent` 直接读 `ReadableStream`：后端每开始 / 结束一次
 * 工具调用就推一条事件，`parseSseChunk` 处理分片，`reduceAgentEvents` 把事件
 * 归并成可渲染的状态。三个函数都是纯的（只有 stream 会发请求），方便测试。
 */
import {
  toolLabel,
  toRecordEvidenceFromEvent,
  toSearchEvidenceFromEvent,
  type AgentRecordEvidenceView,
  type AgentSearchEvidenceView
} from './stepView'

/** 查库命中的一条词条（后端 step_end.matches 的精简结构）。 */
export interface AgentStreamMatch {
  name: string
  matchedBy: string
  matchedKeyword: string
  score: number | null
}

/** 读来源记录的步骤摘要（后端 step_end.record）。 */
export interface AgentStreamRecord {
  name: string
  coverage: number | null
  valueCount: number
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
      /** 查库：最多 5 条匹配依据。 */
      matches?: AgentStreamMatch[]
      /** 读来源记录：词条名 / 覆盖率 / 读到多少项。 */
      record?: AgentStreamRecord
    }
  | {
      type: 'reply'
      reply: string
      draftId: string
      steps: number
      toolCallCount: number
    }
  | { type: 'done' }
  | { type: 'error'; message: string }

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
}

export function createAgentStreamState(): AgentStreamState {
  return {
    steps: [],
    reply: null,
    draftId: null,
    meta: null,
    error: null,
    done: false
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
        candidateCount: event.candidateCount
      })
      const record = toRecordEvidenceFromEvent(event.record)
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
          ...(record ? { record } : {})
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
            : state.meta
      }
    }

    case 'done':
      return { ...state, done: true }

    case 'error':
      return {
        ...state,
        error: readText(event.message) || '运行失败，请稍后重试。'
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
  input: { draftId?: string; text: string },
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

  if (!state.reply && !state.error) {
    state = {
      ...state,
      error: `连接意外结束：没有收到 AI 的最终回复。已保留收到的 ${state.steps.length} 个步骤，请重试。`
    }
  }
  options.onState?.(state)
  return state
}

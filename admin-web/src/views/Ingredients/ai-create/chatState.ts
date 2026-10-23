/**
 * 「AI 添加原料」第一步：判断食材 / 补剂的对话状态。
 *
 * 页面只负责展示和收集输入，判断全部交给后端；这里把容易出错的行为
 * （追加气泡、建议项当成一次发送、失败气泡 + 重试、发送中单飞）
 * 收敛成不依赖 DOM 的逻辑，便于直接测试。
 */
import { computed, reactive } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  IntakeClassification,
  IntakeCurrentIngredient,
  IntakeHistoryTurn,
  IntakeIntent,
  IntakeKind
} from '@/types/ingredientCreation'

/** 进入页面时 AI 的第一句，固定不变。 */
export const WELCOME_TEXT = '你要添加什么原料？'
export const WELCOME_HINT = '说个名字就行，我来判断它是食材还是补剂。'

/** 每次请求最多带最近 6 条对话，避免上下文越滚越长。 */
export const INTAKE_HISTORY_LIMIT = 6

/** 拿不到后端原因（断网、超时）时的兜底文案；后端有中文提示时一律用原文。 */
export const ERROR_FALLBACK = 'AI 暂时不可用，请稍后重试。'

export type ChatRole = 'ai' | 'me'
export type ChatTone = 'normal' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  suggestions: string[]
  /** 普通回复 or 失败提示（失败气泡额外给「重试」） */
  tone: ChatTone
  /** 欢迎语气泡下方的补充说明 */
  hint?: string
}

export interface IntakeChatState {
  messages: ChatMessage[]
  sending: boolean
  /** 最近一次成功判断的类型；还没判断过时是 UNKNOWN */
  kind: IntakeKind
  /** 最近一次成功判断的输入，右侧结果卡用它当标题 */
  judgedText: string
  /** 最近一次失败的输入；「重试」重发它，不重复追加「我」的气泡 */
  failedText: string | null
  /**
   * 当前原料（最近一次判出 FOOD / SUPPLEMENT 的那条）。
   * 请求时带给后端，用于识别「纠正刚才那条」；失败不影响它。
   */
  current: IntakeCurrentIngredient | null
  /** 正在纠正的原原料名；不在纠正时为 null */
  correctingText: string | null
}

export type IntakeClassifier = (
  text: string,
  history?: IntakeHistoryTurn[],
  current?: IntakeCurrentIngredient
) => Promise<IntakeClassification>

export interface IntakeChat {
  state: IntakeChatState
  canSend: ComputedRef<boolean>
  send: (text: string) => Promise<boolean>
  pickSuggestion: (text: string) => Promise<boolean>
  retry: () => Promise<boolean>
}

interface ChatMessageOptions {
  suggestions?: string[]
  tone?: ChatTone
  hint?: string
}

let messageSeq = 0

function nextMessageId(): string {
  messageSeq += 1
  return `intake-msg-${messageSeq}`
}

/** 造一条气泡；测试里不依赖 id 的具体值。 */
export function createMessage(
  role: ChatRole,
  text: string,
  options: ChatMessageOptions = {}
): ChatMessage {
  const message: ChatMessage = {
    id: nextMessageId(),
    role,
    text,
    suggestions: options.suggestions ?? [],
    tone: options.tone ?? 'normal'
  }
  if (options.hint) {
    message.hint = options.hint
  }
  return message
}

/** 追加一条消息（返回新数组，不原地改传入的列表）。 */
export function appendMessage(
  messages: readonly ChatMessage[],
  message: ChatMessage
): ChatMessage[] {
  return [...messages, message]
}

/** 进入页面时的初始对话：AI 固定先问一句。 */
export function createInitialChatState(): IntakeChatState {
  return {
    messages: [
      createMessage('ai', WELCOME_TEXT, { hint: WELCOME_HINT })
    ],
    sending: false,
    kind: 'UNKNOWN',
    judgedText: '',
    failedText: null,
    current: null,
    correctingText: null
  }
}

/**
 * 取最近 `limit` 条对话作为请求历史。
 *
 * 当前这句由 `text` 单独传，不能再进 history，否则后端会收到两遍；
 * 所以调用方要在追加「我」的气泡之前先取快照。
 */
export function buildIntakeHistory(
  messages: readonly ChatMessage[],
  limit: number = INTAKE_HISTORY_LIMIT
): IntakeHistoryTurn[] {
  if (limit <= 0) return []
  return messages.slice(-limit).map((message) => ({
    role: message.role === 'me' ? 'user' : 'assistant',
    content: message.text
  }))
}

function pickText(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = pickText(item)
      if (text) return text
    }
    return ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

const GENERIC_ERROR_PATTERN =
  /^(Request failed with status code \d+|Network Error|timeout of \d+ms exceeded|Request aborted|Not Found|Cannot (?:GET|POST|PUT|PATCH|DELETE) \S+)$/i

/**
 * 失败气泡的文案：优先原样使用后端返回的中文提示（503 的 AI 未启用 / 不可用），
 * 只有拿不到具体原因时才用兜底文案。
 */
export function resolveChatErrorMessage(
  error: unknown,
  fallback: string = ERROR_FALLBACK
): string {
  if (typeof error === 'string') {
    const text = error.trim()
    return text && !GENERIC_ERROR_PATTERN.test(text) ? text : fallback
  }

  const raw = error as {
    message?: unknown
    response?: { data?: { message?: unknown } }
  } | null
  const message =
    pickText(raw?.response?.data?.message) || pickText(raw?.message)

  if (!message || GENERIC_ERROR_PATTERN.test(message)) {
    return fallback
  }
  return message
}

function normalizeKind(kind: unknown): IntakeKind {
  return kind === 'FOOD' || kind === 'SUPPLEMENT' ? kind : 'UNKNOWN'
}

/**
 * 后端一定会给 intent；这里仍做一次容错：
 * 老响应 / 缺字段时按「判出类别就是新原料，否则是追问」处理。
 */
function normalizeIntent(intent: unknown, kind: IntakeKind): IntakeIntent {
  if (
    intent === 'NEW' ||
    intent === 'CORRECTION' ||
    intent === 'CLARIFY' ||
    intent === 'OFF_TOPIC'
  ) {
    return intent
  }
  return kind === 'UNKNOWN' ? 'CLARIFY' : 'NEW'
}

function normalizeResolvedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function normalizeSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function normalizeReply(reply: unknown): string {
  return typeof reply === 'string' && reply.trim().length > 0
    ? reply.trim()
    : '我暂时没读懂判断结果，请再说一次原料名字。'
}

/**
 * 把一轮判定结果落到右侧：以 `kind + resolvedText` 为准。
 *
 * - 判出有效类型（含 NEW 与纠正成功的 CORRECTION）：更新为新原料；
 * - `CORRECTION + UNKNOWN`：右侧保留原原料，并标记「正在纠正」；
 * - 其它：按 kind 渲染（UNKNOWN 就是待判断）。
 */
function applyClassification(
  state: IntakeChatState,
  text: string,
  result: IntakeClassification
): void {
  state.failedText = null
  const kind = normalizeKind(result?.kind)
  const intent = normalizeIntent(result?.intent, kind)
  const resolvedText = normalizeResolvedText(result?.resolvedText)
  const name = resolvedText ?? text

  if (intent === 'CORRECTION' && kind === 'UNKNOWN') {
    if (state.current) {
      // 右侧继续展示原原料；顶部那行提示交给页面。
      state.kind = state.current.kind
      state.judgedText = state.current.text
      state.correctingText = state.current.text
    } else {
      // 还没判出过原料，没有可保留的对象，按待判断处理。
      state.kind = 'UNKNOWN'
      state.judgedText = ''
      state.correctingText = null
    }
    return
  }

  state.correctingText = null

  if (kind === 'UNKNOWN') {
    state.kind = 'UNKNOWN'
    state.judgedText = ''
    return
  }

  state.current = { text: name, kind }
  state.kind = kind
  state.judgedText = name
}

/**
 * 对话控制器：发送、点建议、重试都走同一条 `request`，
 * 保证「发送中禁止重复发送」只有一处判断。
 */
export function createIntakeChat(classify: IntakeClassifier): IntakeChat {
  const state = reactive<IntakeChatState>(createInitialChatState())
  // 失败时留存这次请求的上下文，「重试」原样重发，不重算历史。
  let retryHistory: IntakeHistoryTurn[] = []
  let retryCurrent: IntakeCurrentIngredient | undefined

  function pushMessage(message: ChatMessage) {
    state.messages = appendMessage(state.messages, message)
  }

  async function request(
    text: string,
    history: IntakeHistoryTurn[],
    current: IntakeCurrentIngredient | undefined
  ): Promise<boolean> {
    state.sending = true
    try {
      const result = await classify(text, history, current)
      applyClassification(state, text, result)
      pushMessage(
        createMessage('ai', normalizeReply(result?.reply), {
          suggestions: normalizeSuggestions(result?.suggestions)
        })
      )
      return true
    } catch (error) {
      // 这一句没判出来：右侧回到「待判断」，不要继续展示上一条原料的结果。
      // `current` 保留：那是上一次真正判出的原料，重试和下一句纠正还要用。
      state.kind = 'UNKNOWN'
      state.judgedText = ''
      state.correctingText = null
      state.failedText = text
      retryHistory = history
      retryCurrent = current
      pushMessage(
        createMessage('ai', resolveChatErrorMessage(error), { tone: 'error' })
      )
      return false
    } finally {
      state.sending = false
    }
  }

  async function send(text: string): Promise<boolean> {
    const value = text.trim()
    if (!value || state.sending) {
      return false
    }

    // 当前这句由 `text` 单独传，history 只取它之前的对话，避免后端收到两遍。
    const history = buildIntakeHistory(state.messages)
    pushMessage(createMessage('me', value))
    return request(value, history, state.current ?? undefined)
  }

  async function pickSuggestion(text: string): Promise<boolean> {
    return send(text)
  }

  async function retry(): Promise<boolean> {
    if (state.sending || !state.failedText) {
      return false
    }
    return request(state.failedText, retryHistory, retryCurrent)
  }

  return {
    state,
    canSend: computed(() => !state.sending),
    send,
    pickSuggestion,
    retry
  }
}

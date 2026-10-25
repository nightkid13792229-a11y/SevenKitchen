<template>
  <el-drawer
    v-model="visible"
    :size="'min(480px, 100%)'"
    :close-on-click-modal="false"
    class="recipe-agent-drawer"
    @open="handleOpen"
    @closed="handleClosed"
  >
    <template #header>
      <div class="agent-header">
        <span class="agent-header__title">AI 食谱设计</span>
        <el-tag
          v-if="session"
          size="small"
          :type="statusTagType"
          effect="plain"
        >
          {{ statusLabel }}
        </el-tag>
        <el-tag
          v-if="session"
          class="agent-header__mode"
          size="small"
          :type="modeTagType"
          effect="plain"
        >
          {{ modeLabel }}
        </el-tag>
      </div>
    </template>

    <div class="agent-drawer">
      <div v-if="session" class="agent-meta">
        <span :class="{ 'agent-meta__warning': currentRunSteps >= 25 }">
          本次 {{ currentRunSteps }}/{{ MAX_RUN_STEPS }} 次工具调用 · 会话累计 {{ session.stepCount }}
        </span>
        <span>输入 {{ session.promptTokens }} / 输出 {{ session.completionTokens }} tokens</span>
      </div>

      <div class="agent-conversation-shell">
        <div
          ref="scrollRef"
          v-loading="loading"
          class="agent-conversation"
          @scroll="handleScroll"
        >
        <el-empty
          v-if="!loading && messages.length === 0"
          :image-size="72"
          description="还没有开始。告诉 AI 你想设计什么，它会读草稿、查原料、写配方、跑评估。"
        />

        <template v-for="block in blocks" :key="block.key">
          <div v-if="block.type === 'tools'" class="agent-execution">
            <details class="agent-execution__group">
              <summary>
                <span class="agent-execution__title">
                  执行记录 {{ block.items.length }} 步
                </span>
                <span class="agent-execution__toggle">展开 / 收起</span>
              </summary>
              <div class="agent-execution__items">
                <details
                  v-for="tool in block.items"
                  :key="tool.id"
                  class="agent-tool"
                >
                  <summary>
                    <span class="agent-tool__name">{{ tool.toolName || '工具步骤' }}</span>
                    <span class="agent-tool__summary">{{ toolSummary(tool) }}</span>
                  </summary>
                  <div class="agent-tool__detail">{{ formatToolDetails(tool) }}</div>
                  <details class="agent-tool__raw">
                    <summary>查看原始数据</summary>
                    <pre class="agent-tool__payload">{{ formatToolPayload(tool) }}</pre>
                  </details>
                </details>
              </div>
            </details>
          </div>

          <div
            v-else
            class="agent-message"
            :class="`agent-message--${block.message.role.toLowerCase()}`"
          >
            <template v-if="block.message.role === 'ASSISTANT'">
              <div class="agent-answer">
                <span class="agent-answer__author">AI</span>
                <div class="agent-bubble agent-bubble--assistant">
                  {{ block.message.content || '（空消息）' }}
                </div>
              </div>
            </template>
            <div v-else class="agent-bubble agent-bubble--user">
              {{ block.message.content || '（空消息）' }}
            </div>
          </div>
        </template>

          <section v-if="delivery" class="agent-delivery">
            <div class="agent-delivery__head">
              <div class="agent-delivery__title">交付确认卡</div>
              <div class="agent-delivery__meta">
                <span class="agent-delivery__revision">
                  内容版本 v{{ delivery.contentRevision }}
                </span>
                <span>{{ formatDateTime(delivery.createdAt) }}</span>
              </div>
            </div>
            <p class="agent-delivery__summary">{{ delivery.summary }}</p>
            <p v-if="delivery.warnings.length > 0" class="agent-delivery__sync">
              {{ delivery.warnings.length }} 项警告已同步到上线检查
            </p>
          </section>

          <div
            v-if="session"
            class="agent-task-status"
            :class="`agent-task-status--${session.status.toLowerCase()}`"
          >
            <div class="agent-task-status__headline">{{ taskHeadline }}</div>
            <div class="agent-task-status__hint">{{ taskHint }}</div>
            <el-button
              v-if="isLimitReached"
              class="agent-task-status__continue"
              size="small"
              type="primary"
              plain
              :loading="sending"
              @click="continueRun"
            >
              继续本轮
            </el-button>
          </div>

          <el-alert
            v-if="showErrorAlert"
            class="agent-error"
            type="error"
            :closable="false"
            :title="session?.lastError || ''"
          />
        </div>
        <el-button
          v-if="hasNewBelow"
          class="agent-scroll-bottom"
          size="small"
          type="primary"
          plain
          @click="jumpToBottom"
        >
          有新消息，回到底部
        </el-button>
      </div>

      <div v-if="pendingApprovals.length > 0" class="agent-approvals">
        <div
          v-for="approval in pendingApprovals"
          :key="approval.id"
          class="agent-approval"
        >
          <div class="agent-approval__header">
            <span class="agent-approval__title">{{ approvalTitle(approval) }}</span>
            <el-tag size="small" type="warning" effect="plain">待审批</el-tag>
          </div>
          <div class="agent-approval__reason">{{ approval.reason }}</div>
          <div
            v-if="approval.type === 'CATEGORY_OMISSION'"
            class="agent-approval__detail"
          >
            缺类：{{ omissionCategories(approval) }}
          </div>
          <div class="agent-approval__actions">
            <el-button
              type="danger"
              plain
              size="small"
              :disabled="approvalActionsDisabled"
              @click="decide(approval, 'REJECTED')"
            >驳回</el-button>
            <el-button
              type="primary"
              size="small"
              :disabled="approvalActionsDisabled"
              @click="decide(approval, 'APPROVED')"
            >批准</el-button>
          </div>
        </div>
      </div>

      <section v-if="showQuestionCard" class="agent-questions">
        <div class="agent-questions__head">
          <div class="agent-questions__title">AI 在等你回答</div>
          <el-button link type="primary" size="small" @click="skipQuestions">
            跳过，直接回复
          </el-button>
        </div>
        <div
          v-for="(question, index) in pendingQuestions"
          :key="index"
          class="agent-question"
        >
          <div class="agent-question__text">
            {{ index + 1 }}. {{ question.question }}
          </div>
          <div v-if="question.options.length" class="agent-question__options">
            <el-button
              v-for="option in question.options"
              :key="option"
              size="small"
              :type="selectedAnswers[index] === option ? 'primary' : 'default'"
              plain
              @click="chooseOption(index, option)"
            >
              {{ option }}
            </el-button>
          </div>
        </div>
        <div class="agent-questions__hint">
          点选项会填入输入框，可修改后发送；不想选就点“跳过，直接回复”。
        </div>
      </section>

      <div class="agent-composer">
        <el-input
          v-model="input"
          type="textarea"
          :rows="3"
          resize="none"
          :disabled="running || sending"
          :placeholder="placeholder"
          @keydown.enter.exact.prevent="send"
        />
        <div class="agent-actions">
          <span class="agent-hint">
            {{ running ? 'AI 正在设计；要先停止才能接管。' : 'Enter 发送，Shift+Enter 换行' }}
          </span>
          <div class="agent-actions__buttons">
            <el-button
              v-if="running"
              type="danger"
              plain
              size="small"
              :loading="stopping"
              @click="stopRun"
            >停止</el-button>
            <el-button
              type="primary"
              size="small"
              :loading="sending"
              :disabled="!canSend"
              @click="send"
            >发送</el-button>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { NUTRITION_FIELD_CATALOG } from '@/utils/recipeDesigner/nutritionFieldCatalog'
import { formatDateTime } from '@/utils/date'
import type {
  RecipeAgentApproval,
  RecipeAgentDelivery,
  RecipeAgentMessage,
  RecipeAgentSession,
  RecipeAgentSessionMode,
  RecipeAgentSessionStatus
} from '@/types/recipeDesigner'

const props = defineProps<{
  modelValue: boolean
  draftId: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'refresh'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const session = ref<RecipeAgentSession | null>(null)
const messages = ref<RecipeAgentMessage[]>([])
const approvals = ref<RecipeAgentApproval[]>([])
const delivery = ref<RecipeAgentDelivery | null>(null)
const mode = ref<RecipeAgentSessionMode | null>(null)
const input = ref('')
const loading = ref(false)
const sending = ref(false)
const stopping = ref(false)
const decidingApprovalId = ref<string | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
/** 用户是否停在底部；向上翻记录后不再自动跟随新消息。 */
const stickToBottom = ref(true)
const hasNewBelow = ref(false)
const questionsDismissedKey = ref<string | null>(null)
const selectedAnswers = ref<Record<number, string>>({})

let pollTimer: number | null = null

const MAX_RUN_STEPS = 30

interface AgentToolsBlock {
  type: 'tools'
  key: string
  items: RecipeAgentMessage[]
}

interface AgentMessageBlock {
  type: 'message'
  key: string
  message: RecipeAgentMessage
}

type AgentConversationBlock = AgentToolsBlock | AgentMessageBlock

const running = computed(() => session.value?.status === 'RUNNING')

/**
 * 本次运行已用的工具调用数：从最后一条用户消息之后开始数。
 * 会话的 stepCount 是累计值，不能直接拿来和 30 次上限比。
 */
const currentRunSteps = computed(() => {
  const lastUserIndex = messages.value
    .map((message) => message.role)
    .lastIndexOf('USER')
  return messages.value
    .slice(lastUserIndex + 1)
    .filter((message) => message.role === 'TOOL').length
})

/**
 * 对话流按「块」渲染：
 *  · 连续 TOOL 消息合并成一组执行记录（默认折叠）；
 *  · USER / ASSISTANT 各自独立成块，避免工具输出把 AI 回答冲散。
 */
const blocks = computed<AgentConversationBlock[]>(() => {
  const result: AgentConversationBlock[] = []
  let toolBlock: AgentToolsBlock | null = null

  for (const message of messages.value) {
    if (message.role === 'TOOL') {
      if (!toolBlock) {
        toolBlock = {
          type: 'tools',
          key: `tools-${message.id}`,
          items: []
        }
        result.push(toolBlock)
      }
      toolBlock.items.push(message)
      continue
    }

    toolBlock = null
    result.push({
      type: 'message',
      key: message.id,
      message
    })
  }

  return result
})

/** 头部模式标签：ORDER 显示本单定制（带订单号前缀），其余按产品线处理。 */
const modeLabel = computed(() => {
  if (mode.value?.designMode !== 'ORDER') return '产品线'
  const orderId = mode.value.orderId?.trim()
  return orderId ? `本单定制 · 订单 ${orderId.slice(0, 8)}` : '本单定制'
})
const modeTagType = computed(() =>
  mode.value?.designMode === 'ORDER' ? 'primary' : 'info'
)

const waiting = computed(() => session.value?.status === 'WAITING_USER')
const isLimitReached = computed(
  () =>
    session.value?.status === 'FAILED' &&
    (session.value?.lastError ?? '').includes('超过运行上限')
)
const showErrorAlert = computed(
  () =>
    Boolean(session.value?.lastError) &&
    (session.value?.status === 'FAILED' ||
      session.value?.status === 'INTERRUPTED') &&
    !isLimitReached.value
)

interface AgentQuestion {
  question: string
  options: string[]
}

interface AgentQuestionSet {
  key: string
  questions: AgentQuestion[]
}

function readAskPayload(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

function readQuestions(value: unknown): AgentQuestion[] {
  const root = readAskPayload(value)
  const data =
    root && typeof root === 'object' && !Array.isArray(root)
      ? ((root as { data?: unknown }).data ?? root)
      : null
  const raw =
    data && typeof data === 'object' && Array.isArray((data as { questions?: unknown }).questions)
      ? (data as { questions: unknown[] }).questions
      : []
  const questions: AgentQuestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const question =
      typeof (item as { question?: unknown }).question === 'string'
        ? (item as { question: string }).question.trim()
        : ''
    const optionsRaw = (item as { options?: unknown }).options
    const options = Array.isArray(optionsRaw)
      ? optionsRaw
          .filter((option): option is string => typeof option === 'string')
          .map((option) => option.trim())
          .filter(Boolean)
      : []
    if (question) questions.push({ question, options })
  }
  return questions
}

const pendingQuestionSet = computed<AgentQuestionSet | null>(() => {
  if (session.value?.status !== 'WAITING_USER') return null
  const ask = [...messages.value]
    .reverse()
    .find((message) => message.role === 'TOOL' && message.toolName === 'ask_user')
  if (!ask) return null
  const questions = readQuestions(ask.toolResult ?? ask.toolArgs ?? ask.content)
  if (questions.length === 0) return null
  return { key: ask.id || String(ask.seq), questions }
})
const pendingQuestions = computed(() => pendingQuestionSet.value?.questions ?? [])
const showQuestionCard = computed(
  () =>
    Boolean(pendingQuestionSet.value) &&
    questionsDismissedKey.value !== pendingQuestionSet.value?.key
)

const taskHeadline = computed(() => {
  switch (session.value?.status) {
    case 'RUNNING': return 'AI 正在处理'
    case 'WAITING_USER': return 'AI 在等你回答'
    case 'COMPLETED': return '本轮已完成'
    case 'STOPPED': return '已停止'
    case 'FAILED': return isLimitReached.value ? '本轮达到上限' : '运行失败'
    case 'INTERRUPTED': return '已中断'
    default: return '尚未开始'
  }
})

const taskHint = computed(() => {
  switch (session.value?.status) {
    case 'RUNNING':
      return `本次已用 ${currentRunSteps.value}/${MAX_RUN_STEPS} 次工具调用；可以先停止再接管。`
    case 'WAITING_USER':
      return showQuestionCard.value && pendingQuestions.value.length > 0
        ? `有 ${pendingQuestions.value.length} 个问题；可点选项填入，也可跳过直接回复。`
        : '等待你的回复；直接在下方输入即可。'
    case 'COMPLETED':
      return delivery.value
        ? '交付卡见上方；可继续对话调整。'
        : '本轮已结束；可继续对话调整。'
    case 'STOPPED':
      return '输入新的要求可以重新开始。'
    case 'FAILED':
      return isLimitReached.value
        ? '草稿已保存；点“继续本轮”或直接输入，会获得新的 30 次预算。'
        : session.value?.lastError || '上次运行失败；可以再试一次。'
    case 'INTERRUPTED':
      return '上次运行被中断；输入新的要求可以重新开始。'
    default:
      return '告诉 AI 你想设计什么。'
  }
})

const pendingApprovals = computed(() =>
  approvals.value.filter((approval) => approval.status === 'PENDING')
)
const busy = computed(
  () =>
    sending.value ||
    stopping.value ||
    decidingApprovalId.value !== null
)
const approvalActionsDisabled = computed(() => running.value || busy.value)
const canSend = computed(
  () => !running.value && !sending.value && input.value.trim().length > 0
)

const STATUS_LABELS: Record<RecipeAgentSessionStatus, string> = {
  RUNNING: 'AI 设计中',
  WAITING_USER: '等你回答',
  COMPLETED: '已完成',
  STOPPED: '已停止',
  FAILED: '运行失败',
  INTERRUPTED: '已中断'
}

const STATUS_TAG_TYPES: Record<
  RecipeAgentSessionStatus,
  'success' | 'warning' | 'info' | 'danger' | 'primary'
> = {
  RUNNING: 'warning',
  WAITING_USER: 'warning',
  COMPLETED: 'success',
  STOPPED: 'info',
  FAILED: 'danger',
  INTERRUPTED: 'info'
}

const statusLabel = computed(() =>
  isLimitReached.value
    ? '达到上限'
    : session.value
      ? STATUS_LABELS[session.value.status]
      : '未开始'
)
const statusTagType = computed(() =>
  isLimitReached.value
    ? 'warning'
    : session.value
      ? STATUS_TAG_TYPES[session.value.status]
      : 'info'
)

const placeholder = computed(() => {
  if (running.value) return 'AI 正在设计，先停止才能接管…'
  if (waiting.value) return '回答 AI 的问题，或补充你的要求…'
  if (session.value?.status === 'COMPLETED') return '继续调整，或输入新的要求…'
  if (session.value?.status === 'STOPPED') return '已停止；输入新的要求可以重新开始…'
  if (isLimitReached.value) return '本轮达到上限；输入新的要求可以继续…'
  if (session.value?.status === 'FAILED') return '上次运行失败了；可以再试一次…'
  return '例如：用鸭腿肉和南瓜设计一份 2kg 的成犬主食，低脂，不要内脏…'
})

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function ensurePolling() {
  if (pollTimer !== null) return
  pollTimer = window.setInterval(() => {
    void loadSession(true)
  }, 1500)
}

const SCROLL_BOTTOM_THRESHOLD = 80

function handleScroll() {
  const element = scrollRef.value
  if (!element) return
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  const nearBottom = distance <= SCROLL_BOTTOM_THRESHOLD
  stickToBottom.value = nearBottom
  if (nearBottom) hasNewBelow.value = false
}

async function scrollToBottom(force = false) {
  await nextTick()
  const element = scrollRef.value
  if (!element) return
  if (!force && !stickToBottom.value) return
  element.scrollTop = element.scrollHeight
  stickToBottom.value = true
  hasNewBelow.value = false
}

function jumpToBottom() {
  stickToBottom.value = true
  void scrollToBottom(true)
}

async function loadSession(silent = false) {
  if (!props.draftId) return
  if (!silent) loading.value = true

  const previousStatus = session.value?.status
  const previousSessionId = session.value?.id
  const lastMessage = messages.value[messages.value.length - 1]
  const previousLastSeq = lastMessage ? lastMessage.seq : 0
  const hadMessages = messages.value.length > 0

  try {
    const view = await recipeDesignerApi.getAgentSession(props.draftId)
    session.value = view?.session ?? null
    messages.value = view?.messages ?? []
    approvals.value = view?.approvals ?? []
    delivery.value = view?.delivery ?? null
    mode.value = view?.mode ?? null

    const terminalStatuses: RecipeAgentSessionStatus[] = [
      'COMPLETED',
      'STOPPED',
      'FAILED',
      'INTERRUPTED'
    ]

    if (view) {
      const newToolMessages = view.messages.filter(
        (message) => message.role === 'TOOL' && message.seq > previousLastSeq
      )
      if (newToolMessages.length > 0) {
        emit('refresh')
      }

      if (
        previousSessionId === view.session.id &&
        previousStatus !== view.session.status &&
        terminalStatuses.includes(view.session.status)
      ) {
        emit('refresh')
      }

      if (view.session.status === 'RUNNING' || view.session.status === 'WAITING_USER') {
        ensurePolling()
      } else {
        stopPolling()
      }
    } else {
      stopPolling()
    }

    const nextMessages = view?.messages ?? []
    const hasNewMessages = nextMessages.some((message) => message.seq > previousLastSeq)
    // 不要在请求开始时捕获“是否在底部”：用户可能在请求期间往上翻，
    // 结束时按当前状态判断，避免一次慢请求把用户拽回底部。
    if (!hadMessages || stickToBottom.value) {
      await scrollToBottom(true)
    } else if (hasNewMessages) {
      hasNewBelow.value = true
    }
  } catch (error) {
    if (!silent) {
      ElMessage.error(error instanceof Error ? error.message : '读取 AI 会话失败')
    }
  } finally {
    if (!silent) loading.value = false
  }
}

function handleOpen() {
  session.value = null
  messages.value = []
  approvals.value = []
  delivery.value = null
  mode.value = null
  input.value = ''
  decidingApprovalId.value = null
  stickToBottom.value = true
  hasNewBelow.value = false
  questionsDismissedKey.value = null
  selectedAnswers.value = {}
  void loadSession()
}

function handleClosed() {
  stopPolling()
  emit('refresh')
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value || running.value) return

  // 发出去就代表已经回答了；问题卡收起，等 AI 的下一轮结果。
  questionsDismissedKey.value = pendingQuestionSet.value?.key ?? null
  stickToBottom.value = true
  hasNewBelow.value = false
  sending.value = true
  try {
    if (session.value && (waiting.value || isLimitReached.value)) {
      await recipeDesignerApi.answerAgentRun(session.value.id, text)
    } else {
      await recipeDesignerApi.startAgentRun(props.draftId, text)
    }
    input.value = ''
    await loadSession()
    ensurePolling()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发送失败')
    await loadSession(true)
  } finally {
    sending.value = false
  }
}

function continueRun() {
  if (!isLimitReached.value || sending.value || running.value) return
  if (!input.value.trim()) {
    input.value =
      '继续上一轮未完成的工作：先补完剩余营养缺口，再写文案和制作步骤，check_ready 后交付。'
  }
  void send()
}

async function stopRun() {
  if (!session.value) return
  stopping.value = true
  try {
    await recipeDesignerApi.stopAgentRun(session.value.id)
    await loadSession()
    stopPolling()
    emit('refresh')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '停止失败')
  } finally {
    stopping.value = false
  }
}

function approvalTitle(approval: RecipeAgentApproval): string {
  return approval.type === 'CATEGORY_OMISSION' ? '缺类确认' : '达标例外'
}

function omissionCategories(approval: RecipeAgentApproval): string {
  const detail = approval.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const raw = (detail as { categories?: unknown }).categories
    if (Array.isArray(raw)) {
      const categories = raw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
      if (categories.length > 0) {
        return categories.join('、')
      }
    }
  }
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }
  return '未提供'
}

async function decide(
  approval: RecipeAgentApproval,
  status: 'APPROVED' | 'REJECTED'
) {
  if (!session.value || approvalActionsDisabled.value) return
  const sessionId = session.value.id
  decidingApprovalId.value = approval.id
  try {
    await recipeDesignerApi.decideAgentApproval(approval.id, status)
    await recipeDesignerApi.answerAgentRun(
      sessionId,
      status === 'APPROVED'
        ? '缺类确认已批准，请重新 check_ready 并 finish_draft；保留所有警告。'
        : '缺类确认被驳回，请调整方案或说明。'
    )
    await loadSession()
    ensurePolling()
    ElMessage.success(status === 'APPROVED' ? '审批已批准' : '审批已驳回')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '审批失败')
    await loadSession(true)
  } finally {
    decidingApprovalId.value = null
  }
}

function chooseOption(index: number, option: string) {
  selectedAnswers.value = { ...selectedAnswers.value, [index]: option }
  input.value = pendingQuestions.value
    .map((question, questionIndex) =>
      selectedAnswers.value[questionIndex]
        ? `${questionIndex + 1}. ${question.question}\n${selectedAnswers.value[questionIndex]}`
        : ''
    )
    .filter(Boolean)
    .join('\n\n')
}

function skipQuestions() {
  questionsDismissedKey.value = pendingQuestionSet.value?.key ?? null
}

function toolSummary(message: RecipeAgentMessage): string {
  const result = message.toolResult as { summary?: unknown } | null | undefined
  if (result && typeof result === 'object' && typeof result.summary === 'string') {
    return result.summary
  }
  return message.content ? String(message.content).slice(0, 120) : ''
}

/* ---- 执行记录详情：把工具返回翻译成中文；原始 JSON 只放在调试折叠区 ---- */

const TOOL_DETAIL_MAX_LENGTH = 4000
const TOOL_VALUE_MAX_LENGTH = 120

const TOOL_ERROR_LABELS: Record<string, string> = {
  INVALID_ARGUMENT: '参数不合法',
  INVALID_WEIGHT: '克数不合法',
  INGREDIENT_NOT_FOUND: '原料不存在',
  DRAFT_EMPTY: '草稿为空',
  COPY_FORBIDDEN_CLAIM: '文案含禁用宣称',
  TAG_NOT_ALLOWED: '健康标签不允许',
  ASSESSMENT_STALE: '评估已过期',
  READY_BLOCKED: '交付检查未通过',
  CONTROL_NOT_AVAILABLE: '控制操作不可用'
}

const INGREDIENT_TYPE_LABELS: Record<string, string> = {
  FOOD: '食材',
  SUPPLEMENT: '补剂'
}

const FOOD_CATEGORY_LABELS: Record<string, string> = {
  PROTEIN: '蛋白',
  ORGAN: '内脏',
  CARB: '碳水',
  VEGETABLE: '蔬菜',
  MUSHROOM: '菌藻',
  NUTS: '坚果种子',
  OIL: '油脂',
  FRUIT: '水果',
  DAIRY: '乳',
  EGG: '蛋',
  LEGUME: '豆',
  SEASONING: '调味',
  SUPPLEMENT: '补剂',
  UNCLASSIFIED: '未归类'
}

const BASE_UNIT_LABELS: Record<string, string> = {
  G: '克（g）',
  ML: '毫升（ml）',
  PCS: '个 / 粒'
}

const NUTRITION_BASIS_LABELS: Record<string, string> = {
  PER_100_G: '每 100g',
  PER_1_G: '每 1g',
  PER_100_ML: '每 100ml',
  PER_1_ML: '每 1ml',
  PER_SERVING: '每份'
}

const NUTRIENT_GROUP_LABELS: Record<string, string> = {
  macros: '宏量营养',
  minerals: '矿物质',
  vitamins: '维生素',
  fattyAcids: '脂肪酸',
  aminoAcids: '氨基酸'
}

const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  COMPLIANT: '达标',
  DEFICIENT: '不足',
  EXCESS: '超标',
  MISSING_DATA: '缺数据',
  INFO: '参考'
}

const READY_STATUS_LABELS: Record<string, string> = {
  PASS: '通过',
  PASS_WITH_WARNINGS: '有警告，可交付',
  BLOCKED: '未通过'
}

const READY_CHECK_STATUS_LABELS: Record<string, string> = {
  PASS: '通过',
  WARN: '警告',
  FAIL: '未通过'
}

const FIELD_LABELS: Record<string, string> = {
  name: '名称',
  label: '名称',
  title: '标题',
  status: '状态',
  type: '类型',
  category: '分类',
  count: '数量',
  value: '数值',
  unit: '单位',
  weightG: '克数',
  totalWeightG: '总重',
  ratioPercent: '占比',
  preparationMethod: '预处理',
  preparationNote: '预处理备注',
  nutritionFoodId: '营养档案 ID',
  ingredientId: '原料 ID',
  itemId: '草稿项 ID',
  recipeId: '食谱 ID',
  contentRevision: '内容版本',
  reason: '理由',
  detail: '说明',
  message: '说明',
  code: '错误码',
  stale: '过期项',
  totalPublishedRecipes: '已发布目录',
  mainProteinCount: '主蛋白出现次数',
  mainProteinName: '主蛋白',
  warnings: '警告',
  questions: '问题',
  checks: '检查项',
  entries: '指标',
  covered: '基础已覆盖',
  missing: '基础缺类',
  suggestedCovered: '建议已覆盖',
  suggestedMissing: '建议未覆盖',
  optionalPresent: '可选类',
  supplementCount: '补剂数',
  unclassifiedCount: '未归类数',
  totalEnergyKcal: '总能量',
  energyDensityKcalPerKg: '能量密度',
  allergenNames: '过敏原',
  preparationMethods: '预处理方式',
  pricePerPurchaseUnit: '参考价',
  purchaseUnit: '采购单位',
  nutrientMatch: '营养匹配',
  keyNutrients: '关键营养',
  verified: '档案已验证',
  cfctClass: 'CFCT 分类',
  nutritionCategory: '营养分类',
  baseUnit: '基准单位',
  nutritionSummary: '营养摘要',
  nutritionBasis: '营养基准'
}

const NUTRIENT_FIELD_META: Record<string, { label: string; unit: string }> = {}
for (const field of NUTRITION_FIELD_CATALOG) {
  NUTRIENT_FIELD_META[field.fieldPath] = {
    label: field.label,
    unit: field.unit
  }
  if (!NUTRIENT_FIELD_META[field.fieldKey]) {
    NUTRIENT_FIELD_META[field.fieldKey] = {
      label: field.label,
      unit: field.unit
    }
  }
}

interface ToolResultDetail {
  data: unknown
  args: unknown
  summary: string
  errorCode: string
  errorMessage: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return ''
  if (!text.startsWith('{') && !text.startsWith('[')) return text
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function readToolResultDetail(message: RecipeAgentMessage): ToolResultDetail {
  const args = parseJsonish(message.toolArgs)
  const payload = parseJsonish(message.toolResult)
  let data: unknown = null
  let summary = ''
  let errorCode = ''
  let errorMessage = ''

  if (typeof payload === 'string') {
    summary = payload
  } else if (Array.isArray(payload)) {
    data = payload
  } else {
    const record = asRecord(payload)
    if (record) {
      const isEnvelope =
        'ok' in record ||
        'data' in record ||
        'error' in record ||
        'summary' in record
      if (isEnvelope) {
        const error = asRecord(record.error)
        if (error) {
          errorCode = readString(error.code)
          errorMessage = readString(error.message)
        }
        summary = readString(record.summary)
        if (record.ok === false) {
          if (!errorMessage) errorMessage = summary || '工具执行失败'
        } else {
          data = record.data ?? null
        }
      } else {
        data = record
      }
    }
  }

  if (data === null && !summary && !errorMessage) {
    const content = parseJsonish(message.content)
    if (typeof content === 'string') {
      summary = content.trim()
    } else if (content !== null && content !== undefined) {
      data = content
    } else {
      data = args ?? null
    }
  }

  return { data, args, summary, errorCode, errorMessage }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Number.isInteger(value)) return String(value)
  const abs = Math.abs(value)
  if (abs >= 100) return value.toFixed(1).replace(/\.0$/, '')
  if (abs >= 1) return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function truncateText(value: string, max = TOOL_VALUE_MAX_LENGTH): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact
}

function humanizeKey(key: string): string {
  const name = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2') || key
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanizeKey(key)
}

function categoryLabel(value: unknown): string {
  const key = readString(value)
  if (!key) return ''
  return FOOD_CATEGORY_LABELS[key] ?? key
}

function categoryLabels(values: string[]): string {
  return values.map((value) => FOOD_CATEGORY_LABELS[value] ?? value).join('、')
}

function ingredientTypeLabel(value: unknown): string {
  const key = readString(value)
  if (!key) return ''
  return INGREDIENT_TYPE_LABELS[key] ?? key
}

function nutrientMeta(key: string): { label: string; unit: string } {
  return NUTRIENT_FIELD_META[key] ?? { label: humanizeKey(key), unit: '' }
}

function formatNutrientValue(key: string, value: number): string {
  const meta = nutrientMeta(key)
  const separator = meta.unit === 'kcal' || meta.unit === 'IU' ? ' ' : ''
  return `${meta.label} ${formatNumber(value)}${separator}${meta.unit}`
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) {
    const parts = value.map((item) => displayValue(item)).filter((item) => item !== '—')
    return parts.length > 0 ? parts.join('、') : '无'
  }
  const record = asRecord(value)
  if (record) {
    return Object.entries(record)
      .slice(0, 6)
      .map(([key, item]) => `${fieldLabel(key)} ${displayValue(item)}`)
      .join('；')
  }
  return truncateText(String(value))
}

function nutrientMatchText(value: unknown): string {
  const match = asRecord(value)
  if (!match) return ''
  const label = readString(match.label)
  const displayText = readString(match.displayText)
  if (displayText) {
    return truncateText([label, displayText].filter(Boolean).join(' '))
  }
  const amount = readNumber(match.amount)
  const unit = readString(match.unit)
  const basisLabel = readString(match.basisLabel)
  const amountText = amount === null ? '' : `${formatNumber(amount)}${unit}`
  const fallback = [label, amountText, basisLabel].filter(Boolean).join(' ')
  return truncateText(fallback)
}

function describeNutritionBasis(value: unknown): string {
  const record = asRecord(value)
  if (!record) return '营养值'
  const basisType = readString(record.basisType)
  const base = NUTRITION_BASIS_LABELS[basisType] ?? (basisType || '营养值')
  const usageUnit = readString(record.usageUnit)
  if (basisType === 'PER_SERVING' && usageUnit) return `每${usageUnit}`
  const servingWeight = readNumber(record.servingWeightG)
  if (servingWeight !== null) return `${base}（每份 ${formatNumber(servingWeight)}g）`
  return base
}

function flattenNutrition(
  record: Record<string, unknown>,
  prefix = ''
): Array<[string, number]> {
  const result: Array<[string, number]> = []
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'number' && Number.isFinite(value)) {
      result.push([path, value])
      continue
    }
    const nested = asRecord(value)
    if (nested) result.push(...flattenNutrition(nested, path))
  }
  return result
}

function nutritionLines(
  summaryValue: unknown,
  isSupplement: boolean,
  basisValue: unknown
): string[] {
  const record = asRecord(summaryValue)
  if (!record) return ['营养：暂无数据']
  const entries = flattenNutrition(record)
  if (entries.length === 0) return ['营养：暂无数据']

  if (!isSupplement) {
    const parts = entries
      .slice(0, 12)
      .map(([key, value]) => formatNutrientValue(key, value))
    const more = entries.length > 12 ? ` 等 ${entries.length} 项` : ''
    return [`营养（每 100g）：${parts.join(' · ')}${more}`]
  }

  const groups = new Map<string, Array<[string, number]>>()
  for (const [key, value] of entries) {
    const dot = key.indexOf('.')
    const group = dot > 0 ? key.slice(0, dot) : 'macros'
    const groupEntries = groups.get(group) ?? []
    groupEntries.push([dot > 0 ? key.slice(dot + 1) : key, value])
    groups.set(group, groupEntries)
  }

  const lines: string[] = [`营养（${describeNutritionBasis(basisValue)}）：`]
  for (const [group, groupEntries] of groups) {
    const shown = groupEntries
      .slice(0, 8)
      .map(([key, value]) => formatNutrientValue(key, value))
    const more = groupEntries.length > 8 ? ` 等 ${groupEntries.length} 项` : ''
    lines.push(
      `· ${NUTRIENT_GROUP_LABELS[group] ?? group}：${shown.join('、')}${more}`
    )
  }
  const basisRecord = asRecord(basisValue)
  if (basisRecord) {
    const usageUnit = readString(basisRecord.usageUnit)
    const servingWeight = readNumber(basisRecord.servingWeightG)
    const extra = [
      usageUnit ? `用量单位 ${usageUnit}` : '',
      servingWeight !== null ? `每份 ${formatNumber(servingWeight)}g` : ''
    ].filter(Boolean)
    if (extra.length > 0) lines.push(`  计量：${extra.join('；')}`)
  }
  return lines
}

function searchIngredientLines(data: unknown, summary: string): string[] {
  const record = asRecord(data)
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray(record?.candidates)
      ? record.candidates
      : []

  if (candidates.length === 0) {
    const lines = ['没有找到候选原料。']
    if (summary) lines.push(`原因：${truncateText(summary, 200)}`)
    return lines
  }

  const lines = [`找到 ${candidates.length} 个候选：`]
  candidates.slice(0, 12).forEach((candidate, index) => {
    const item = asRecord(candidate)
    if (!item) return
    const name = readString(item.name) || '未命名原料'
    const meta = [
      ingredientTypeLabel(item.type),
      readString(item.cfctClass) ||
        readString(item.nutritionCategory) ||
        categoryLabel(item.category)
    ].filter(Boolean)
    lines.push(
      `${index + 1}. ${truncateText(name, 40)}${
        meta.length > 0 ? `（${meta.join(' · ')}）` : ''
      }`
    )
    const matchText = nutrientMatchText(item.nutrientMatch)
    if (matchText) lines.push(`   匹配：${matchText}`)
  })
  if (candidates.length > 12) {
    lines.push(`…还有 ${candidates.length - 12} 个候选`)
  }
  return lines
}

function ingredientDetailLines(data: unknown, summary: string): string[] {
  const record = asRecord(data)
  if (!record) return fallbackDetailLines(data, summary)

  const name = readString(record.name) || '未命名原料'
  const verified =
    record.verified === false ? '（营养档案未验证）' : ''
  const lines = [`${truncateText(name, 60)}${verified}`]

  const type = ingredientTypeLabel(record.type)
  const category = categoryLabel(record.category)
  const classification =
    readString(record.cfctClass) || readString(record.nutritionCategory)
  const typeParts = [type]
  if (category && category !== type) typeParts.push(`分类 ${category}`)
  if (classification && classification !== category) {
    typeParts.push(`CFCT ${classification}`)
  }
  lines.push(`类型：${typeParts.filter(Boolean).join(' · ') || '—'}`)

  const baseUnit = readString(record.baseUnit)
  if (baseUnit) {
    lines.push(`基准单位：${BASE_UNIT_LABELS[baseUnit] ?? baseUnit}`)
  }

  const isSupplement = readString(record.type) === 'SUPPLEMENT'
  lines.push(
    ...nutritionLines(record.nutritionSummary, isSupplement, record.nutritionBasis)
  )

  const allergens = readStringArray(record.allergenNames)
  lines.push(
    `过敏原：${
      allergens.length > 0 ? truncateText(allergens.join('、'), 160) : '无'
    }`
  )

  const preparations = readStringArray(record.preparationMethods)
  lines.push(
    `预处理：${
      preparations.length > 0
        ? truncateText(preparations.join('、'), 160)
        : '暂无记录'
    }`
  )

  const price = readNumber(record.pricePerPurchaseUnit)
  const purchaseUnit = readString(record.purchaseUnit)
  lines.push(
    `参考价：${
      price === null
        ? '未设置'
        : `¥${formatNumber(price)}${purchaseUnit ? ` / ${purchaseUnit}` : ''}`
    }`
  )

  return lines
}

function ingredientChangeLines(
  toolName: string,
  data: unknown,
  args: unknown,
  summary: string
): string[] {
  const record = asRecord(data)
  const argRecord = asRecord(args)
  const name =
    readString(record?.name) || readString(argRecord?.name) || '该原料'
  const weight =
    readNumber(record?.weightG) ?? readNumber(argRecord?.weightG)
  const weightText = weight === null ? '' : `${formatNumber(weight)}g`
  const lines: string[] = []

  switch (toolName) {
    case 'add_ingredient':
      lines.push(`新增原料：${name}${weightText ? `，${weightText}` : ''}`)
      break
    case 'replace_ingredient':
      lines.push(`替换为：${name}${weightText ? `，${weightText}` : ''}`)
      break
    case 'update_weight':
      lines.push(`调整克数：${name}${weightText ? ` → ${weightText}` : ''}`)
      break
    case 'remove_ingredient':
      lines.push(`删除原料：${name}`)
      break
    default:
      return fallbackDetailLines(data, summary)
  }

  if (record) {
    const category = categoryLabel(record.category)
    if (category) lines.push(`分类：${category}`)
    const ratio = readNumber(record.ratioPercent)
    if (ratio !== null) lines.push(`占草稿比例：${formatNumber(ratio)}%`)
    if (toolName === 'add_ingredient') {
      const method = readString(record.preparationMethod)
      if (method) lines.push(`预处理：${method}`)
    }
    if (toolName === 'remove_ingredient') {
      const total = readNumber(record.totalWeightG)
      if (total !== null) lines.push(`剩余总重：${formatNumber(total)}g`)
    }
  }

  if (summary) lines.push(`结果：${truncateText(summary, 220)}`)
  return lines.length > 0 ? lines : fallbackDetailLines(data, summary)
}

function formatRange(
  min: number | null,
  max: number | null,
  unit: string
): string {
  if (min !== null && max !== null) {
    return `${formatNumber(min)}–${formatNumber(max)}${unit}`
  }
  if (min !== null) return `≥ ${formatNumber(min)}${unit}`
  if (max !== null) return `≤ ${formatNumber(max)}${unit}`
  return '—'
}

function assessmentEntryLine(entry: Record<string, unknown>): string {
  const label =
    readString(entry.label) ||
    humanizeKey(readString(entry.key)) ||
    '未命名指标'
  const unit = readString(entry.unit)
  const value = readNumber(entry.value)
  const min = readNumber(entry.min)
  const max = readNumber(entry.max)
  const margin = readNumber(entry.marginPercent)
  const side = readString(entry.marginSide)
  const range =
    min !== null || max !== null
      ? `参考 ${formatRange(min, max, unit)}`
      : ''

  if (value === null) {
    return truncateText(
      `${label}：缺数据${range ? `，${range}` : ''}`,
      180
    )
  }

  const parts = [`${label}：${formatNumber(value)}${unit}`]
  if (range) parts.push(range)
  if (margin !== null) {
    const sideLabel =
      side === 'LOWER' ? '距下限' : side === 'UPPER' ? '距上限' : '余量'
    parts.push(`${sideLabel} ${formatNumber(margin)}%`)
  }
  return truncateText(parts.join('，'), 180)
}

function assessmentLines(data: unknown, summary: string): string[] {
  const record = asRecord(data)
  if (!record) return fallbackDetailLines(data, summary)

  const entries = Array.isArray(record.entries)
    ? record.entries
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : []
  const compliant = readNumber(record.compliant) ?? 0
  const deficient = readNumber(record.deficient) ?? 0
  const excess = readNumber(record.excess) ?? 0
  const missingData = readNumber(record.missingData) ?? 0
  const total = compliant + deficient + excess + missingData
  const revision = readNumber(record.contentRevision)
  const head = `${revision !== null ? `内容版本 v${revision}：` : ''}${compliant}/${total} 项达标`
  const counts = [
    deficient > 0 ? `不足 ${deficient}` : '',
    excess > 0 ? `超标 ${excess}` : '',
    missingData > 0 ? `缺数据 ${missingData}` : ''
  ].filter(Boolean)
  const lines = [counts.length > 0 ? `${head}（${counts.join(' · ')}）` : head]

  const totalEnergy = readNumber(record.totalEnergyKcal)
  const totalWeight = readNumber(record.totalWeightG)
  if (totalEnergy !== null) {
    lines.push(
      `总能量 ${formatNumber(totalEnergy)} kcal${
        totalWeight !== null ? ` · 总重 ${formatNumber(totalWeight)}g` : ''
      }`
    )
  }

  const problemStatuses = ['DEFICIENT', 'EXCESS', 'MISSING_DATA']
  let hasProblems = false
  for (const status of problemStatuses) {
    const group = entries.filter((entry) => readString(entry.status) === status)
    if (group.length === 0) continue
    hasProblems = true
    lines.push(`${ASSESSMENT_STATUS_LABELS[status]}（${group.length}）：`)
    for (const entry of group.slice(0, 10)) {
      lines.push(`· ${assessmentEntryLine(entry)}`)
    }
    if (group.length > 10) lines.push(`  …还有 ${group.length - 10} 项`)
  }
  if (!hasProblems) lines.push('没有不足、超标或缺数据项。')
  if (entries.length === 0 && summary) {
    lines.push(`结果：${truncateText(summary, 200)}`)
  }
  return lines
}

function coverageLines(data: unknown, summary: string): string[] {
  const record = asRecord(data)
  if (!record) return fallbackDetailLines(data, summary)

  const covered = readStringArray(record.covered)
  const missing = readStringArray(record.missing)
  const suggestedCovered = readStringArray(record.suggestedCovered)
  const suggestedMissing = readStringArray(record.suggestedMissing)
  const baseTotal = covered.length + missing.length || 7
  const suggestedTotal = suggestedCovered.length + suggestedMissing.length || 3
  const lines = [
    `基础覆盖 ${covered.length}/${baseTotal} · 建议覆盖 ${suggestedCovered.length}/${suggestedTotal}`
  ]

  if (missing.length > 0) lines.push(`基础缺类：${categoryLabels(missing)}`)
  if (suggestedMissing.length > 0) {
    lines.push(`建议未覆盖：${categoryLabels(suggestedMissing)}`)
  }
  const optional = readStringArray(record.optionalPresent)
  if (optional.length > 0) lines.push(`可选类：${categoryLabels(optional)}`)

  const supplements = readNumber(record.supplementCount)
  const unclassified = readNumber(record.unclassifiedCount)
  if (supplements !== null || unclassified !== null) {
    lines.push(
      `补剂 ${supplements ?? 0} 种 · 未归类 ${unclassified ?? 0} 种`
    )
  }
  return lines
}

function readyLines(data: unknown, summary: string): string[] {
  const record = asRecord(data)
  if (!record) return fallbackDetailLines(data, summary)

  const checks = Array.isArray(record.checks)
    ? record.checks
        .map((check) => asRecord(check))
        .filter((check): check is Record<string, unknown> => check !== null)
    : []
  const status = readString(record.status)
  const lines = [
    `检查结论：${READY_STATUS_LABELS[status] ?? (status || '—')}${
      checks.length > 0 ? `（${checks.length} 项）` : ''
    }`
  ]
  for (const check of checks.slice(0, 20)) {
    const label =
      readString(check.label) ||
      humanizeKey(readString(check.key)) ||
      '未命名检查'
    const checkStatus = readString(check.status)
    const detail = readString(check.detail)
    lines.push(
      `· [${READY_CHECK_STATUS_LABELS[checkStatus] ?? checkStatus}] ${label}${
        detail ? `：${truncateText(detail, 180)}` : ''
      }`
    )
  }
  if (checks.length > 20) lines.push(`…还有 ${checks.length - 20} 项检查`)
  if (checks.length === 0 && summary) {
    lines.push(`结果：${truncateText(summary, 200)}`)
  }
  return lines
}

function askUserLines(data: unknown, summary: string): string[] {
  const questions = readQuestions(data)
  if (questions.length === 0) return fallbackDetailLines(data, summary)

  const lines = [`共 ${questions.length} 个问题：`]
  questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${truncateText(question.question, 200)}`)
    lines.push(
      `   选项：${
        question.options.length > 0
          ? question.options.map((option) => truncateText(option, 40)).join(' / ')
          : '无（自由回答）'
      }`
    )
  })
  return lines
}

function requestExceptionLines(data: unknown, summary: string): string[] {
  const record = asRecord(data)
  if (!record) return fallbackDetailLines(data, summary)

  const type = readString(record.type)
  const typeLabel =
    type === 'COMPLIANCE'
      ? '达标例外'
      : type === 'CATEGORY_OMISSION'
        ? '缺类确认'
        : type || '—'
  const lines = [`申请类型：${typeLabel}`]
  const reason = readString(record.reason)
  if (reason) lines.push(`理由：${truncateText(reason, 240)}`)
  const detail = readString(record.detail)
  if (detail) lines.push(`补充说明：${truncateText(detail, 240)}`)
  if (summary) lines.push(`结果：${truncateText(summary, 220)}`)
  return lines
}

function finishDraftLines(
  data: unknown,
  args: unknown,
  summary: string
): string[] {
  const record = asRecord(data)
  const argRecord = asRecord(args)
  const lines: string[] = []

  const status = readString(record?.status)
  if (status) lines.push(`交付结论：${READY_STATUS_LABELS[status] ?? status}`)
  const deliverySummary = readString(argRecord?.summary)
  if (deliverySummary) {
    lines.push(`交付说明：${truncateText(deliverySummary, 260)}`)
  }
  const warnings = readStringArray(record?.warnings)
  if (warnings.length === 0) {
    lines.push('警告：无')
  } else {
    lines.push(`警告（${warnings.length}）：`)
    for (const warning of warnings.slice(0, 8)) {
      lines.push(`· ${truncateText(warning, 180)}`)
    }
    if (warnings.length > 8) lines.push(`  …还有 ${warnings.length - 8} 条`)
  }
  if (summary) lines.push(`结果：${truncateText(summary, 220)}`)
  return lines.length > 0
    ? lines
    : fallbackDetailLines(data ?? args, summary)
}

function catalogUsageLines(data: unknown, summary: string): string[] {
  const record = asRecord(data)
  if (!record) return fallbackDetailLines(data, summary)

  const total = readNumber(record.totalPublishedRecipes)
  const mainProteinCount = readNumber(record.mainProteinCount)
  const recipes = Array.isArray(record.recipes)
    ? record.recipes
        .map((recipe) => asRecord(recipe))
        .filter((recipe): recipe is Record<string, unknown> => recipe !== null)
    : []
  const head = [
    total !== null ? `已发布目录 ${formatNumber(total)} 道菜` : '',
    mainProteinCount !== null
      ? `主蛋白出现 ${formatNumber(mainProteinCount)} 次`
      : ''
  ].filter(Boolean)
  const lines = [head.join(' · ') || '目录使用情况']

  if (recipes.length === 0) {
    lines.push('没有重合菜品。')
  } else {
    lines.push(`重合菜品（${recipes.length}）：`)
    for (const recipe of recipes.slice(0, 8)) {
      const name = readString(recipe.name) || '未命名菜品'
      const mainProtein = readString(recipe.mainProteinName)
      const categories = readStringArray(recipe.overlappingCategories)
      const ingredients = readStringArray(recipe.overlappingIngredientNames)
      const meta = [
        mainProtein ? `主蛋白 ${mainProtein}` : '',
        categories.length > 0 ? `分类 ${categoryLabels(categories)}` : '',
        ingredients.length > 0 ? `原料 ${ingredients.join('、')}` : ''
      ].filter(Boolean)
      lines.push(
        `· ${truncateText(name, 60)}${meta.length > 0 ? `：${meta.join('；')}` : ''}`
      )
    }
    if (recipes.length > 8) lines.push(`…还有 ${recipes.length - 8} 道`)
  }
  if (summary) lines.push(`结果：${truncateText(summary, 200)}`)
  return lines
}

function fallbackDetailLines(data: unknown, summary: string): string[] {
  const lines: string[] = []
  if (summary) lines.push(truncateText(summary, 260))

  if (Array.isArray(data)) {
    if (data.length === 0) {
      if (!summary) lines.push('（无返回数据）')
      return lines
    }
    lines.push(`共 ${data.length} 项：`)
    data.slice(0, 8).forEach((item, index) => {
      const record = asRecord(item)
      if (!record) {
        lines.push(`· ${truncateText(displayValue(item), 120)}`)
        return
      }
      const primary =
        readString(record.name) ||
        readString(record.label) ||
        readString(record.title) ||
        `第 ${index + 1} 项`
      const extra = Object.entries(record)
        .filter(
          ([key]) =>
            !['name', 'label', 'title', 'id', 'recipeId', 'ingredientId'].includes(
              key
            )
        )
        .slice(0, 4)
        .map(([key, value]) => `${fieldLabel(key)} ${displayValue(value)}`)
        .join('；')
      lines.push(
        `· ${truncateText(primary, 60)}${extra ? `（${truncateText(extra, 140)}）` : ''}`
      )
    })
    if (data.length > 8) lines.push(`…还有 ${data.length - 8} 项`)
    return lines
  }

  const record = asRecord(data)
  if (record) {
    const entries = Object.entries(record).filter(
      ([, value]) => value !== null && value !== undefined && value !== ''
    )
    for (const [key, value] of entries.slice(0, 14)) {
      if (Array.isArray(value) && value.some((item) => asRecord(item))) {
        lines.push(`${fieldLabel(key)}：共 ${value.length} 项`)
      } else {
        lines.push(`${fieldLabel(key)}：${displayValue(value)}`)
      }
    }
    if (entries.length > 14) {
      lines.push(`…另有 ${entries.length - 14} 个字段`)
    }
  } else if (typeof data === 'string' && data.trim()) {
    if (!summary || data.trim() !== summary) {
      lines.push(truncateText(data, 400))
    }
  }

  if (lines.length === 0) lines.push('（无返回数据）')
  return lines
}

function formatToolDetails(message: RecipeAgentMessage): string {
  const detail = readToolResultDetail(message)
  if (detail.errorMessage) {
    const label = TOOL_ERROR_LABELS[detail.errorCode]
    return `${label ? `执行失败（${label}）` : '执行失败'}：${truncateText(
      detail.errorMessage,
      300
    )}`
  }

  const toolName = (message.toolName ?? '').split('.').pop() ?? ''
  let lines: string[]
  switch (toolName) {
    case 'search_ingredients':
      lines = searchIngredientLines(detail.data, detail.summary)
      break
    case 'get_ingredient':
      lines = ingredientDetailLines(detail.data, detail.summary)
      break
    case 'add_ingredient':
    case 'replace_ingredient':
    case 'update_weight':
    case 'remove_ingredient':
      lines = ingredientChangeLines(
        toolName,
        detail.data,
        detail.args,
        detail.summary
      )
      break
    case 'run_assessment':
      lines = assessmentLines(detail.data, detail.summary)
      break
    case 'check_coverage':
      lines = coverageLines(detail.data, detail.summary)
      break
    case 'check_ready':
      lines = readyLines(detail.data, detail.summary)
      break
    case 'ask_user':
      lines = askUserLines(detail.data, detail.summary)
      break
    case 'request_exception':
      lines = requestExceptionLines(detail.data, detail.summary)
      break
    case 'finish_draft':
      lines = finishDraftLines(detail.data, detail.args, detail.summary)
      break
    case 'get_catalog_usage':
      lines = catalogUsageLines(detail.data, detail.summary)
      break
    default:
      lines = fallbackDetailLines(detail.data, detail.summary)
  }

  const text = lines.filter((line) => line !== '').join('\n')
  if (text.length <= TOOL_DETAIL_MAX_LENGTH) return text
  return `${text.slice(0, TOOL_DETAIL_MAX_LENGTH)}…\n（内容过长，已截断；完整内容见“查看原始数据”）`
}

function formatToolPayload(message: RecipeAgentMessage): string {
  const payload = message.toolResult ?? message.toolArgs ?? message.content
  if (payload === null || payload === undefined) return '（无返回）'
  const text =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text
}

watch(
  () => pendingQuestionSet.value?.key ?? null,
  () => {
    selectedAnswers.value = {}
  }
)

onBeforeUnmount(stopPolling)
</script>

<style scoped>
.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-header__title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.agent-header__mode {
  flex: none;
  font-size: 11px;
}

.agent-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.agent-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 0 0 8px;
  color: #909399;
  font-size: 12px;
}

.agent-meta__warning {
  color: #e6a23c;
  font-weight: 600;
}

.agent-conversation-shell {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

.agent-scroll-bottom {
  position: absolute;
  bottom: 10px;
  left: 50%;
  z-index: 3;
  transform: translateX(-50%);
  box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
}

.agent-task-status {
  flex-shrink: 0;
  margin: 0 0 8px;
  padding: 7px 10px;
  border-left: 3px solid #909399;
  border-radius: 6px;
  background: #f5f7fa;
}

.agent-task-status__headline {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.agent-task-status__hint {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: #606266;
}

.agent-task-status__continue {
  margin-top: 6px;
}

.agent-task-status--running {
  border-left-color: #e6a23c;
  background: #fdf6ec;
}

.agent-task-status--waiting_user {
  border-left-color: #e6a23c;
  background: #fdf6ec;
}

.agent-task-status--completed {
  border-left-color: #67c23a;
  background: #f0f9eb;
}

.agent-task-status--failed {
  border-left-color: #f56c6c;
  background: #fef0f0;
}

.agent-questions {
  flex-shrink: 0;
  max-height: 40vh;
  margin-bottom: 8px;
  padding: 10px;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}

.agent-questions__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-questions__title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.agent-question + .agent-question {
  margin-top: 8px;
}

.agent-question__text {
  font-size: 13px;
  line-height: 1.5;
  color: #303133;
}

.agent-question__options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.agent-question__options .el-button {
  margin-left: 0;
}

.agent-questions__hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}

.agent-conversation {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  border-radius: 8px;
  background: #f7f8fa;
}

.agent-message {
  display: flex;
  margin-bottom: 12px;
}

.agent-message--user {
  justify-content: flex-end;
}

.agent-message--assistant {
  justify-content: flex-start;
}

.agent-bubble {
  max-width: 86%;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-bubble--user {
  color: #fff;
  background: #409eff;
  border-bottom-right-radius: 3px;
}

/* AI 回答：独立卡片 + 小作者标签，和右侧蓝色用户气泡拉开层级 */
.agent-answer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 88%;
}

.agent-answer__author {
  align-self: flex-start;
  padding: 0 6px;
  border-radius: 4px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 18px;
}

.agent-answer .agent-bubble {
  max-width: 100%;
}

.agent-bubble--assistant {
  color: #303133;
  background: #fff;
  border: 1px solid #d9ecff;
  border-left: 3px solid #79bbff;
  border-bottom-left-radius: 3px;
}

/* 执行记录：整组默认折叠、灰底虚线，和 AI 回答明显区分 */
.agent-execution {
  margin-bottom: 12px;
}

.agent-execution__group {
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
  color: #909399;
  font-size: 12px;
}

.agent-execution__group > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  list-style: none;
}

.agent-execution__group > summary::-webkit-details-marker {
  display: none;
}

.agent-execution__group[open] > summary {
  border-bottom: 1px dashed #e4e7ed;
}

.agent-execution__title {
  color: #606266;
  font-weight: 600;
}

.agent-execution__title::before {
  display: inline-block;
  width: 12px;
  color: #a8abb2;
  content: '▸';
  font-size: 10px;
}

.agent-execution__group[open] .agent-execution__title::before {
  content: '▾';
}

.agent-execution__toggle {
  flex: none;
  color: #a8abb2;
  font-size: 11px;
}

.agent-execution__items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.agent-tool {
  padding: 6px 8px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
}

.agent-tool > summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
  list-style: none;
}

.agent-tool > summary::-webkit-details-marker {
  display: none;
}

.agent-tool > summary::before {
  flex: none;
  color: #c0c4cc;
  content: '▸';
  font-size: 10px;
}

.agent-tool[open] > summary::before {
  content: '▾';
}

.agent-tool__name {
  flex: none;
  color: #606266;
  font-weight: 600;
}

.agent-tool__summary {
  min-width: 0;
  overflow: hidden;
  color: #909399;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 执行步骤详情：先看中文人话，原始 JSON 收在二级折叠里（默认关闭） */
.agent-tool__detail {
  max-height: 320px;
  margin-top: 8px;
  overflow-y: auto;
  padding: 8px 9px;
  border-radius: 6px;
  background: #f8f9fb;
  color: #4b5563;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.agent-tool__raw {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px dashed #ebeef5;
}

.agent-tool__raw > summary {
  cursor: pointer;
  color: #a8abb2;
  font-size: 11px;
  line-height: 1.4;
  list-style: none;
}

.agent-tool__raw > summary::-webkit-details-marker {
  display: none;
}

.agent-tool__raw > summary::before {
  color: #c0c4cc;
  content: '▸ ';
  font-size: 9px;
}

.agent-tool__raw[open] > summary {
  color: #909399;
}

.agent-tool__raw[open] > summary::before {
  content: '▾ ';
}

.agent-tool__payload {
  max-height: 220px;
  margin: 6px 0 0;
  overflow: auto;
  padding: 8px;
  border-radius: 6px;
  background: #f5f7fa;
  color: #606266;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 交付确认卡：高亮左边框 + 浅绿底，只读展示交付摘要 */
.agent-delivery {
  flex: none;
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid #b3e19d;
  border-left: 4px solid #67c23a;
  border-radius: 8px;
  background: #f0f9eb;
  box-shadow: 0 1px 4px rgb(103 194 58 / 12%);
}

.agent-delivery__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.agent-delivery__title {
  color: #303133;
  font-size: 14px;
  font-weight: 700;
}

.agent-delivery__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  color: #909399;
  font-size: 11px;
  white-space: nowrap;
}

.agent-delivery__revision {
  color: #529b2e;
  font-weight: 600;
}

.agent-delivery__summary {
  margin: 8px 0 0;
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-delivery__sync {
  margin: 8px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.agent-error {
  margin-top: 8px;
}

.agent-approvals {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
}

.agent-approval {
  padding: 10px 12px;
  border: 1px solid #f3d19e;
  border-radius: 8px;
  background: #fdf6ec;
}

.agent-approval__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-approval__title {
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.agent-approval__reason {
  margin-top: 6px;
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-approval__detail {
  margin-top: 4px;
  color: #b88230;
  font-size: 12px;
  line-height: 1.6;
}

.agent-approval__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}

.agent-composer {
  padding-top: 10px;
}

.agent-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
}

.agent-hint {
  color: #a8abb2;
  font-size: 11px;
}

.agent-actions__buttons {
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .agent-conversation {
    padding: 8px;
  }

  .agent-bubble,
  .agent-answer {
    max-width: 100%;
  }

  .agent-delivery {
    padding: 10px 12px;
  }

  .agent-delivery__head {
    flex-direction: column;
    gap: 4px;
  }

  .agent-delivery__meta {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
  }

  .agent-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .agent-actions__buttons {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>

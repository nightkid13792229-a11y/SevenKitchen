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
                  <pre class="agent-tool__payload">{{ formatToolPayload(tool) }}</pre>
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

      <el-alert
        v-if="session?.lastError && !isLimitReached"
        class="agent-error"
        type="error"
        :closable="false"
        :title="session.lastError"
      />

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
        ? '交付卡见下方；可继续对话调整。'
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

.agent-tool__payload {
  max-height: 240px;
  margin: 8px 0 0;
  overflow: auto;
  padding: 8px;
  border-radius: 6px;
  background: #f5f7fa;
  color: #606266;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
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

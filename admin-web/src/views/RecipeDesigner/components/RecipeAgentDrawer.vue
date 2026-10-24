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
      </div>
    </template>

    <div class="agent-drawer">
      <div v-if="session" class="agent-meta">
        <span :class="{ 'agent-meta__warning': currentRunSteps >= 25 }">
          本次 {{ currentRunSteps }}/{{ MAX_RUN_STEPS }} 次工具调用 · 会话累计 {{ session.stepCount }}
        </span>
        <span>输入 {{ session.promptTokens }} / 输出 {{ session.completionTokens }} tokens</span>
      </div>

      <div ref="scrollRef" v-loading="loading" class="agent-conversation">
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
        <div
          v-if="deliveryWarnings.length > 0"
          class="agent-delivery__warnings"
        >
          <div class="agent-delivery__warnings-title">
            交付提醒（{{ deliveryWarnings.length }}）
          </div>
          <ol>
            <li v-for="(warning, index) in deliveryWarnings" :key="index">
              {{ warning }}
            </li>
          </ol>
        </div>
        <div class="agent-delivery__actions">
          <el-button
            plain
            :disabled="deliveryActionsDisabled"
            @click="rejectDelivery"
          >退回修改</el-button>
          <el-button
            type="primary"
            :disabled="deliveryActionsDisabled"
            @click="emit('publish')"
          >确认交付</el-button>
        </div>
      </section>

      <el-alert
        v-if="session?.lastError"
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

      <div class="agent-composer">
        <el-input
          ref="composerRef"
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
import type { InputInstance } from 'element-plus'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { formatDateTime } from '@/utils/date'
import type {
  RecipeAgentApproval,
  RecipeAgentDelivery,
  RecipeAgentMessage,
  RecipeAgentSession,
  RecipeAgentSessionStatus
} from '@/types/recipeDesigner'

const props = defineProps<{
  modelValue: boolean
  draftId: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'refresh'): void
  (event: 'publish'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const session = ref<RecipeAgentSession | null>(null)
const messages = ref<RecipeAgentMessage[]>([])
const approvals = ref<RecipeAgentApproval[]>([])
const delivery = ref<RecipeAgentDelivery | null>(null)
const input = ref('')
const loading = ref(false)
const sending = ref(false)
const stopping = ref(false)
const decidingApprovalId = ref<string | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref<InputInstance | null>(null)

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

const deliveryWarnings = computed<string[]>(() => {
  const warnings = delivery.value?.warnings
  if (!Array.isArray(warnings)) return []
  return warnings.filter((warning) => warning.trim().length > 0)
})
const deliveryActionsDisabled = computed(() => running.value || sending.value)
const waiting = computed(() => session.value?.status === 'WAITING_USER')
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
  session.value ? STATUS_LABELS[session.value.status] : '未开始'
)
const statusTagType = computed(() =>
  session.value ? STATUS_TAG_TYPES[session.value.status] : 'info'
)

const placeholder = computed(() => {
  if (running.value) return 'AI 正在设计，先停止才能接管…'
  if (waiting.value) return '回答 AI 的问题，或补充你的要求…'
  if (session.value?.status === 'COMPLETED') return '继续调整，或输入新的要求…'
  if (session.value?.status === 'STOPPED') return '已停止；输入新的要求可以重新开始…'
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

async function scrollToBottom() {
  await nextTick()
  const element = scrollRef.value
  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

async function loadSession(silent = false) {
  if (!props.draftId) return
  if (!silent) loading.value = true

  const previousStatus = session.value?.status
  const previousSessionId = session.value?.id
  const lastMessage = messages.value[messages.value.length - 1]
  const previousLastSeq = lastMessage ? lastMessage.seq : 0

  try {
    const view = await recipeDesignerApi.getAgentSession(props.draftId)
    session.value = view?.session ?? null
    messages.value = view?.messages ?? []
    approvals.value = view?.approvals ?? []
    delivery.value = view?.delivery ?? null

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

    await scrollToBottom()
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
  input.value = ''
  decidingApprovalId.value = null
  void loadSession()
}

function handleClosed() {
  stopPolling()
  emit('refresh')
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value || running.value) return

  sending.value = true
  try {
    if (session.value && waiting.value) {
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

/**
 * 退回修改：不直接驳回交付，而是把修改要求带进输入框。
 *
 * 会话已 COMPLETED 时，send() 会走 startAgentRun 开一轮新的运行；
 * 这里不自动发送，留给营养师补全具体要改什么。
 */
async function rejectDelivery() {
  if (!delivery.value || deliveryActionsDisabled.value) return
  input.value = '交付卡未通过，请调整：'
  await nextTick()
  composerRef.value?.focus()
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
  () => messages.value.length,
  () => {
    void scrollToBottom()
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

/* 交付确认卡：高亮左边框 + 浅绿底，是抽屉里唯一的前进动作 */
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

.agent-delivery__warnings {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #c2e7b0;
}

.agent-delivery__warnings-title {
  color: #b88230;
  font-size: 12px;
  font-weight: 600;
}

.agent-delivery__warnings ol {
  margin: 6px 0 0;
  padding-left: 20px;
  color: #606266;
  font-size: 12px;
  line-height: 1.7;
  word-break: break-word;
}

.agent-delivery__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.agent-delivery__actions .el-button + .el-button {
  margin-left: 0;
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

  .agent-delivery__actions {
    flex-direction: column;
  }

  .agent-delivery__actions .el-button {
    width: 100%;
    margin-left: 0;
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

<template>
  <el-drawer
    v-model="visible"
    :size="'480px'"
    :close-on-click-modal="false"
    class="recipe-agent-drawer"
    @open="handleOpen"
    @closed="handleClosed"
  >
    <template #header>
      <div class="agent-header">
        <div class="agent-header__title">
          <span>AI 食谱设计</span>
          <el-tag
            v-if="session"
            size="small"
            :type="statusTagType"
            effect="plain"
          >
            {{ statusLabel }}
          </el-tag>
        </div>
        <div v-if="draftName" class="agent-header__draft">{{ draftName }}</div>
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

        <div
          v-for="message in messages"
          :key="message.id"
          class="agent-message"
          :class="`agent-message--${message.role.toLowerCase()}`"
        >
          <template v-if="message.role === 'TOOL'">
            <details class="agent-tool">
              <summary>
                <span class="agent-tool__name">{{ message.toolName || '工具步骤' }}</span>
                <span class="agent-tool__summary">{{ toolSummary(message) }}</span>
              </summary>
              <pre class="agent-tool__payload">{{ formatToolPayload(message) }}</pre>
            </details>
          </template>

          <template v-else>
            <div class="agent-bubble" :class="`agent-bubble--${message.role.toLowerCase()}`">
              {{ message.content || '（空消息）' }}
            </div>
          </template>
        </div>
      </div>

      <el-alert
        v-if="session?.lastError"
        class="agent-error"
        type="error"
        :closable="false"
        :title="session.lastError"
      />

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
import type {
  RecipeAgentMessage,
  RecipeAgentSession,
  RecipeAgentSessionStatus
} from '@/types/recipeDesigner'

const props = defineProps<{
  modelValue: boolean
  draftId: string
  draftName?: string
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
const input = ref('')
const loading = ref(false)
const sending = ref(false)
const stopping = ref(false)
const scrollRef = ref<HTMLElement | null>(null)

let pollTimer: number | null = null

const MAX_RUN_STEPS = 30

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
const waiting = computed(() => session.value?.status === 'WAITING_USER')
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
  input.value = ''
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
  flex-direction: column;
  gap: 4px;
}

.agent-header__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.agent-header__draft {
  color: #909399;
  font-size: 12px;
}

.agent-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.agent-meta {
  display: flex;
  justify-content: space-between;
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

.agent-bubble--assistant {
  color: #303133;
  background: #fff;
  border: 1px solid #ebeef5;
  border-bottom-left-radius: 3px;
}

.agent-tool {
  width: 100%;
  padding: 8px 10px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
}

.agent-tool summary {
  display: flex;
  gap: 8px;
  align-items: baseline;
  cursor: pointer;
  list-style: none;
}

.agent-tool summary::-webkit-details-marker {
  display: none;
}

.agent-tool__name {
  flex: none;
  color: #606266;
  font-weight: 600;
}

.agent-tool__summary {
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

.agent-error {
  margin-top: 8px;
}

.agent-composer {
  padding-top: 10px;
}

.agent-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
</style>

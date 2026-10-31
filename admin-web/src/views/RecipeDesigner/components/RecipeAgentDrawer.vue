<template>
  <el-drawer
    v-model="visible"
    :size="'min(460px, 100%)'"
    :modal="false"
    :lock-scroll="false"
    :close-on-click-modal="false"
    class="agent-drawer"
    @open="handleOpen"
  >
    <template #header>
      <div class="agent-header">
        <span class="agent-header__title">AI 食谱设计</span>
        <el-tag v-if="session" size="small" :type="statusType" effect="plain">
          {{ statusLabel }}
        </el-tag>
      </div>
    </template>

    <div class="agent-body">
      <div ref="scrollRef" class="agent-messages" v-loading="loading">
        <el-empty
          v-if="!loading && messages.length === 0"
          :image-size="64"
          description="告诉它这份食谱是做什么的，它自己取数、自己评估。"
        />

        <div
          v-for="message in messages"
          :key="message.id"
          class="agent-row"
          :class="`agent-row--${message.role.toLowerCase()}`"
        >
          <template v-if="message.role === 'TOOL'">
            <details class="agent-tool">
              <summary>{{ message.toolName || '工具' }} · 执行记录</summary>
              <pre class="agent-tool__body">{{ message.content }}</pre>
            </details>
          </template>
          <template v-else>
            <span class="agent-who">{{ message.role === 'USER' ? '我' : 'AI' }}</span>
            <div class="agent-bubble">{{ message.content }}</div>
          </template>
        </div>
      </div>

      <div class="agent-compose">
        <el-input
          v-model="input"
          type="textarea"
          :rows="3"
          resize="none"
          :disabled="sending || running"
          :placeholder="running ? 'AI 正在设计…' : '例如：做个鸭肉低脂的成犬主食'"
          @keydown.enter.exact.prevent="send"
        />
        <div class="agent-compose__actions">
          <span class="agent-hint">
            {{ running ? '正在运行' : 'Enter 发送，Shift+Enter 换行' }}
          </span>
          <el-button
            v-if="running"
            size="small"
            type="danger"
            plain
            @click="stop"
          >停止</el-button>
          <el-button
            size="small"
            type="primary"
            :loading="sending"
            :disabled="!input.trim() || sending || running"
            @click="send"
          >发送</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  recipeDesignerApi,
  type AgentMessage,
  type AgentSession,
} from '@/api/recipeDesigner'

const props = defineProps<{ modelValue: boolean; draftId: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const session = ref<AgentSession | null>(null)
const messages = ref<AgentMessage[]>([])
const input = ref('')
const sending = ref(false)
const loading = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
let timer: number | null = null

const running = computed(() => session.value?.status === 'RUNNING')
const statusLabel = computed(() => {
  const status = session.value?.status
  if (status === 'RUNNING') return '运行中'
  if (status === 'WAITING_USER') return '等你回答'
  if (status === 'FAILED') return '失败'
  if (status === 'STOPPED') return '已停止'
  return '已结束'
})
const statusType = computed(() => {
  const status = session.value?.status
  if (status === 'RUNNING') return 'primary'
  if (status === 'FAILED') return 'danger'
  if (status === 'WAITING_USER') return 'warning'
  return 'info'
})

async function loadSession() {
  if (!props.draftId) return
  const result = await recipeDesignerApi.getAgentSession(props.draftId)
  session.value = result?.session ?? null
  messages.value = result?.messages ?? []
  await nextTick()
  scrollToBottom()
  syncTimer()
}

function syncTimer() {
  if (running.value && timer === null) {
    timer = window.setInterval(() => void loadSession(), 1500)
  }
  if (!running.value && timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value || running.value) return
  sending.value = true
  try {
    await recipeDesignerApi.startAgentRun(props.draftId, text)
    input.value = ''
    await loadSession()
  } finally {
    sending.value = false
  }
}

async function stop() {
  if (!session.value) return
  await recipeDesignerApi.stopAgentRun(session.value.id)
  await loadSession()
}

function handleOpen() {
  void loadSession()
}

function scrollToBottom() {
  const element = scrollRef.value
  if (element) element.scrollTop = element.scrollHeight
}

watch(
  () => props.draftId,
  () => {
    if (props.modelValue) void loadSession()
  },
)

watch(
  () => props.modelValue,
  (value) => {
    if (!value && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  },
)
</script>

<style scoped>
.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.agent-header__title {
  font-weight: 600;
}
.agent-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}
.agent-row {
  margin-bottom: 12px;
}
.agent-row--user {
  text-align: right;
}
.agent-who {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.agent-bubble {
  display: inline-block;
  max-width: 92%;
  padding: 8px 10px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-light);
  text-align: left;
}
.agent-row--user .agent-bubble {
  background: var(--el-color-primary-light-9);
}
.agent-tool {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.agent-tool__body {
  max-height: 160px;
  overflow: auto;
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.agent-compose {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 10px;
}
.agent-compose__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.agent-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

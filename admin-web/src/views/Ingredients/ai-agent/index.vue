<template>
  <div class="ai-agent-page">
    <header class="ai-agent-header">
      <div>
        <h2 class="ai-agent-header__title">AI 添加原料（Agent）</h2>
        <p class="ai-agent-header__subtitle">
          说一句话，AI 会在这份草稿上一步步查本地库、写营养字段、跑终检；
          每一轮调用了哪些工具、成功还是失败，都按顺序列在下面。
        </p>
      </div>
      <el-button text @click="goBackToList">返回原料列表</el-button>
    </header>

    <el-card class="agent-panel" shadow="never">
      <div class="agent-panel__head">
        <span class="agent-panel__dot" aria-hidden="true"></span>
        <b>Agent 运行</b>
        <span class="agent-panel__draft">
          草稿：<code>{{ state.draftId || '运行后创建' }}</code>
        </span>
      </div>

      <div ref="bodyRef" class="agent-panel__body">
        <el-empty
          v-if="state.runs.length === 0"
          description="还没有运行。输入一句话开始，例如「帮我加鸡肝」。"
          :image-size="72"
        />

        <div
          v-for="run in state.runs"
          :key="run.id"
          class="agent-run"
        >
          <div class="agent-run__ask">
            <span class="agent-run__role agent-run__role--me">你</span>
            <p class="agent-run__ask-text">{{ run.text }}</p>
          </div>

          <div v-if="run.error" class="agent-run__failure">
            <div class="agent-run__failure-head">
              <el-tag type="danger" size="small" effect="plain">失败</el-tag>
              <span>这一轮没有跑完</span>
            </div>
            <p class="agent-run__failure-text">{{ run.error }}</p>
          </div>

          <template v-else-if="run.result">
            <div class="agent-run__meta">
              <span>草稿 {{ run.result.draftId }}</span>
              <span>steps {{ run.result.steps }}</span>
              <span>{{ modeLabel(run.result.mode) }}</span>
              <span>工具调用 {{ run.steps.length }} 次</span>
            </div>

            <div v-if="run.steps.length > 0" class="agent-steps">
              <div
                v-for="(step, index) in run.steps"
                :key="index"
                class="agent-step"
                :class="{ 'agent-step--failed': !step.ok }"
              >
                <span class="agent-step__index">{{ index + 1 }}</span>
                <div class="agent-step__body">
                  <div class="agent-step__head">
                    <b class="agent-step__label">{{ step.label }}</b>
                    <span class="agent-step__summary">{{ step.summary }}</span>
                    <el-tag
                      size="small"
                      effect="plain"
                      :type="step.ok ? 'success' : 'danger'"
                    >
                      {{ step.ok ? '成功' : '失败' }}
                    </el-tag>
                  </div>
                  <p v-if="!step.ok" class="agent-step__error">
                    {{ step.error || '工具执行失败（后端没有给出原因）' }}
                  </p>
                </div>
              </div>
            </div>

            <p v-else class="agent-run__no-tools">
              这一轮没有调用工具，AI 直接回答了。
            </p>

            <div class="agent-run__reply">
              <span class="agent-run__role agent-run__role--ai">AI</span>
              <p class="agent-run__reply-text">{{ run.result.reply }}</p>
            </div>
          </template>
        </div>

        <div v-if="state.running" class="agent-typing">
          <span class="agent-typing__dot" aria-hidden="true"></span>
          AI 正在调用工具…
        </div>
      </div>

      <div class="agent-composer">
        <el-input
          v-model="inputText"
          :disabled="state.running"
          maxlength="500"
          placeholder="例如：帮我加鸡肝，按生档案补粗蛋白 19.5 g"
          @keyup.enter="handleRun"
        />
        <el-button
          type="primary"
          :loading="state.running"
          :disabled="!canRun"
          @click="handleRun"
        >
          {{ runButtonLabel }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import type { IngredientAgentRunResult } from '@/types/ingredientCreation'
import { toStepView, type AgentStepView } from './stepView'

/**
 * 最小可用的 Agent 页面：
 * - 第一轮不带 draftId（后端新建草稿），之后带上上一轮的 draftId 续聊；
 * - 每一轮按顺序展示工具调用（中文名 / 参数摘要 / 成败 / 错误原文），
 *   最后展示 AI 的 reply；
 * - 页面只负责展示与收集输入，工具循环全部在后端。
 */
interface AgentRunRecord {
  id: number
  text: string
  result: IngredientAgentRunResult | null
  steps: AgentStepView[]
  error: string | null
}

const router = useRouter()
const inputText = ref('')
const bodyRef = ref<HTMLElement | null>(null)
const state = reactive({
  running: false,
  /** 上一轮成功返回的草稿 id；为空表示下一轮会新建草稿。 */
  draftId: null as string | null,
  runs: [] as AgentRunRecord[]
})

let runSeq = 0

const canRun = computed(
  () => !state.running && inputText.value.trim().length > 0
)

const runButtonLabel = computed(() =>
  state.runs.length === 0 ? '开始' : '继续'
)

/** 后端两种协议的口径，按需求显示成 function calling / json。 */
function modeLabel(mode: IngredientAgentRunResult['mode']): string {
  return mode === 'JSON_ACTION' ? 'json' : 'function calling'
}

/**
 * 失败提示：优先原样使用后端返回的 message（503 的 AI 未启用 / 不可用、
 * 参数校验提示都在这里）；拿不到具体原因时才用兜底文案。
 */
function resolveErrorMessage(error: unknown): string {
  const raw = error as {
    message?: unknown
    response?: { data?: { message?: unknown } }
  } | null
  const backendMessage = raw?.response?.data?.message
  if (typeof backendMessage === 'string' && backendMessage.trim()) {
    return backendMessage.trim()
  }
  if (typeof raw?.message === 'string' && raw.message.trim()) {
    return raw.message.trim()
  }
  return '请求失败，请稍后重试。'
}

async function scrollToBottom() {
  await nextTick()
  const element = bodyRef.value
  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

watch(() => state.runs.length, scrollToBottom)
watch(() => state.running, scrollToBottom)
onMounted(scrollToBottom)

async function handleRun() {
  const text = inputText.value.trim()
  if (!text || state.running) {
    return
  }

  inputText.value = ''
  state.running = true
  // 用 reactive 包一层再入列：后面按引用更新这条记录时视图会跟着刷新。
  const run = reactive<AgentRunRecord>({
    id: ++runSeq,
    text,
    result: null,
    steps: [],
    error: null
  })
  state.runs.push(run)
  await scrollToBottom()

  try {
    const result = await ingredientCreationApi.runAgent({
      ...(state.draftId ? { draftId: state.draftId } : {}),
      text
    })
    run.result = result
    run.steps = toStepView(
      Array.isArray(result?.toolCalls) ? result.toolCalls : []
    )
    if (typeof result?.draftId === 'string' && result.draftId) {
      state.draftId = result.draftId
    }
  } catch (error) {
    run.error = resolveErrorMessage(error)
  } finally {
    state.running = false
    await scrollToBottom()
  }
}

function goBackToList() {
  void router.push('/ingredients')
}
</script>

<style scoped>
.ai-agent-page {
  max-width: 980px;
  margin: 0 auto;
}

.ai-agent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ai-agent-header__title {
  margin: 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
}

.ai-agent-header__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.agent-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 220px);
  min-height: 480px;
  max-height: 820px;
}

.agent-panel :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.agent-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.agent-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-success);
}

.agent-panel__draft {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.agent-panel__draft code {
  font-family: var(--el-font-family-mono, monospace);
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.agent-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--el-bg-color);
  scroll-behavior: smooth;
}

.agent-run {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-run__ask {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agent-run__role {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  line-height: 26px;
  text-align: center;
}

.agent-run__role--me {
  background: var(--el-color-primary);
  color: #fff;
}

.agent-run__role--ai {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.agent-run__ask-text {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  border-top-left-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.agent-run__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-left: 34px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 34px;
}

.agent-step {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.agent-step--failed {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}

.agent-step__index {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 20px;
  text-align: center;
}

.agent-step--failed .agent-step__index {
  background: var(--el-color-danger-light-7);
  color: var(--el-color-danger);
}

.agent-step__body {
  flex: 1;
  min-width: 0;
}

.agent-step__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.agent-step__label {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.agent-step__summary {
  font-size: 13px;
  color: var(--el-text-color-regular);
  word-break: break-word;
}

.agent-step__head :deep(.el-tag) {
  margin-left: auto;
}

.agent-step__error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-danger);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-run__no-tools {
  margin: 0;
  padding-left: 34px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-run__reply {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agent-run__reply-text {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 10px;
  border-top-left-radius: 4px;
  background: var(--el-color-primary-light-9);
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-run__failure {
  margin-left: 34px;
  padding: 10px 12px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 10px;
  background: var(--el-color-danger-light-9);
}

.agent-run__failure-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.agent-run__failure-text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-color-danger);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-typing {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-typing__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: agent-pulse 1s ease-in-out infinite;
}

@keyframes agent-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.agent-composer {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.agent-composer :deep(.el-input) {
  flex: 1;
}

.agent-composer :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.agent-composer :deep(.el-button) {
  border-radius: 8px;
}

@media (max-width: 900px) {
  .agent-panel {
    height: 560px;
  }

  .agent-panel__draft {
    max-width: 55%;
    text-align: right;
  }
}
</style>

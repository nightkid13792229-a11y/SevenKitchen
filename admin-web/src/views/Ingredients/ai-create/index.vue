<template>
  <div class="ai-create-page">
    <header class="ai-create-header">
      <div>
        <h2 class="ai-create-header__title">AI 添加原料</h2>
        <p class="ai-create-header__subtitle">
          第一步先判断你说的是食材还是补剂，判断完再决定走哪条添加线路。
        </p>
      </div>
      <el-button text @click="goBackToList">返回原料列表</el-button>
    </header>

    <div class="ai-create-grid">
      <el-card class="chat-panel" shadow="never">
        <div class="chat-panel__head">
          <span class="chat-panel__dot" aria-hidden="true"></span>
          <b>AI 助手</b>
          <span class="chat-panel__head-tag">添加原料</span>
        </div>

        <div ref="chatBodyRef" class="chat-panel__body">
          <div
            v-for="message in state.messages"
            :key="message.id"
            class="chat-message"
            :class="[
              `chat-message--${message.role}`,
              { 'chat-message--error': message.tone === 'error' }
            ]"
          >
            <div class="chat-bubble">
              <p class="chat-bubble__text">{{ message.text }}</p>
              <p v-if="message.hint" class="chat-bubble__hint">
                {{ message.hint }}
              </p>

              <div
                v-if="message.suggestions.length > 0"
                class="chat-suggestions"
              >
                <el-button
                  v-for="suggestion in message.suggestions"
                  :key="suggestion"
                  size="small"
                  round
                  plain
                  type="primary"
                  :disabled="state.sending"
                  @click="handleSuggestion(suggestion)"
                >
                  {{ suggestion }}
                </el-button>
              </div>

              <div v-if="message.tone === 'error'" class="chat-retry">
                <el-button
                  link
                  type="primary"
                  :disabled="state.sending"
                  @click="handleRetry"
                >
                  重试
                </el-button>
              </div>
            </div>
          </div>

          <div v-if="state.sending" class="chat-typing">
            <span class="chat-typing__dot" aria-hidden="true"></span>
            AI 正在判断…
          </div>
        </div>

        <div class="chat-composer">
          <el-input
            v-model="inputText"
            placeholder="输入原料名字…"
            maxlength="200"
            @keyup.enter="handleSend"
          />
          <el-button
            type="primary"
            :loading="state.sending"
            :disabled="!canSend"
            @click="handleSend"
          >
            发送
          </el-button>
        </div>
      </el-card>

      <el-card class="result-panel" shadow="never">
        <h3 class="result-panel__title">判断结果</h3>
        <p class="result-panel__subtitle">
          这里只判断一件事：你说的是食材，还是补剂。
        </p>

        <div v-if="state.correctingText" class="result-panel__correcting">
          <el-tag type="warning" size="small" effect="plain">正在纠正：{{ state.correctingText }}</el-tag>
        </div>

        <div class="route-card" :class="`route-card--${routeKind}`">
          <template v-if="routeKind === 'pending'">
            <el-tag type="info" size="small" effect="plain">待判断</el-tag>
            <b class="route-card__name">{{ pendingSubject }}</b>
            <p class="route-card__desc">{{ pendingHint }}</p>
          </template>

          <template v-else>
            <el-tag :type="routeTagType" size="small" effect="dark">
              {{ routeTitle }}
            </el-tag>
            <b class="route-card__name">{{ state.judgedText }}</b>
            <p class="route-card__desc">{{ routeDescription }}</p>
            <ol class="route-steps">
              <li v-for="step in routeSteps" :key="step">{{ step }}</li>
            </ol>
            <el-button class="route-card__next" disabled>
              下一步：{{ routeNextStep }}（还没做）
            </el-button>
          </template>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { createIntakeChat } from './chatState'

/**
 * 第一步只判断「食材还是补剂」：
 * - 左侧对话只负责收集一句话、展示后端回复与建议；
 * - 右侧只展示判定线路与后续步骤预览，不提交、不建表、不做终检。
 * 后续步骤（确定部位 / 形态等）还没做，按钮保持禁用。
 */
const router = useRouter()
const chat = createIntakeChat(ingredientCreationApi.classifyIntake)
const { state } = chat

const FOOD_STEPS = [
  '确定部位 / 加工态',
  '确定生熟与可食部',
  '去库里找营养词条',
  '补齐缺失 → 生成营养档案',
  '生成标准原料档案'
] as const

const SUPPLEMENT_STEPS = [
  '确定形态',
  '挑具体商品（iHerb / 亚马逊）',
  '读取标签 → 换算到每粒',
  '生成标准原料档案'
] as const

const inputText = ref('')
const chatBodyRef = ref<HTMLElement | null>(null)

const canSend = computed(
  () => !state.sending && inputText.value.trim().length > 0
)

const routeKind = computed<'pending' | 'food' | 'supplement'>(() => {
  if (state.kind === 'FOOD') return 'food'
  if (state.kind === 'SUPPLEMENT') return 'supplement'
  return 'pending'
})

const routeTagType = computed<'success' | 'warning'>(() =>
  state.kind === 'SUPPLEMENT' ? 'warning' : 'success'
)

const routeTitle = computed(() =>
  state.kind === 'SUPPLEMENT' ? '补剂线路' : '食材线路'
)

const routeDescription = computed(() =>
  state.kind === 'SUPPLEMENT'
    ? '已判断为补剂，走补剂线路。'
    : '已判断为食材，走食材线路。'
)

const routeSteps = computed<readonly string[]>(() =>
  state.kind === 'SUPPLEMENT' ? SUPPLEMENT_STEPS : FOOD_STEPS
)

const routeNextStep = computed(() =>
  state.kind === 'SUPPLEMENT' ? '确定形态' : '确定部位'
)

/** 待判断卡片：有输入就显示是哪句话，没输入就提示先输入。 */
const pendingSubject = computed(() => {
  const subject = state.judgedText || state.failedText
  return subject ? `「${subject}」` : '还没有输入'
})

const pendingHint = computed(() => {
  if (state.failedText && !state.judgedText) {
    return '这次判断没有成功，可以点上面气泡里的「重试」，或者换一种说法。'
  }
  if (state.judgedText) {
    return '还没判断出来。AI 会继续问你，补充一下形态或成分就行。'
  }
  return '说一个名字，我来判断它是食材还是补剂。'
})

async function scrollToBottom() {
  await nextTick()
  const element = chatBodyRef.value
  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

watch(() => state.messages.length, scrollToBottom)
watch(() => state.sending, scrollToBottom)
onMounted(scrollToBottom)

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || state.sending) {
    return
  }

  inputText.value = ''
  await chat.send(text)
}

async function handleSuggestion(text: string) {
  if (state.sending) {
    return
  }
  await chat.pickSuggestion(text)
}

async function handleRetry() {
  if (state.sending) {
    return
  }
  await chat.retry()
}

function goBackToList() {
  void router.push('/ingredients')
}
</script>

<style scoped>
.ai-create-page {
  max-width: 1180px;
  margin: 0 auto;
}

.ai-create-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ai-create-header__title {
  margin: 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
}

.ai-create-header__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.ai-create-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;
}

/* ---------- 左侧对话 ---------- */

.chat-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 220px);
  min-height: 480px;
  max-height: 760px;
}

.chat-panel :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.chat-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.chat-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-success);
}

.chat-panel__head-tag {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.chat-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--el-bg-color);
  scroll-behavior: smooth;
}

.chat-message {
  display: flex;
  max-width: 86%;
}

.chat-message--ai {
  align-self: flex-start;
}

.chat-message--me {
  align-self: flex-end;
  justify-content: flex-end;
}

.chat-bubble {
  padding: 10px 13px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}

.chat-message--ai .chat-bubble {
  border: 1px solid var(--el-color-primary-light-7);
  border-top-left-radius: 4px;
  background: var(--el-color-primary-light-9);
  color: var(--el-text-color-primary);
}

.chat-message--me .chat-bubble {
  border-top-right-radius: 4px;
  background: var(--el-color-primary);
  color: #fff;
}

.chat-message--error .chat-bubble {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}

.chat-bubble__text {
  margin: 0;
  white-space: pre-wrap;
}

.chat-bubble__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.chat-suggestions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.chat-retry {
  margin-top: 6px;
}

.chat-retry :deep(.el-button) {
  height: auto;
  padding: 0;
  font-size: 12px;
}

.chat-typing {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chat-typing__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: chat-pulse 1s ease-in-out infinite;
}

@keyframes chat-pulse {
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

.chat-composer {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.chat-composer :deep(.el-input) {
  flex: 1;
}

.chat-composer :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.chat-composer :deep(.el-button) {
  border-radius: 8px;
}

/* ---------- 右侧判断结果 ---------- */

.result-panel :deep(.el-card__body) {
  padding: 18px;
}

.result-panel__title {
  margin: 0;
  font-size: 16px;
  color: var(--el-text-color-primary);
}

.result-panel__subtitle {
  margin: 6px 0 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.result-panel__correcting {
  margin: -4px 0 12px;
}

.route-card {
  min-height: 120px;
  padding: 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  text-align: center;
}

.route-card--food {
  border: 1px solid var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
  color: var(--el-text-color-primary);
  text-align: left;
}

.route-card--supplement {
  border: 1px solid var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
  color: var(--el-text-color-primary);
  text-align: left;
}

.route-card__name {
  display: block;
  margin-top: 10px;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.route-card--pending .route-card__name {
  color: var(--el-text-color-regular);
}

.route-card__desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.route-steps {
  margin: 12px 0 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--el-text-color-regular);
}

.route-card__next {
  width: 100%;
  margin-top: 14px;
}

@media (max-width: 900px) {
  .ai-create-grid {
    grid-template-columns: 1fr;
  }

  .chat-panel {
    height: 520px;
  }
}
</style>

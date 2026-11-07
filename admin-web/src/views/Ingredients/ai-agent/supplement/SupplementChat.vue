<template>
  <div class="chat">
    <div class="chat__head">
      <span class="chat__dot"></span>
      <b>Agent 运行</b>
      <span class="chat__tag">{{ busy ? '在忙' : '待命' }}</span>
    </div>

    <div ref="bodyRef" class="chat__body">
      <div v-if="messages.length === 0" class="chat__empty">
        说一句就开始。比如：<br />
        「给狗狗加个锌」<br />
        「帮我看看这两瓶哪个划算」<br />
        也可以直接把商品链接贴进来。
      </div>

      <div
        v-for="(item, index) in messages"
        :key="index"
        class="chat__row"
        :class="`chat__row--${item.role}`"
      >
        <div class="chat__bubble">
          <p class="chat__text">{{ item.text }}</p>

          <p v-if="item.question" class="chat__question">{{ item.question }}</p>

          <div v-if="item.options && item.options.length > 0" class="chat__options">
            <button
              v-for="option in item.options"
              :key="option"
              type="button"
              class="chat__option"
              :disabled="busy"
              @click="send(option)"
            >
              {{ option }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="chat__composer">
      <el-input
        v-model="input"
        type="textarea"
        :rows="2"
        resize="none"
        placeholder="说一句，例如「给狗狗加个锌」"
        @keydown.enter.exact.prevent="send()"
      />
      <el-button type="primary" :loading="busy" @click="send()">发送</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ingredientCreationApi } from '@/api/ingredientCreation'

/**
 * 补剂 Agent 的对话面板。
 *
 * 它只做三件事：把话发出去、把回复摆出来、把模型改过的草稿交回给页面。
 * **不解释、不翻译动作**——模型想干什么由它自己决定，页面只负责照做与显示。
 */
interface ChatMessage {
  role: 'me' | 'ai'
  text: string
  question?: string
  options?: string[]
}

const props = defineProps<{
  draft: Record<string, unknown>
}>()

const emit = defineEmits<{
  (
    event: 'apply-draft',
    value: { draft: Record<string, unknown>; applied: string[] }
  ): void
}>()

const messages = ref<ChatMessage[]>([])
const input = ref('')
const busy = ref(false)
const bodyRef = ref<HTMLElement | null>(null)

function push(message: ChatMessage): void {
  messages.value.push(message)
  void nextTick(() => {
    const el = bodyRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

function recentHistory(): { role: 'user' | 'assistant'; text: string }[] {
  return messages.value.slice(-9, -1).map((item) => ({
    role: item.role === 'me' ? ('user' as const) : ('assistant' as const),
    text: item.text
  }))
}

async function send(text?: string): Promise<void> {
  const message = (text ?? input.value).trim()
  if (!message || busy.value) {
    return
  }
  input.value = ''
  push({ role: 'me', text: message })
  const history = recentHistory()

  busy.value = true
  try {
    const result = await ingredientCreationApi.supplementChat({
      message,
      history,
      draft: { ...props.draft }
    })
    push({
      role: 'ai',
      text: result.reply,
      question: result.question?.question,
      options: result.question?.options ?? []
    })
    emit('apply-draft', {
      draft: result.draft ?? {},
      applied: result.applied ?? []
    })
  } catch {
    push({ role: 'ai', text: '这句话没办成，稍后再试一次，或者直接手动填。' })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: #fff;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
}
.chat__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f1f3;
  font-size: 13px;
}
.chat__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #14b8a6;
}
.chat__tag {
  margin-left: auto;
  font-size: 11px;
  color: #8a9099;
}
.chat__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat__empty {
  font-size: 12px;
  line-height: 1.8;
  color: #9aa2ab;
}
.chat__row {
  display: flex;
}
.chat__row--me {
  justify-content: flex-end;
}
.chat__bubble {
  max-width: 90%;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f5f6f8;
}
.chat__row--me .chat__bubble {
  background: #3370ff;
}
.chat__row--me .chat__text {
  color: #fff;
}
.chat__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.chat__question {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
}
.chat__options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.chat__option {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #d5d9de;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
}
.chat__option:hover:not(:disabled) {
  border-color: #3370ff;
  color: #3370ff;
}
.chat__composer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #f0f1f3;
  align-items: flex-end;
}
</style>

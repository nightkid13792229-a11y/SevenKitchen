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
        「每份 2 粒」<br />
        也可以直接把商品链接贴进来。
      </div>

      <div v-for="(item, index) in messages" :key="index" class="chat__row" :class="`chat__row--${item.role}`">
        <div class="chat__bubble">
          <p class="chat__text">{{ item.text }}</p>

          <div v-if="item.candidates && item.candidates.length > 0" class="chat__candidates">
            <button
              v-for="(candidate, candidateIndex) in item.candidates"
              :key="candidate.url"
              type="button"
              class="chat__candidate"
              :data-candidate="candidateIndex"
              :disabled="busy || item.stale"
              @click="pickCandidate(index, candidateIndex)"
            >
              <span class="chat__candidate-name">{{ candidate.name }}</span>
              <span class="chat__candidate-meta">
                {{ candidate.priceUsd === null ? '价格未读到' : `$${candidate.priceUsd}` }}
              </span>
            </button>
            <span v-if="item.stale" class="chat__stale">这批已经作废（你又搜了一次）</span>
          </div>
        </div>
      </div>
    </div>

    <div class="chat__foot">
      <el-input
        v-model="input"
        size="default"
        placeholder="说一句，例如「给狗狗加个锌」"
        :disabled="busy"
        data-chat-input
        @keyup.enter="send"
      />
      <el-button type="primary" :loading="busy" data-chat-send @click="send">发送</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import type {
  SupplementCandidateDto,
  SupplementChatActionDto,
  SupplementLinkPreviewDto
} from '@/types/ingredientCreation'

/**
 * 补剂线的对话栏。
 *
 * 它只做两件事：把话发出去、把回来的动作**真的执行**。
 * 动作的执行都落到工作台提供的回调上（填表、改每份粒数）——
 * 聊天不直接改数据，免得以后两处各改一份。
 */
interface ChatMessage {
  role: 'me' | 'ai'
  text: string
  candidates?: SupplementCandidateDto[]
  /** 又搜了一批之后，上一批就作废：还能看，但不能再点 */
  stale?: boolean
}

const props = defineProps<{
  draftName: string
  servingUnitsPerDose: number | null
}>()

const emit = defineEmits<{
  (event: 'prefill', patch: SupplementLinkPreviewDto): void
  (event: 'set-serving-units', value: number): void
}>()

const messages = ref<ChatMessage[]>([])
const input = ref('')
const busy = ref(false)
const bodyRef = ref<HTMLElement | null>(null)

/** 对话里已经摆出来的候选，按显示顺序；「第二个」指的就是这里。 */
const candidatePool = ref<SupplementCandidateDto[]>([])
const candidateNames = computed(() => candidatePool.value.map((item) => item.name))

function push(message: ChatMessage): void {
  messages.value.push(message)
  void nextTick(() => {
    bodyRef.value?.scrollTo({ top: bodyRef.value.scrollHeight, behavior: 'smooth' })
  })
}

async function send(): Promise<void> {
  const text = input.value.trim()
  if (!text || busy.value) {
    return
  }
  input.value = ''
  push({ role: 'me', text })
  busy.value = true
  try {
    const result = await ingredientCreationApi.supplementChat({
      message: text,
      draft: {
        name: props.draftName,
        servingUnitsPerDose: props.servingUnitsPerDose,
        candidateNames: candidateNames.value
      }
    })
    push({ role: 'ai', text: result.reply })
    for (const action of result.actions) {
      await runAction(action)
    }
  } catch (error) {
    push({ role: 'ai', text: apiErrorMessage(error) })
  } finally {
    busy.value = false
  }
}

async function runAction(action: SupplementChatActionDto): Promise<void> {
  if (action.type === 'SEARCH_CANDIDATES') {
    await search(action.keyword)
    return
  }
  if (action.type === 'READ_LINK') {
    await readLink(action.url)
    return
  }
  if (action.type === 'PICK_CANDIDATE') {
    const candidate = candidatePool.value[action.index]
    if (candidate) {
      await readLink(candidate.url)
    }
    return
  }
  if (action.field === 'servingUnitsPerDose') {
    emit('set-serving-units', action.value)
  }
  // 以后后端多出别的字段时，这里不会把值错写到每份粒数上

}

async function search(keyword: string): Promise<void> {
  try {
    const found = await ingredientCreationApi.searchSupplementCandidates(keyword)
    // 新的一批来了，之前的卡片全部作废——否则「第二个」会指到用户已经忘掉的那批
    for (const message of messages.value) {
      if (message.candidates) {
        message.stale = true
      }
    }
    candidatePool.value = found
    if (found.length === 0) {
      push({ role: 'ai', text: `没搜到「${keyword}」的候选。换个说法，或者直接把商品链接贴进来。` })
      return
    }
    push({
      role: 'ai',
      text: `找到 ${found.length} 个候选，点一个我就去读它的标签：`,
      candidates: found
    })
  } catch (error) {
    push({ role: 'ai', text: apiErrorMessage(error) })
  }
}

async function readLink(url: string): Promise<void> {
  try {
    const preview = await ingredientCreationApi.previewSupplementLink(url)
    emit('prefill', preview)
    const filled = preview.nutrients.length
    push({
      role: 'ai',
      text:
        filled > 0
          ? `读到了：每份 ${preview.servingUnitsPerDose ?? '?'} ${'粒'}，认出 ${filled} 个营养素，已经填到右边。请你核对。`
          : '页面读到了，但没认出成分表。可以照标签手填，或者换个链接。'
    })
  } catch (error) {
    push({ role: 'ai', text: apiErrorMessage(error) })
  }
}

async function pickCandidate(messageIndex: number, candidateIndex: number): Promise<void> {
  if (busy.value) {
    return
  }
  const message = messages.value[messageIndex]
  const candidate = message?.candidates?.[candidateIndex]
  if (!candidate || message?.stale) {
    return
  }
  busy.value = true
  push({ role: 'me', text: `就它：${candidate.name}` })
  try {
    await readLink(candidate.url)
  } finally {
    busy.value = false
  }
}

function apiErrorMessage(error: unknown): string {
  const body = (error as { response?: { data?: { message?: unknown } } })?.response?.data
  const message = body?.message
  if (typeof message === 'string' && message.trim()) {
    return message
  }
  if (Array.isArray(message) && message.length > 0) {
    return message.join('；')
  }
  return '这句话没办成，稍后再试'
}


</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  overflow: hidden;
}
.chat__head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-bottom: 1px solid #eef0f3;
  font-size: 13px;
  background: #fbfcfd;
}
.chat__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #0f8a5f;
}
.chat__tag {
  margin-left: auto;
  font-size: 11px;
  color: #8a9099;
}
.chat__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fbfcfd;
}
.chat__empty {
  font-size: 12px;
  color: #9aa2ab;
  line-height: 1.9;
}
.chat__row {
  display: flex;
}
.chat__row--me {
  justify-content: flex-end;
}
.chat__bubble {
  max-width: 92%;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.6;
}
.chat__row--me .chat__bubble {
  background: #3370ff;
  color: #fff;
  border-bottom-right-radius: 3px;
}
.chat__row--ai .chat__bubble {
  background: #fff;
  border: 1px solid #e3e6ea;
  border-bottom-left-radius: 3px;
}
.chat__text {
  margin: 0;
  white-space: pre-wrap;
}
.chat__candidates {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.chat__candidate {
  display: flex;
  align-items: baseline;
  gap: 8px;
  text-align: left;
  border: 1px solid #dbe3ef;
  background: #f7faff;
  border-radius: 6px;
  padding: 6px 9px;
  font-size: 12px;
  cursor: pointer;
}
.chat__candidate:hover:not(:disabled) {
  border-color: #3370ff;
}
.chat__candidate:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.chat__stale {
  font-size: 11px;
  color: #9aa2ab;
}
.chat__candidate-name {
  flex: 1;
  color: #1f2329;
}
.chat__candidate-meta {
  color: #8a9099;
  font-size: 11.5px;
}
.chat__foot {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #eef0f3;
  background: #fff;
}
</style>

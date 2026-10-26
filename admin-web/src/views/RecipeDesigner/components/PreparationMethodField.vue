<template>
  <div class="preparation-method-field" :title="text">
    <el-autocomplete
      v-model="text"
      class="preparation-method-input"
      size="small"
      :fetch-suggestions="fetchSuggestions"
      :select-when-unmatched="true"
      :debounce="0"
      :tabindex="tabindex"
      :placeholder="placeholder"
      maxlength="20"
      clearable
      @select="handleSelect"
      @change="handleChange"
      @focus="handleFocus"
      @blur="handleBlur"
      @clear="handleClear"
    >
      <template #default="{ item }">
        <span class="preparation-method-suggestion">{{ item.value }}</span>
      </template>
    </el-autocomplete>
    <div
      class="preparation-method-count"
      :class="{ 'is-over': contentLength > PREPARATION_METHOD_MAX_CONTENT_LENGTH }"
    >
      {{ contentLength }}/{{ PREPARATION_METHOD_MAX_CONTENT_LENGTH }} 字（不含符号）
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { recipeApi } from '@/api/recipes'
import { PREPARATION_FIELD_PLACEHOLDER } from '@/constants/preparationField'
import {
  PREPARATION_METHOD_MAX_CONTENT_LENGTH,
  countPreparationMethodContentCharacters,
  resolvePreparationHistorySuggestions,
  resolvePreparationMethodCommitText,
  resolvePreparationMethodDisplayText
} from '@/utils/recipeDesigner/preparationMethodField'

/**
 * 部位 / 状态 / 预处理输入框（2026-10-26 重构）。
 *
 * - 当前文案直接放在输入框里，点进去就能改；
 * - 下拉建议来自该原料的历史文案（橱窗 + 当前有效交付定制），最多 3 条；
 * - 不再从字典选项里选，也不再保存字典 id；
 * - 回车、点建议、失焦都会提交；黄字状态提示由父组件负责。
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    label?: string | null
    ingredientId?: string | null
    placeholder?: string
    tabindex?: string | number
  }>(),
  {
    modelValue: '',
    label: '',
    ingredientId: '',
    placeholder: PREPARATION_FIELD_PLACEHOLDER,
    tabindex: -1
  }
)

const emit = defineEmits<{
  (event: 'change', value: string | null): void
}>()

interface PreparationMethodSuggestion {
  value: string
}

/**
 * 历史文案缓存：同一原料在设计器里可能有多行，避免每行聚焦都请求一次。
 * 只缓存成功结果；失败不缓存，下次聚焦可以重试。
 */
const historyCache = new Map<string, string[]>()

const text = ref(
  resolvePreparationMethodDisplayText(props.modelValue, props.label)
)
const contentLength = computed(() =>
  countPreparationMethodContentCharacters(text.value)
)
const committedText = ref(text.value)
const lastCommittedValue = ref<string | null>(
  props.modelValue ? String(props.modelValue) : null
)
const editing = ref(false)
const focusText = ref(text.value)
const historyTexts = ref<string[]>([])

watch(
  () => [props.modelValue, props.label] as const,
  ([value, label]) => {
    if (editing.value) return
    const nextText = resolvePreparationMethodDisplayText(value, label)
    text.value = nextText
    committedText.value = nextText
    lastCommittedValue.value = value ? String(value) : null
  }
)

async function loadHistory() {
  const ingredientId = String(props.ingredientId ?? '').trim()
  if (!ingredientId) {
    historyTexts.value = []
    return
  }

  const cached = historyCache.get(ingredientId)
  if (cached) {
    historyTexts.value = cached
    return
  }

  try {
    const items = await recipeApi.getIngredientPreparationMethodHistory(
      ingredientId,
      3
    )
    const texts = (items ?? [])
      .map((item) => String(item.text ?? '').trim())
      .filter(Boolean)
      .slice(0, 3)
    historyCache.set(ingredientId, texts)
    historyTexts.value = texts
  } catch {
    historyTexts.value = []
  }
}

async function fetchSuggestions(
  query: string,
  callback: (items: PreparationMethodSuggestion[]) => void
) {
  await loadHistory()
  callback(
    resolvePreparationHistorySuggestions(historyTexts.value, query, 3).map(
      (value) => ({ value })
    )
  )
}

function commitText() {
  // 超出 10 个内容字符时不提交，保留输入让用户自己删；
  // 后端 DTO 也会再校验一次。
  if (contentLength.value > PREPARATION_METHOD_MAX_CONTENT_LENGTH) return
  const commit = resolvePreparationMethodCommitText(text.value)
  text.value = commit.text
  focusText.value = commit.text
  committedText.value = commit.text

  if (commit.value === lastCommittedValue.value) {
    return
  }

  lastCommittedValue.value = commit.value
  emit('change', commit.value)
}

function handleSelect(item: PreparationMethodSuggestion) {
  // 历史建议是整句文案，直接替换整段，不按段拼接。
  text.value = String(item?.value ?? text.value)
  commitText()
}

function handleChange() {
  // 原生 change 在失焦时触发；文字没变就不重复保存。
  if (normalize(text.value) === normalize(focusText.value)) return
  commitText()
}

function handleFocus() {
  editing.value = true
  focusText.value = text.value
  void loadHistory()
}

function handleBlur() {
  editing.value = false
  if (normalize(text.value) === normalize(focusText.value)) {
    text.value = committedText.value
    return
  }
  commitText()
}

function handleClear() {
  text.value = ''
  committedText.value = ''
  focusText.value = ''
  if (lastCommittedValue.value === null) return
  lastCommittedValue.value = null
  emit('change', null)
}

function normalize(value: string) {
  return resolvePreparationMethodCommitText(value).text
}
</script>

<style scoped>
.preparation-method-field {
  width: 240px;
  max-width: 100%;
  flex: 0 0 auto;
}
.preparation-method-count {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.3;
  color: #909399;
}
.preparation-method-count.is-over {
  color: #f56c6c;
}
.preparation-method-field :deep(.el-autocomplete) {
  width: 100%;
}
.preparation-method-suggestion {
  display: inline-block;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

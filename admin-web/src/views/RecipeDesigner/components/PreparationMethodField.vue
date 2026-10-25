<template>
  <div class="preparation-method-field" :title="text" @input="handleNativeInput">
    <el-autocomplete
      v-model="text"
      class="preparation-method-input"
      size="small"
      :fetch-suggestions="fetchSuggestions"
      :select-when-unmatched="true"
      :debounce="0"
      :tabindex="tabindex"
      :placeholder="placeholder"
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  applyPreparationMethodSuggestion,
  filterPreparationMethodOptions,
  resolvePreparationMethodCommitText,
  resolvePreparationMethodDisplayText,
  type PreparationMethodOption
} from '@/utils/recipeDesigner/preparationMethodField'

/**
 * 预处理方式输入框（2026-10-26）。
 *
 * 原来的 el-select 只有在输入后按回车才保存，点开时输入框还是空的 ——
 * AI 写进整句预处理后，用户没法直接改那句话，只能整句重打。
 *
 * 这里改成「输入框 + 字典建议」：
 * - 当前文案直接放在输入框里，点进去就能改；
 * - 回车、点建议、失焦都会提交；
 * - 与字典名称完全一致时保存字典 id，其余保存自由文本。
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    label?: string | null
    options?: PreparationMethodOption[]
    placeholder?: string
    tabindex?: string | number
  }>(),
  {
    modelValue: '',
    label: '',
    options: () => [],
    placeholder: '选择或输入',
    tabindex: -1
  }
)

const emit = defineEmits<{
  (event: 'change', value: string | null): void
}>()

interface PreparationMethodSuggestion {
  value: string
  id?: string
}

const text = ref(
  resolvePreparationMethodDisplayText(
    props.modelValue,
    props.label,
    props.options
  )
)
const committedText = ref(text.value)
const lastCommittedValue = ref<string | null>(
  props.modelValue ? String(props.modelValue) : null
)
const editing = ref(false)
const focusText = ref(text.value)
// 最近一次真实输入的文字：autocomplete 选中建议时会先把 v-model 改成建议值，
// 这里保留选中前的输入，才能只替换最后一段、不吞掉前面的预处理。
const typedText = ref(text.value)

watch(
  () => [props.modelValue, props.label, props.options] as const,
  ([value, label, options]) => {
    if (editing.value) return
    const nextText = resolvePreparationMethodDisplayText(value, label, options)
    text.value = nextText
    committedText.value = nextText
    lastCommittedValue.value = value ? String(value) : null
    typedText.value = nextText
  }
)

function handleNativeInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (target?.tagName === 'INPUT') {
    typedText.value = target.value
  }
}

function fetchSuggestions(
  query: string,
  callback: (items: PreparationMethodSuggestion[]) => void
) {
  callback(
    filterPreparationMethodOptions(props.options, query).map((option) => ({
      value: option.name,
      id: option.id
    }))
  )
}

function commitText() {
  const commit = resolvePreparationMethodCommitText(text.value, props.options)
  text.value = commit.text
  focusText.value = commit.text
  committedText.value = commit.text
  typedText.value = commit.text

  if (commit.value === lastCommittedValue.value) {
    return
  }

  lastCommittedValue.value = commit.value
  emit('change', commit.value)
}

function handleSelect(item: PreparationMethodSuggestion) {
  // 字典建议只替换最后一段；回车提交自由文本时没有 id，保持整段原文。
  const baseText = typedText.value || text.value
  text.value = item?.id
    ? applyPreparationMethodSuggestion(baseText, item.value)
    : String(item?.value ?? baseText)
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
  typedText.value = text.value
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
  typedText.value = ''
  if (lastCommittedValue.value === null) return
  lastCommittedValue.value = null
  emit('change', null)
}

function normalize(value: string) {
  return resolvePreparationMethodCommitText(value, props.options).text
}
</script>

<style scoped>
.preparation-method-field {
  width: 138px;
  flex: 0 0 auto;
}
.preparation-method-field :deep(.el-autocomplete) {
  width: 100%;
}
.preparation-method-suggestion {
  display: inline-block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

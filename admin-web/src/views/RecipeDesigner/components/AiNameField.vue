<template>
  <div class="ai-name-field">
    <div class="name-line">
      <el-input
        :model-value="modelValue"
        :placeholder="placeholder || '例如：均衡营养｜三文鱼南瓜'"
        clearable
        @update:model-value="(value: string) => emit('update:modelValue', value)"
      />
      <span class="counter" :class="{ over: isOverLimit }">
        {{ length }} / {{ RECIPE_NAME_MAX_LENGTH }}
      </span>
      <el-button
        class="ai-btn"
        :disabled="!available || !seriesId"
        :loading="generating"
        :title="available ? '' : 'AI 命名服务未配置'"
        @click="generate"
      >
        ✦ AI 生成
      </el-button>
    </div>

    <div v-if="isOverLimit" class="over-tip">
      超过 {{ RECIPE_NAME_MAX_LENGTH }} 个字，保存不了——标签是一行不换行的，多一个字印不下。
    </div>

    <div v-if="candidates.length > 0" class="ai-panel">
      <div class="ai-head">
        <span class="tag">AI</span>
        <span>{{ candidates.length }} 条候选</span>
        <span class="redo" @click="generate">换一批</span>
      </div>

      <div
        v-for="candidate in candidates"
        :key="candidate.name"
        class="cand"
        :class="{ picked: candidate.name === modelValue }"
      >
        <div class="cand-main">
          <div class="cand-name">{{ candidate.name }}</div>
          <div class="cand-reason">{{ candidate.reason }}</div>
          <div v-if="candidate.complianceWarning" class="cand-warn">
            这句话合规存疑，用之前请自己看一眼
          </div>
        </div>
        <span class="cand-len">{{ countLength(candidate.name) }} 字</span>
        <el-button size="small" text type="primary" @click="use(candidate.name)">
          采用
        </el-button>
      </div>

      <div class="ai-note">采用后仍可直接改字；只改名字，不会动配方和分类。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  RECIPE_NAME_MAX_LENGTH,
  recipeNamingApi,
  type RecipeNameCandidate
} from '@/api/recipeNaming'

const props = defineProps<{
  modelValue: string
  seriesId: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const available = ref(true)
const generating = ref(false)
const candidates = ref<RecipeNameCandidate[]>([])

/** 按"字"数，与后端同一口径：中文、数字、符号都算 1 个字 */
function countLength(value: string): number {
  return [...(value || '').trim()].length
}

const length = computed(() => countLength(props.modelValue))
const isOverLimit = computed(() => length.value > RECIPE_NAME_MAX_LENGTH)

onMounted(async () => {
  try {
    const result = await recipeNamingApi.availability()
    // 只有后端明确说"不可用"才置灰；拿不到答案（401/网络错误）时保持可点，
    // 让用户点下去看到真正的错误，而不是面对一个不解释原因的灰按钮。
    available.value = result.available
  } catch {
    available.value = true
  }
})

async function generate() {
  if (!props.seriesId || generating.value) return
  generating.value = true
  try {
    const result = await recipeNamingApi.candidates(props.seriesId)
    // 超长的直接丢掉，不截断：截断会造出一个意思不通的名字
    candidates.value = (result.candidates || []).filter(
      (item) => countLength(item.name) <= RECIPE_NAME_MAX_LENGTH
    )
    if (candidates.value.length === 0) {
      ElMessage.warning('AI 没给出可用的名字（可能都超了 12 字），再试一次')
    }
  } catch (error: any) {
    ElMessage.error(error?.message || 'AI 生成失败，请重试')
  } finally {
    generating.value = false
  }
}

function use(name: string) {
  emit('update:modelValue', name)
}
</script>

<style scoped>
.ai-name-field {
  width: 100%;
}
.name-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.counter {
  font-size: 11px;
  color: #a8b0bb;
  white-space: nowrap;
  min-width: 46px;
  text-align: right;
}
.counter.over {
  color: #f56c6c;
  font-weight: 600;
}
.ai-btn {
  white-space: nowrap;
}
.over-tip {
  margin-top: 4px;
  font-size: 11px;
  color: #f56c6c;
}
.ai-panel {
  margin-top: 10px;
  border: 1px solid #dbe6ff;
  background: #f7f9ff;
  border-radius: 6px;
  padding: 10px 12px;
}
.ai-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: #55617a;
  margin-bottom: 8px;
}
.ai-head .tag {
  background: #e8efff;
  color: #4a6bd8;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 10.5px;
}
.ai-head .redo {
  margin-left: auto;
  color: #4a6bd8;
  cursor: pointer;
}
.cand {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fff;
  border: 1px solid #e3eaf8;
  border-radius: 5px;
  padding: 8px 10px;
  margin-bottom: 6px;
}
.cand.picked {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}
.cand-main {
  flex: 1;
  min-width: 0;
}
.cand-name {
  font-size: 13px;
  font-weight: 600;
}
.cand-reason {
  font-size: 10.5px;
  color: #97a1ad;
  margin-top: 2px;
}
.cand-warn {
  font-size: 10.5px;
  color: #e6a23c;
  margin-top: 3px;
}
.cand-len {
  font-size: 10.5px;
  color: #a8b0bb;
  white-space: nowrap;
  line-height: 22px;
}
.ai-note {
  font-size: 10.5px;
  color: #97a1ad;
  margin-top: 4px;
}
</style>

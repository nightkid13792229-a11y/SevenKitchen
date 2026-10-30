<template>
  <div class="ai-name-field">
    <div class="name-line">
      <el-input
        :model-value="modelValue"
        :placeholder="placeholder || '例如：均衡营养｜三文鱼南瓜'"
        clearable
        @update:model-value="(value: string) => emit('update:modelValue', value)"
        @blur="commitTypedName"
        @keyup.enter="commitTypedName"
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
          <div v-if="candidate.complianceWarning" class="cand-warn">
            这句话合规存疑，用之前请自己看一眼
          </div>
          <div v-if="candidate.duplicate" class="cand-warn">
            与在架食谱重名了，建议换一个
          </div>
        </div>
        <span class="cand-len">{{ countLength(candidate.name) }} 字</span>
        <el-button
          size="small"
          text
          type="primary"
          :loading="adopting === candidate.name"
          @click="use(candidate.name)"
        >
          采用
        </el-button>
      </div>

      <div class="ai-note">采用后仍可直接改字；只改名字，不会动配方和分类。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { recipeDesignerApi } from '@/api/recipeDesigner'
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
  /** 采用候选并已成功写库 */
  (event: 'saved', name: string): void
}>()

const available = ref(true)
const generating = ref(false)
/** 正在保存的候选名（只让那一条转圈） */
const adopting = ref('')
/** 已经落库的名字，用来判断失焦时要不要真的发请求 */
const savedValue = ref('')
const candidates = ref<RecipeNameCandidate[]>([])

/** 按"字"数，与后端同一口径：中文、数字、符号都算 1 个字 */
function countLength(value: string): number {
  return [...(value || '').trim()].length
}

const length = computed(() => countLength(props.modelValue))
const isOverLimit = computed(() => length.value > RECIPE_NAME_MAX_LENGTH)

watch(
  () => props.modelValue,
  (value) => {
    if (!adopting.value && !value) savedValue.value = ''
  }
)

onMounted(async () => {
  savedValue.value = props.modelValue.trim()
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
    // 超长的直接丢掉，不截断：截断会造出一个意思不通的名字。
    // 后端已经只要 2 条，这里再兜一次底。
    candidates.value = (result.candidates || [])
      .filter((item) => countLength(item.name) <= RECIPE_NAME_MAX_LENGTH)
      .slice(0, 2)
    if (candidates.value.length === 0) {
      ElMessage.warning('AI 没给出可用的名字（可能都超了 12 字），再试一次')
    }
  } catch (error: any) {
    ElMessage.error(error?.message || 'AI 生成失败，请重试')
  } finally {
    generating.value = false
  }
}

/**
 * 手打的名字：失焦或按回车即保存。
 * 没有「保存名称」按钮——名字只有十几个人在改，多一个按钮就是多一次点击。
 */
async function commitTypedName() {
  const name = props.modelValue.trim()
  if (!props.seriesId) return
  if (!name || name === savedValue.value) return
  adopting.value = name
  try {
    await recipeDesignerApi.renameSeries(props.seriesId, { name })
    savedValue.value = name
    ElMessage.success('名称已保存')
    emit('saved', name)
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败，请重试')
  } finally {
    adopting.value = ''
  }
}

/** 点「采用」= 直接落库。名字是用户一眼就能定的东西，不该再点第二次。 */
async function use(name: string) {
  emit('update:modelValue', name)
  if (!props.seriesId) return
  adopting.value = name
  try {
    await recipeDesignerApi.renameSeries(props.seriesId, { name })
    savedValue.value = name
    ElMessage.success('名称已保存')
    emit('saved', name)
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败，请重试')
  } finally {
    adopting.value = ''
  }
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

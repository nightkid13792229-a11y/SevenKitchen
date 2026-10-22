<template>
  <div class="production-steps-editor">
    <div class="steps-toolbar">
      <div class="steps-summary">
        <div class="steps-title">制作步骤</div>
        <div class="steps-subtitle">
          共 {{ steps.length }} 步 · 序号按当前顺序自动保存为 1..n
        </div>
      </div>
      <div class="steps-actions">
        <el-tag
          v-if="dirty"
          type="warning"
          effect="plain"
          size="small"
        >有未保存修改</el-tag>
        <el-tag
          v-else-if="!loading && !loadError"
          type="success"
          effect="plain"
          size="small"
        >已保存</el-tag>
        <el-button
          size="small"
          :icon="Plus"
          :disabled="loading || saving || steps.length >= PRODUCTION_STEP_LIMITS.maxSteps"
          @click="handleAddStep"
        >添加步骤</el-button>
        <el-button
          type="primary"
          size="small"
          :icon="Check"
          :loading="saving"
          :disabled="loading || Boolean(loadError) || !dirty"
          @click="handleSave"
        >保存步骤</el-button>
      </div>
    </div>

    <el-alert
      v-if="loadError"
      class="steps-alert"
      type="error"
      :closable="false"
      show-icon
      title="制作步骤加载失败"
    >
      <div class="alert-body">
        <span>{{ loadError }}</span>
        <el-button size="small" @click="loadSteps">重新加载</el-button>
      </div>
    </el-alert>

    <el-alert
      v-if="saveError"
      class="steps-alert"
      type="error"
      :closable="false"
      show-icon
      :title="`保存失败：${saveError}`"
    />

    <el-alert
      v-if="showLegacyHint"
      class="steps-alert"
      type="info"
      :closable="false"
      show-icon
      title="旧版制作步骤（只读）"
    >
      <div class="legacy-body">
        <pre class="legacy-text">{{ legacySteps }}</pre>
        <div class="legacy-hint">
          检测到旧版纯文本制作步骤，仅作参考；保存结构化步骤后将不再显示。
        </div>
      </div>
    </el-alert>

    <div v-loading="loading" class="steps-body">
      <el-empty
        v-if="!loading && !loadError && steps.length === 0"
        description="还没有制作步骤"
      >
        <el-button type="primary" :icon="Plus" @click="handleAddStep">
          添加第一步
        </el-button>
      </el-empty>

      <div v-else-if="!loadError" class="steps-list">
        <div
          v-for="(step, index) in steps"
          :key="index"
          class="step-card"
        >
          <div class="step-card__header">
            <span class="step-index">第 {{ index + 1 }} 步</span>
            <div class="step-card__actions">
              <el-button
                size="small"
                text
                :icon="ArrowUp"
                :disabled="index === 0 || saving"
                title="上移"
                @click="handleMoveStep(index, 'up')"
              />
              <el-button
                size="small"
                text
                :icon="ArrowDown"
                :disabled="index === steps.length - 1 || saving"
                title="下移"
                @click="handleMoveStep(index, 'down')"
              />
              <el-button
                size="small"
                text
                type="danger"
                :icon="Delete"
                :disabled="saving"
                title="删除该步骤"
                @click="handleRemoveStep(index)"
              />
            </div>
          </div>

          <div class="step-card__fields">
            <div class="field field--full">
              <label class="field-label">
                操作说明 <span class="required">*</span>
              </label>
              <el-input
                v-model="step.instruction"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
                :disabled="saving"
                placeholder="例如：将所有食材按配方称重"
              />
              <div
                v-if="showValidation && stepErrors[index]"
                class="field-error"
              >{{ stepErrors[index] }}</div>
            </div>

            <div class="field">
              <label class="field-label">时长（分钟）</label>
              <el-input-number
                :model-value="step.durationMinutes ?? undefined"
                :min="0"
                :max="PRODUCTION_STEP_LIMITS.maxDurationMinutes"
                :controls="false"
                :disabled="saving"
                class="field-input"
                placeholder="可选"
                @update:model-value="(value: number | undefined) => updateOptionalNumber(step, 'durationMinutes', value)"
              />
            </div>

            <div class="field">
              <label class="field-label">温度（℃）</label>
              <el-input-number
                :model-value="step.temperatureC ?? undefined"
                :min="PRODUCTION_STEP_LIMITS.minTemperatureC"
                :max="PRODUCTION_STEP_LIMITS.maxTemperatureC"
                :controls="false"
                :disabled="saving"
                class="field-input"
                placeholder="可选"
                @update:model-value="(value: number | undefined) => updateOptionalNumber(step, 'temperatureC', value)"
              />
            </div>

            <div class="field field--equipment">
              <label class="field-label">设备（可选）</label>
              <el-input
                :model-value="step.equipment ?? ''"
                :maxlength="PRODUCTION_STEP_LIMITS.maxEquipmentLength"
                :disabled="saving"
                placeholder="例如：厨房秤 / 烤箱"
                @update:model-value="(value: string) => updateEquipment(step, value)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loadError" class="steps-footer-hint">
      步骤按当前顺序保存；新增 / 删除 / 上移 / 下移后序号自动重排，
      单份食谱最多 {{ PRODUCTION_STEP_LIMITS.maxSteps }} 步。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Delete,
  Plus
} from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { DesignerProductionStep } from '@/types/recipeDesigner'
import {
  PRODUCTION_STEP_LIMITS,
  appendProductionStep,
  buildProductionStepsPayload,
  moveProductionStep,
  normalizeProductionSteps,
  removeProductionStep,
  validateProductionStep,
  validateProductionStepsForSave,
  type ProductionStepMoveDirection
} from '@/utils/recipeDesigner/productionSteps'

const props = withDefaults(
  defineProps<{
    /** 当前设计草稿 id；切换草稿时自动重新加载 */
    draftId: string
    /**
     * 旧版纯文本制作步骤（可选）。
     * 设计草稿接口通常不返回该字段；没有时编辑器什么也不显示，
     * 不会把旧文本自动转换成结构化步骤。
     */
    legacySteps?: string | null
  }>(),
  { legacySteps: '' }
)

const emit = defineEmits<{
  (event: 'dirty-change', dirty: boolean): void
  (event: 'saved', steps: DesignerProductionStep[]): void
}>()

const steps = ref<DesignerProductionStep[]>([])
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
/** 只有点过保存后才展示逐条错误，避免空编辑器一打开就飘红 */
const showValidation = ref(false)
/** 最近一次成功加载 / 保存后的规范化签名，用于判断是否有未保存修改 */
const savedSignature = ref<string>('[]')

function buildSignature(list: DesignerProductionStep[]): string {
  return JSON.stringify(buildProductionStepsPayload(list))
}

const dirty = computed(() => buildSignature(steps.value) !== savedSignature.value)
const stepErrors = computed(() =>
  steps.value.map((step, index) => validateProductionStep(step, index))
)
const showLegacyHint = computed(
  () =>
    !loading.value &&
    !loadError.value &&
    steps.value.length === 0 &&
    Boolean(String(props.legacySteps ?? '').trim())
)

watch(
  dirty,
  (value) => {
    emit('dirty-change', value)
  },
  { immediate: true }
)

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function loadSteps() {
  if (!props.draftId) {
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = ''
  saveError.value = ''
  // 换草稿或重试时先清空旧内容，避免加载失败后仍显示上一份草稿的步骤
  steps.value = []
  savedSignature.value = buildSignature([])
  try {
    const result = await recipeDesignerApi.getDraftProductionSteps(props.draftId)
    steps.value = normalizeProductionSteps(result?.productionSteps)
    savedSignature.value = buildSignature(steps.value)
    showValidation.value = false
  } catch (error) {
    // 拦截器已经弹过提示，这里只保留可重试的错误态
    loadError.value = readErrorMessage(error, '制作步骤加载失败，请重试')
  } finally {
    loading.value = false
  }
}

function handleAddStep() {
  if (steps.value.length >= PRODUCTION_STEP_LIMITS.maxSteps) {
    ElMessage.warning(`制作步骤最多 ${PRODUCTION_STEP_LIMITS.maxSteps} 步`)
    return
  }
  steps.value = appendProductionStep(steps.value)
}

function handleRemoveStep(index: number) {
  steps.value = removeProductionStep(steps.value, index)
}

function handleMoveStep(index: number, direction: ProductionStepMoveDirection) {
  steps.value = moveProductionStep(steps.value, index, direction)
}

function updateOptionalNumber(
  step: DesignerProductionStep,
  field: 'durationMinutes' | 'temperatureC',
  value: number | undefined | null
) {
  step[field] = value === undefined || value === null ? null : Number(value)
}

function updateEquipment(step: DesignerProductionStep, value: string) {
  step.equipment = value
}

async function handleSave() {
  if (saving.value || loading.value || !props.draftId) return

  const validation = validateProductionStepsForSave(steps.value)
  if (!validation.ok) {
    showValidation.value = true
    ElMessage.warning(validation.error)
    return
  }

  saving.value = true
  saveError.value = ''
  try {
    const payload = validation.steps
    const result = await recipeDesignerApi.updateDraftProductionSteps(
      props.draftId,
      { steps: payload }
    )
    const savedSteps = normalizeProductionSteps(
      result?.productionSteps ?? payload
    )
    steps.value = savedSteps
    savedSignature.value = buildSignature(savedSteps)
    showValidation.value = false
    emit('saved', savedSteps)
    ElMessage.success(
      savedSteps.length ? '制作步骤已保存' : '制作步骤已清空'
    )
  } catch (error) {
    saveError.value = readErrorMessage(error, '保存失败，请重试')
  } finally {
    saving.value = false
  }
}

onMounted(loadSteps)

watch(
  () => props.draftId,
  () => {
    void loadSteps()
  }
)

defineExpose({ reload: loadSteps, isDirty: dirty })
</script>

<style scoped>
.production-steps-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

.steps-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.steps-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.steps-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.steps-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.steps-alert {
  flex-shrink: 0;
}

.alert-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.steps-body {
  flex: 1;
  min-height: 240px;
  overflow-y: auto;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
}

.step-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #f2f3f5;
  background: #fafbfc;
  border-radius: 8px 8px 0 0;
}

.step-index {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.step-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.step-card__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 150px;
}

.field--full {
  width: 100%;
}

.field--equipment {
  flex: 1;
  min-width: 200px;
}

.field-label {
  font-size: 12px;
  color: #606266;
}

.required {
  color: #f56c6c;
}

.field-input {
  width: 100%;
}

.field-error {
  font-size: 12px;
  line-height: 1.5;
  color: #f56c6c;
}

.steps-footer-hint {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.legacy-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legacy-text {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #ebeef5;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.7;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
}

.legacy-hint {
  font-size: 12px;
  color: #909399;
}
</style>

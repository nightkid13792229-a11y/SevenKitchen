<template>
  <el-dialog
    :model-value="modelValue"
    title="新增补剂"
    width="640px"
    top="4vh"
    @closed="resetForm"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <div class="supplement-form">
      <div class="form-row">
        <el-button :icon="Camera" :loading="recognizing" @click="triggerFileInput">
          {{ recognizing ? '识别中…' : '拍照/上传包装标签自动识别' }}
        </el-button>
        <input ref="fileInputRef" type="file" accept="image/*" style="display: none" @change="onFileChange" />
      </div>

      <el-divider v-if="ocrText" content-position="left">标签识别结果</el-divider>
      <div v-if="ocrText" class="ocr-block">
        <div v-for="(warning, index) in aiWarnings" :key="`w-${index}`" class="ocr-warning">⚠️ {{ warning }}</div>
        <pre class="ocr-text">{{ ocrText }}</pre>
      </div>

      <el-divider content-position="left">基本信息</el-divider>
      <div class="form-grid">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：三文鱼鱼油" maxlength="60" />
        </el-form-item>
        <el-form-item label="档案名">
          <el-input v-model="form.profileName" placeholder="留空默认使用名称" maxlength="60" />
        </el-form-item>
        <el-form-item label="用量单位">
          <el-select v-model="form.usageUnit" style="width: 100%">
            <el-option v-for="unit in supplementUsageUnitOptions" :key="unit" :label="unit" :value="unit" />
          </el-select>
        </el-form-item>
        <el-form-item label="营养基准">
          <el-select v-model="form.basisType" style="width: 100%">
            <el-option v-for="option in basisOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="needsUnitWeight" label="每份重量(g)">
          <el-input-number v-model="form.servingWeightG" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="needsDensity" label="密度(g/ml)">
          <el-input-number v-model="form.densityGPerMl" :min="0" :precision="3" style="width: 100%" />
        </el-form-item>
      </div>

      <el-divider content-position="left">营养成分（每{{ basisHint }}）</el-divider>
      <div class="nutrient-controls">
        <el-checkbox v-model="allFieldsVisible">显示全部字段</el-checkbox>
      </div>
      <div v-for="group in visibleGroups" :key="group.key" class="nutrient-group">
        <div class="group-title">{{ group.title }}</div>
        <div class="group-fields">
          <div v-for="field in group.fields" :key="field.fieldPath" class="nutrient-field">
            <el-input-number
              v-model="nutrientInputs[field.fieldPath]"
              :min="0"
              :precision="2"
              :controls="false"
              placeholder="0"
              style="width: 130px"
            />
            <span class="field-label">{{ field.label }}（{{ field.unit }}）</span>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="creating" @click="submit">保存补剂</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Camera } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type {
  SupplementNutritionBasisType,
  SupplementUsageUnit
} from '@/types/recipeDesigner'
import {
  supplementNutrientGroups,
  supplementServingBasisLabels,
  supplementUsageUnitOptions
} from '@/constants/supplementNutrients'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved'): void
}>()

const creating = ref(false)
const recognizing = ref(false)
const ocrText = ref('')
const aiWarnings = ref<string[]>([])
const allFieldsVisible = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const form = reactive<{
  name: string
  profileName?: string
  usageUnit: SupplementUsageUnit
  basisType: SupplementNutritionBasisType
  servingWeightG?: number
  densityGPerMl?: number
}>({
  name: '',
  profileName: '',
  usageUnit: 'g',
  basisType: 'PER_1_G',
  servingWeightG: undefined,
  densityGPerMl: undefined
})
const nutrientInputs = reactive<Record<string, number>>({})

const basisOptions = computed(() => {
  if (form.usageUnit === 'g') {
    return [
      { value: 'PER_1_G', label: '每1g' },
      { value: 'PER_100_G', label: '每100g' }
    ]
  }
  if (form.usageUnit === 'ml') {
    return [
      { value: 'PER_1_ML', label: '每1ml' },
      { value: 'PER_100_ML', label: '每100ml' }
    ]
  }
  return [
    { value: 'PER_SERVING', label: supplementServingBasisLabels[form.usageUnit] },
    { value: 'PER_1_G', label: '每1g' },
    { value: 'PER_100_G', label: '每100g' }
  ]
})

const needsUnitWeight = computed(() => {
  return !['g', 'ml'].includes(form.usageUnit) && form.basisType !== 'PER_SERVING'
})

const needsDensity = computed(() => form.usageUnit === 'ml')

const basisHint = computed(() => {
  const label = basisOptions.value.find((option) => option.value === form.basisType)?.label
  return label?.replace('每', '') ?? '1g'
})

const visibleGroups = computed(() => {
  if (allFieldsVisible.value) return supplementNutrientGroups
  return supplementNutrientGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => field.common)
    }))
    .filter((group) => group.fields.length > 0)
})

function resetForm() {
  form.name = ''
  form.profileName = ''
  form.usageUnit = 'g'
  form.basisType = 'PER_1_G'
  form.servingWeightG = undefined
  form.densityGPerMl = undefined
  ocrText.value = ''
  aiWarnings.value = []
  allFieldsVisible.value = false
  Object.keys(nutrientInputs).forEach((key) => delete nutrientInputs[key])
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  recognizing.value = true
  try {
    const draft = await recipeDesignerApi.extractSupplementLabel(file)
    applyExtractionDraft(draft)
  } catch {
    ElMessage.error('标签识别失败，请手动填写')
  } finally {
    recognizing.value = false
    input.value = ''
  }
}

function applyExtractionDraft(draft: {
  name?: string
  profileName?: string
  basisType?: SupplementNutritionBasisType
  usageUnit?: SupplementUsageUnit
  servingWeightG?: number
  densityGPerMl?: number
  nutrients?: Record<string, number | string | null | undefined>
  warnings?: string[]
  ocrText?: string
}) {
  if (draft.name) form.name = draft.name
  if (draft.profileName) form.profileName = draft.profileName
  if (draft.usageUnit && supplementUsageUnitOptions.includes(draft.usageUnit)) {
    form.usageUnit = draft.usageUnit
  }
  if (draft.basisType) form.basisType = draft.basisType
  if (draft.servingWeightG !== undefined) form.servingWeightG = draft.servingWeightG
  if (draft.densityGPerMl !== undefined) form.densityGPerMl = draft.densityGPerMl
  aiWarnings.value = Array.isArray(draft.warnings) ? draft.warnings : []
  ocrText.value = String(draft.ocrText || '').trim()

  const knownPaths = new Set(
    supplementNutrientGroups.flatMap((group) => group.fields.map((field) => field.fieldPath))
  )
  Object.keys(nutrientInputs).forEach((key) => delete nutrientInputs[key])
  for (const [fieldPath, value] of Object.entries(draft.nutrients ?? {})) {
    if (!knownPaths.has(fieldPath)) continue
    const num = Number(String(value ?? '').trim())
    if (Number.isFinite(num) && num >= 0) {
      nutrientInputs[fieldPath] = num
    }
  }
  allFieldsVisible.value = Object.keys(nutrientInputs).some(
    (path) => !supplementNutrientGroups.flatMap((group) => group.fields).find((f) => f.fieldPath === path)?.common
  )
}

async function submit() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('请填写补剂名称')
    return
  }
  const nutrients: Record<string, number> = {}
  for (const [fieldPath, rawValue] of Object.entries(nutrientInputs)) {
    const value = Number(rawValue ?? 0)
    if (Number.isFinite(value) && value > 0) {
      nutrients[fieldPath] = value
    }
  }
  if (Object.keys(nutrients).length === 0) {
    ElMessage.warning('请至少填写一个营养成分')
    return
  }

  creating.value = true
  try {
    await recipeDesignerApi.createSupplementOption({
      name,
      profileName: form.profileName?.trim() || undefined,
      basisType: form.basisType,
      usageUnit: form.usageUnit,
      ...(form.servingWeightG !== undefined ? { servingWeightG: form.servingWeightG } : {}),
      ...(form.densityGPerMl !== undefined ? { densityGPerMl: form.densityGPerMl } : {}),
      nutrients
    })
    ElMessage.success('补剂已保存')
    emit('update:modelValue', false)
    emit('saved')
  } catch {
    // 拦截器已提示
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.form-row {
  margin-bottom: 8px;
}
.ocr-block {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 12px;
}
.ocr-warning {
  color: #e6a23c;
  font-size: 12px;
  margin-bottom: 4px;
}
.ocr-text {
  margin: 0;
  font-size: 12px;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 140px;
  overflow: auto;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
.nutrient-controls {
  margin-bottom: 8px;
}
.nutrient-group {
  margin-bottom: 12px;
}
.group-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
  margin-bottom: 6px;
}
.group-fields {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 16px;
}
.nutrient-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}
</style>

<template>
  <div class="nutrition-editor">
    <div class="nutrition-overview">
      <div class="overview-copy">
        <div class="overview-title">营养档案</div>
        <div class="overview-desc">
          {{ props.ingredientType === IngredientType.SUPPLEMENT ? '补剂可录入标准营养项与自定义有效成分。' : '食材使用统一结构化营养档案，供后续营养计算与食谱设计复用。' }}
        </div>
      </div>
      <div class="overview-actions">
        <el-tag type="info">{{ rawBasisLabel }}</el-tag>
        <el-button size="small" :icon="Plus" @click="addCustomItem">添加自定义营养项</el-button>
      </div>
    </div>

    <div class="nutrition-meta-card">
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">原始基准</div>
          <el-select v-model="formValue.meta.rawBasisType">
            <el-option
              v-for="option in INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="meta-item">
          <div class="meta-label">样品状态</div>
          <el-select v-model="formValue.meta.sampleState" clearable placeholder="可选">
            <el-option
              v-for="option in INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="meta-item">
          <div class="meta-label">来源类型</div>
          <el-select v-model="formValue.meta.sourceType" clearable placeholder="可选">
            <el-option
              v-for="option in INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="meta-item">
          <div class="meta-label">置信度</div>
          <el-select v-model="formValue.meta.confidenceLevel" clearable placeholder="可选">
            <el-option
              v-for="option in INGREDIENT_NUTRITION_CONFIDENCE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="meta-item">
          <div class="meta-label">来源标题</div>
          <el-input v-model="formValue.meta.sourceTitle" maxlength="100" placeholder="如：第三方检测报告、商品包装" />
        </div>

        <div class="meta-item">
          <div class="meta-label">来源提供方</div>
          <el-input v-model="formValue.meta.sourceProvider" maxlength="100" placeholder="如：供应商、实验室、品牌方" />
        </div>

        <div class="meta-item">
          <div class="meta-label">可食部口径</div>
          <div class="meta-inline">
            <el-switch v-model="formValue.meta.isEdiblePortionBasis" />
            <el-input-number
              v-model="formValue.meta.ediblePortionRate"
              :disabled="!formValue.meta.isEdiblePortionBasis"
              :min="0"
              :max="1"
              :step="0.01"
              :precision="2"
              controls-position="right"
            />
          </div>
        </div>

        <div class="meta-item">
          <div class="meta-label">密度 / 单份重量</div>
          <div class="meta-inline">
            <el-input-number
              v-model="formValue.meta.densityGPerMl"
              :min="0"
              :step="0.01"
              :precision="3"
              controls-position="right"
              placeholder="g/ml"
            />
            <el-input-number
              v-model="formValue.meta.servingWeightG"
              :min="0"
              :step="0.01"
              :precision="3"
              controls-position="right"
              placeholder="g"
            />
          </div>
        </div>
      </div>

      <div class="meta-textarea-grid">
        <div class="meta-item">
          <div class="meta-label">附件</div>
          <el-input
            v-model="attachmentsText"
            type="textarea"
            :rows="2"
            placeholder="每行一个附件链接或文件标识"
          />
        </div>
        <div class="meta-item">
          <div class="meta-label">版本备注</div>
          <el-input
            v-model="formValue.meta.versionNote"
            type="textarea"
            :rows="2"
            maxlength="200"
            placeholder="记录换算说明、异常口径、核对结论等"
            show-word-limit
          />
        </div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="nutrition-tabs">
      <el-tab-pane
        v-for="tab in INGREDIENT_NUTRITION_TAB_DEFINITIONS"
        :key="tab.key"
        :label="tab.label"
        :name="tab.key"
      >
        <div class="tab-grid">
          <div
            v-for="field in tab.fields"
            :key="field.key"
            class="tab-field"
          >
            <div class="field-label">{{ field.label }}</div>
            <div class="field-input">
              <el-input-number
                :model-value="getTabFieldValue(tab.key, field.key)"
                :min="0"
                :step="field.unit === 'kcal' ? 1 : 0.1"
                :precision="field.unit === 'kcal' ? 0 : 4"
                controls-position="right"
                @update:model-value="setTabFieldValue(tab.key, field.key, $event)"
              />
              <span class="field-unit">{{ field.unit }}</span>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div class="custom-section">
      <div class="custom-header">
        <div>
          <div class="custom-title">自定义营养项</div>
          <div class="custom-desc">用于补充当前结构中未覆盖的成分、菌株或品牌自定义指标。</div>
        </div>
        <el-button size="small" type="primary" :icon="Plus" @click="addCustomItem">新增一项</el-button>
      </div>

      <div v-if="formValue.customItems.length === 0" class="custom-empty">
        暂无自定义营养项，点击右上角添加。
      </div>

      <div v-else class="custom-list">
        <div
          v-for="(item, index) in formValue.customItems"
          :key="`custom-${index}`"
          class="custom-row"
        >
          <el-input v-model="item.name" maxlength="50" placeholder="名称" />
          <el-input-number
            v-model="item.value"
            :min="0"
            :step="0.1"
            :precision="4"
            controls-position="right"
          />
          <el-select v-model="item.unit" filterable allow-create default-first-option placeholder="单位">
            <el-option
              v-for="unit in INGREDIENT_NUTRITION_CUSTOM_ITEM_UNIT_OPTIONS"
              :key="unit"
              :label="unit"
              :value="unit"
            />
          </el-select>
          <el-select v-model="item.rawBasisType" clearable placeholder="口径">
            <el-option
              v-for="option in INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-input v-model="item.note" maxlength="100" placeholder="备注（可选）" />
          <el-button :icon="Delete" circle @click="removeCustomItem(index)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import {
  INGREDIENT_NUTRITION_CONFIDENCE_OPTIONS,
  INGREDIENT_NUTRITION_CUSTOM_ITEM_UNIT_OPTIONS,
  INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS,
  INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS,
  INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS,
  INGREDIENT_NUTRITION_TAB_DEFINITIONS,
  INGREDIENT_NUTRITION_TAB_KEYS,
  type IngredientNutritionTabKey
} from '@/constants/ingredientNutrition'
import { IngredientType, type NutritionProfile } from '@/types/ingredient'
import {
  buildIngredientNutritionPayload,
  createEmptyIngredientNutritionFormValue,
  normalizeIngredientNutritionProfileToForm,
  type IngredientNutritionFormValue
} from '@/utils/ingredientNutrition'

interface Props {
  modelValue: NutritionProfile | null | undefined
  ingredientType: IngredientType
}

interface Emits {
  (e: 'update:modelValue', value: NutritionProfile | null): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const activeTab = ref<IngredientNutritionTabKey>('macros')
const attachmentsText = ref('')
const formValue = reactive<IngredientNutritionFormValue>(createEmptyIngredientNutritionFormValue())

const rawBasisLabel = computed(() => (
  INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS.find((option) => option.value === formValue.meta.rawBasisType)?.label || '原始基准'
))

let syncingFromProps = false
let lastAppliedPayloadSnapshot = JSON.stringify(null)

function serializeValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function applyFormValue(nextValue: IngredientNutritionFormValue) {
  Object.assign(formValue.meta, nextValue.meta)

  for (const tabKey of INGREDIENT_NUTRITION_TAB_KEYS) {
    Object.assign(formValue[tabKey], nextValue[tabKey])
  }

  formValue.customItems.splice(
    0,
    formValue.customItems.length,
    ...nextValue.customItems.map((item) => ({
      ...item,
      rawBasisType: item.rawBasisType ?? formValue.meta.rawBasisType,
      note: item.note ?? null
    }))
  )
}

function addCustomItem() {
  formValue.customItems.push({
    name: '',
    value: 0,
    unit: 'mg',
    rawBasisType: formValue.meta.rawBasisType,
    note: null
  })
}

function removeCustomItem(index: number) {
  formValue.customItems.splice(index, 1)
}

function getTabFieldValue(tabKey: IngredientNutritionTabKey, fieldKey: string) {
  return (formValue[tabKey] as Record<string, number | null>)[fieldKey]
}

function setTabFieldValue(tabKey: IngredientNutritionTabKey, fieldKey: string, value: number | undefined) {
  ;(formValue[tabKey] as Record<string, number | null>)[fieldKey] = value ?? null
}

watch(
  () => props.modelValue,
  (modelValue) => {
    const normalized = normalizeIngredientNutritionProfileToForm(modelValue)

    syncingFromProps = true
    applyFormValue(normalized)
    attachmentsText.value = (normalized.meta.attachments ?? []).join('\n')
    lastAppliedPayloadSnapshot = serializeValue(buildIngredientNutritionPayload(formValue))
    syncingFromProps = false
  },
  { immediate: true, deep: true }
)

watch(attachmentsText, (value) => {
  if (syncingFromProps) {
    return
  }

  formValue.meta.attachments = value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
})

watch(
  () => serializeValue(buildIngredientNutritionPayload(formValue)),
  (payloadSnapshot) => {
    if (syncingFromProps || payloadSnapshot === lastAppliedPayloadSnapshot) {
      return
    }

    lastAppliedPayloadSnapshot = payloadSnapshot
    emit('update:modelValue', JSON.parse(payloadSnapshot) as NutritionProfile | null)
  },
  { immediate: false }
)
</script>

<style scoped>
.nutrition-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.nutrition-overview {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff 0%, #f4f7fb 100%);
}

.overview-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.overview-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.overview-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.nutrition-meta-card {
  padding: 18px;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  background: #fff;
}

.meta-grid,
.meta-textarea-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.meta-textarea-grid {
  margin-top: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.meta-inline {
  display: grid;
  gap: 12px;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
}

.nutrition-tabs {
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  padding: 0 18px 18px;
  background: #fff;
}

.tab-grid {
  display: grid;
  gap: 14px 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.tab-field {
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fafafa;
}

.field-label {
  margin-bottom: 10px;
  font-size: 13px;
  color: #606266;
}

.field-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-unit {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.custom-section {
  padding: 18px;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  background: #fff;
}

.custom-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.custom-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.custom-desc {
  margin-top: 6px;
  font-size: 13px;
  color: #606266;
}

.custom-empty {
  padding: 18px;
  border: 1px dashed #dcdfe6;
  border-radius: 10px;
  color: #909399;
  text-align: center;
}

.custom-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-row {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(140px, 1.4fr) minmax(120px, 0.9fr) 110px 140px minmax(160px, 1.2fr) 40px;
  align-items: center;
}

@media (max-width: 960px) {
  .nutrition-overview,
  .custom-header {
    flex-direction: column;
  }

  .overview-actions {
    align-items: stretch;
  }

  .custom-row {
    grid-template-columns: 1fr;
  }
}
</style>

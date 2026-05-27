<template>
  <div class="nutrition-editor">
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

        <div v-if="showSampleState" class="meta-item">
          <div class="meta-label">样品状态</div>
          <el-select
            v-model="formValue.meta.sampleState"
            clearable
            placeholder="可选"
          >
            <el-option
              v-for="option in INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="meta-item">
          <div class="meta-label">来源</div>
          <el-select
            v-model="formValue.meta.sourceType"
            clearable
            placeholder="可选"
          >
            <el-option
              v-for="option in INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="meta-item">
          <div class="meta-label">密度</div>
          <el-input-number
            v-model="formValue.meta.densityGPerMl"
            :min="0"
            :step="0.01"
            :precision="3"
            controls-position="right"
            placeholder="g/ml"
          />
          <div class="meta-hint">
            仅液体、浆体或油脂类原料需要填写，单位为 g/ml。
          </div>
        </div>

        <div class="meta-item">
          <div class="meta-label">单份重量</div>
          <div class="meta-value-with-unit">
            <el-input-number
              v-model="formValue.meta.servingWeightG"
              :min="0"
              :step="0.01"
              :precision="3"
              :controls="false"
              :disabled="formValue.meta.rawBasisType !== 'PER_SERVING'"
              placeholder="0"
            />
            <span class="field-unit">g</span>
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
            maxlength="1000"
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
          <div v-for="field in tab.fields" :key="field.key" class="tab-field">
            <div class="field-label-row">
              <div class="field-label">
                {{ field.label }}
                <span v-if="field.englishLabel" class="field-english-inline"
                  >({{ field.englishLabel }})</span
                >
              </div>
              <el-tooltip
                v-if="getFieldSource(tab.key, field.key)"
                placement="top"
                :content="getFieldSourceTooltip(tab.key, field.key)"
              >
                <el-tag
                  class="field-source-tag"
                  size="small"
                  :type="getFieldSourceTagType(tab.key, field.key)"
                >
                  {{ getFieldSourceLabel(tab.key, field.key) }}
                </el-tag>
              </el-tooltip>
            </div>
            <div class="field-input">
              <el-input-number
                :model-value="getDisplayedFieldValue(tab.key, field.key)"
                :min="0"
                :step="getUnitStep(getFieldDisplayUnit(field.key, field.unit))"
                :precision="
                  getUnitPrecision(getFieldDisplayUnit(field.key, field.unit))
                "
                :controls="false"
                @update:model-value="
                  setDisplayedFieldValue(tab.key, field.key, $event)
                "
              />
              <el-select
                v-if="field.unitOptions && field.unitOptions.length > 1"
                :model-value="getFieldDisplayUnit(field.key, field.unit)"
                class="field-unit-select"
                @update:model-value="
                  setFieldDisplayUnit(field.key, field.unit, $event)
                "
              >
                <el-option
                  v-for="unit in field.unitOptions"
                  :key="unit"
                  :label="unit"
                  :value="unit"
                />
              </el-select>
              <span v-else class="field-unit">{{ field.unit }}</span>
            </div>
            <div class="field-basis">基于 {{ rawBasisLabel }} 录入</div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div class="custom-section">
      <div class="custom-header">
        <div>
          <div class="custom-title">自定义营养项</div>
          <div class="custom-desc">
            用于补充当前结构中未覆盖的成分、菌株或品牌自定义指标。
          </div>
        </div>
        <el-button
          size="small"
          type="primary"
          :icon="Plus"
          @click="addCustomItem"
          >新增一项</el-button
        >
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
          <div class="custom-row-main">
            <el-input v-model="item.name" maxlength="50" placeholder="名称" />
            <el-input-number
              v-model="item.value"
              :min="0"
              :step="0.1"
              :precision="4"
              :controls="false"
            />
            <el-select
              v-model="item.unit"
              filterable
              allow-create
              default-first-option
              placeholder="单位"
            >
              <el-option
                v-for="unit in INGREDIENT_NUTRITION_CUSTOM_ITEM_UNIT_OPTIONS"
                :key="unit"
                :label="unit"
                :value="unit"
              />
            </el-select>
            <el-tag class="custom-basis-tag" type="info">{{
              rawBasisLabel
            }}</el-tag>
            <el-button :icon="Delete" circle @click="removeCustomItem(index)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Delete, Plus } from "@element-plus/icons-vue";
import {
  getIngredientNutritionResolvedDisplayUnit,
  INGREDIENT_NUTRITION_CUSTOM_ITEM_UNIT_OPTIONS,
  INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP,
  INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS,
  INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS,
  INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS,
  INGREDIENT_NUTRITION_TAB_DEFINITIONS,
  INGREDIENT_NUTRITION_TAB_KEYS,
  type IngredientNutritionTabKey,
} from "@/constants/ingredientNutrition";
import { IngredientType, type NutritionProfile } from "@/types/ingredient";
import {
  buildIngredientNutritionPayload,
  createEmptyIngredientNutritionFormValue,
  normalizeIngredientNutritionProfileToForm,
  type IngredientNutritionFormValue,
} from "@/utils/ingredientNutrition";
import {
  convertIngredientNutritionFieldValue,
  getIngredientNutritionUnitPrecision,
  getIngredientNutritionUnitStep,
} from "@/utils/ingredientNutritionUnits";

interface Props {
  modelValue: NutritionProfile | null | undefined;
  ingredientType: IngredientType;
  showSampleState?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: NutritionProfile | null): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const activeTab = ref<IngredientNutritionTabKey>("macros");
const attachmentsText = ref("");
const formValue = reactive<IngredientNutritionFormValue>(
  createEmptyIngredientNutritionFormValue(),
);
const fieldDisplayUnits = reactive<Record<string, string>>({});

const showSampleState = computed(() => props.showSampleState ?? true);

const rawBasisLabel = computed(
  () =>
    INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS.find(
      (option) => option.value === formValue.meta.rawBasisType,
    )?.label || "原始基准",
);

let syncingFromProps = false;
let lastAppliedPayloadSnapshot = JSON.stringify(null);

function serializeValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function applyFormValue(nextValue: IngredientNutritionFormValue) {
  Object.assign(formValue.meta, nextValue.meta);

  for (const tabKey of INGREDIENT_NUTRITION_TAB_KEYS) {
    Object.assign(formValue[tabKey], nextValue[tabKey]);
  }

  formValue.customItems.splice(
    0,
    formValue.customItems.length,
    ...nextValue.customItems.map((item) => ({
      ...item,
      rawBasisType: item.rawBasisType ?? formValue.meta.rawBasisType,
      note: item.note ?? null,
    })),
  );

  for (const tab of INGREDIENT_NUTRITION_TAB_DEFINITIONS) {
    for (const field of tab.fields) {
      fieldDisplayUnits[field.key] =
        getIngredientNutritionResolvedDisplayUnit(
          field.key,
          nextValue.meta.fieldDisplayUnits?.[field.key],
        ) || field.unit;
    }
  }
}

function addCustomItem() {
  formValue.customItems.push({
    name: "",
    value: 0,
    unit: "mg",
    rawBasisType: formValue.meta.rawBasisType,
    note: null,
  });
}

function removeCustomItem(index: number) {
  formValue.customItems.splice(index, 1);
}

function getFieldDisplayUnit(fieldKey: string, fallbackUnit: string) {
  return fieldDisplayUnits[fieldKey] || fallbackUnit;
}

function setFieldDisplayUnit(
  fieldKey: string,
  fallbackUnit: string,
  nextUnit: string,
) {
  const resolvedUnit = nextUnit || fallbackUnit;
  fieldDisplayUnits[fieldKey] = resolvedUnit;
  formValue.meta.fieldDisplayUnits = {
    ...(formValue.meta.fieldDisplayUnits || {}),
    [fieldKey]: resolvedUnit,
  };
}

function getDisplayedFieldValue(
  tabKey: IngredientNutritionTabKey,
  fieldKey: string,
) {
  const value = (formValue[tabKey] as Record<string, number | null>)[fieldKey];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const field = INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP[fieldKey];
  const displayUnit = getFieldDisplayUnit(fieldKey, field?.unit || "");
  return convertIngredientNutritionFieldValue(
    fieldKey,
    value,
    field?.unit || displayUnit,
    displayUnit,
  );
}

function setDisplayedFieldValue(
  tabKey: IngredientNutritionTabKey,
  fieldKey: string,
  value: number | undefined,
) {
  if (value === undefined || value === null) {
    (formValue[tabKey] as Record<string, number | null>)[fieldKey] = null;
    return;
  }

  const field = INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP[fieldKey];
  const displayUnit = getFieldDisplayUnit(fieldKey, field?.unit || "");
  (formValue[tabKey] as Record<string, number | null>)[fieldKey] =
    convertIngredientNutritionFieldValue(
      fieldKey,
      value,
      displayUnit,
      field?.unit || displayUnit,
    );
}

function getUnitStep(unit: string) {
  return getIngredientNutritionUnitStep(unit);
}

function getUnitPrecision(unit: string) {
  return getIngredientNutritionUnitPrecision(unit);
}

function getFieldPath(tabKey: IngredientNutritionTabKey, fieldKey: string) {
  return `${tabKey}.${fieldKey}`;
}

function getFieldSource(tabKey: IngredientNutritionTabKey, fieldKey: string) {
  return formValue.meta.fieldSources?.[getFieldPath(tabKey, fieldKey)];
}

function getFieldSourceLabel(
  tabKey: IngredientNutritionTabKey,
  fieldKey: string,
) {
  const source = getFieldSource(tabKey, fieldKey);
  if (!source) return "";

  if (source.compatibility === "APPROXIMATE_SPECIES") {
    return `${source.sourceType || "来源"} 近似补源`;
  }

  if (source.sourceRole === "FIELD_SUPPLEMENT") {
    return `${source.sourceType || "来源"} 补源`;
  }

  return source.sourceType || source.sourceCode || "字段来源";
}

function getFieldSourceTagType(
  tabKey: IngredientNutritionTabKey,
  fieldKey: string,
) {
  const source = getFieldSource(tabKey, fieldKey);
  if (source?.compatibility === "APPROXIMATE_SPECIES") {
    return "warning";
  }
  if (source?.confidenceLevel === "HIGH") {
    return "success";
  }
  return "info";
}

function getFieldSourceTooltip(
  tabKey: IngredientNutritionTabKey,
  fieldKey: string,
) {
  const source = getFieldSource(tabKey, fieldKey);
  if (!source) return "";

  return [
    source.sourceTitle || source.sourceKey || source.sourceType,
    source.compatibility === "APPROXIMATE_SPECIES" ? "近似物种补源" : null,
    source.noteZh,
  ]
    .filter(Boolean)
    .join("；");
}

watch(
  () => props.modelValue,
  (modelValue) => {
    const normalized = normalizeIngredientNutritionProfileToForm(modelValue);

    syncingFromProps = true;
    applyFormValue(normalized);
    attachmentsText.value = (normalized.meta.attachments ?? []).join("\n");
    lastAppliedPayloadSnapshot = serializeValue(
      buildIngredientNutritionPayload(formValue),
    );
    syncingFromProps = false;
  },
  { immediate: true, deep: true },
);

watch(attachmentsText, (value) => {
  if (syncingFromProps) {
    return;
  }

  formValue.meta.attachments = value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
});

watch(
  () => formValue.meta.rawBasisType,
  (rawBasisType) => {
    if (rawBasisType !== "PER_SERVING") {
      formValue.meta.servingWeightG = null;
    }

    for (const item of formValue.customItems) {
      item.rawBasisType = rawBasisType;
    }
  },
);

watch(
  () => serializeValue(buildIngredientNutritionPayload(formValue)),
  (payloadSnapshot) => {
    if (syncingFromProps || payloadSnapshot === lastAppliedPayloadSnapshot) {
      return;
    }

    lastAppliedPayloadSnapshot = payloadSnapshot;
    emit(
      "update:modelValue",
      JSON.parse(payloadSnapshot) as NutritionProfile | null,
    );
  },
  { immediate: false },
);
</script>

<style scoped>
.nutrition-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

.meta-hint {
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}

.meta-value-with-unit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 10px;
}

.meta-value-with-unit :deep(.el-input-number) {
  width: 100%;
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

.field-label-row {
  display: flex;
  min-height: 22px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.field-source-tag {
  flex: 0 0 auto;
}

.field-english-inline {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
  margin-left: 4px;
}

.field-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px;
  align-items: center;
  gap: 10px;
}

.field-unit-select {
  width: 100%;
}

.field-input :deep(.el-input-number) {
  width: 100%;
}

.field-unit {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.field-basis {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
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
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fafafa;
}

.custom-row-main {
  display: grid;
  gap: 12px;
  grid-template-columns:
    minmax(140px, 1.5fr) minmax(160px, 1.2fr)
    88px 110px 40px;
  align-items: center;
}

.custom-basis-tag {
  justify-content: center;
  width: 100%;
}

.custom-row-main :deep(.el-input-number) {
  width: 100%;
}

@media (max-width: 960px) {
  .custom-header {
    flex-direction: column;
  }

  .field-input,
  .custom-row-main {
    grid-template-columns: 1fr;
  }
}
</style>

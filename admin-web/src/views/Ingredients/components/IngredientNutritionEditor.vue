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

    <!--
      补剂默认目标营养素（2026-10-22）：
      只对补剂营养档案显示；从原料库添加该补剂时作为初始值带出，
      不锁定食谱内的选择，也不会反写食谱里人工改过的目标。
    -->
    <div v-if="isSupplementProfile" class="custom-section supplement-target-section">
      <div class="custom-header">
        <div>
          <div class="custom-title">默认补剂目标营养素</div>
          <div class="custom-desc">
            从本档案已填写且大于 0 的字段中选择；添加该补剂时会自动带出。
            组合目标（如 EPA + DHA）请选择派生字段，一个目标对应一个字段。
          </div>
        </div>
        <el-tag
          v-if="selectedDefaultTargets.length"
          type="warning"
          effect="plain"
        >
          已配置 {{ selectedDefaultTargets.length }} 个
        </el-tag>
        <el-tag v-else type="info" effect="plain">未配置</el-tag>
      </div>

      <el-select
        v-model="selectedTargetFieldPaths"
        class="supplement-target-select"
        multiple
        filterable
        clearable
        :disabled="supplementTargetOptions.length === 0"
        placeholder="选择一个或多个目标营养素"
      >
        <el-option
          v-for="option in supplementTargetOptions"
          :key="option.fieldPath"
          :label="`${option.label}（${option.unit}）`"
          :value="option.fieldPath"
        >
          <div class="supplement-target-option">
            <span>{{ option.label }}（{{ option.unit }}）</span>
            <span class="supplement-target-option-meta">{{ option.valueText }}</span>
          </div>
        </el-option>
      </el-select>

      <el-alert
        v-if="supplementTargetOptions.length === 0"
        class="supplement-target-hint"
        type="info"
        :closable="false"
        show-icon
        title="当前档案还没有可用的目标字段"
        description="请先在上方填写营养数据（数值需大于 0），再回来配置默认目标。"
      />
      <el-alert
        v-else-if="selectedDefaultTargets.length === 0"
        class="supplement-target-hint"
        type="warning"
        :closable="false"
        show-icon
        title="未配置默认目标"
        description="从原料库添加该补剂时，将要求先手动选择目标营养素，系统不会按营养缺口自动推断。"
      />
      <div v-else class="supplement-target-preview">
        <el-tag
          v-for="target in selectedDefaultTargets"
          :key="target.fieldPath"
          type="warning"
          effect="plain"
        >
          {{ target.label }}（{{ target.unit }}）
        </el-tag>
        <span class="supplement-target-preview-hint">
          保存后生效：仅作为添加补剂时的初始值，不锁定食谱内选择。
        </span>
      </div>

      <div v-if="ignoredDefaultTargets.length" class="supplement-target-ignored">
        已忽略 {{ ignoredDefaultTargets.length }} 个当前档案中为空或为 0
        的默认目标：{{ ignoredDefaultTargets.map((target) => target.label).join("、") }}
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
import { IngredientType, type NutritionProfile, type NutritionSupplementTarget } from "@/types/ingredient";
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
import {
  DERIVED_NUTRITION_FIELD_CATALOG,
  NUTRITION_FIELD_CATALOG,
} from "@/utils/recipeDesigner/nutritionFieldCatalog";
import {
  normalizeSupplementTargetDefinitions,
  resolveSupplementTargetDefinition,
  type SupplementTargetDefinition,
} from "@/utils/recipeDesigner/supplementTargets";

interface Props {
  modelValue: NutritionProfile | null | undefined;
  ingredientType: IngredientType;
  showSampleState?: boolean;
  /** 补剂营养档案的默认目标营养素（独立于 nutritionData 保存） */
  defaultSupplementTargets?: NutritionSupplementTarget[] | null;
}

interface Emits {
  (e: "update:modelValue", value: NutritionProfile | null): void;
  (
    e: "update:defaultSupplementTargets",
    value: NutritionSupplementTarget[],
  ): void;
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

// ---------- 补剂默认目标营养素 ----------

interface SupplementTargetOption {
  fieldPath: string;
  label: string;
  unit: string;
  valueText: string;
}

const isSupplementProfile = computed(
  () => props.ingredientType === IngredientType.SUPPLEMENT,
);

const selectedTargetFieldPaths = ref<string[]>([]);
const ignoredDefaultTargets = ref<SupplementTargetDefinition[]>([]);
let syncingDefaultTargets = false;
let lastEmittedDefaultTargetsSnapshot = JSON.stringify([]);

function formatTargetValue(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/**
 * 只列出当前档案中「已填写且大于 0」的字段，并补上 SUM 派生字段。
 * 比例类派生字段不是添加浓度，不参与选择。
 */
const supplementTargetOptions = computed<SupplementTargetOption[]>(() => {
  if (!isSupplementProfile.value) {
    return [];
  }

  const options: SupplementTargetOption[] = [];

  for (const field of NUTRITION_FIELD_CATALOG) {
    const tabValues = formValue[field.tabKey] as Record<
      string,
      number | null | undefined
    >;
    const value = tabValues?.[field.fieldKey];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    options.push({
      fieldPath: field.fieldPath,
      label: field.label,
      unit: field.unit,
      valueText: `档案值 ${formatTargetValue(value)} ${field.unit}`,
    });
  }

  for (const derived of DERIVED_NUTRITION_FIELD_CATALOG) {
    if (derived.formula !== "SUM") {
      continue;
    }

    let total = 0;
    let complete = true;
    for (const sourceFieldPath of derived.sourceFieldPaths) {
      const sourceField = NUTRITION_FIELD_CATALOG.find(
        (field) => field.fieldPath === sourceFieldPath,
      );
      if (!sourceField) {
        complete = false;
        break;
      }
      const tabValues = formValue[sourceField.tabKey] as Record<
        string,
        number | null | undefined
      >;
      const value = tabValues?.[sourceField.fieldKey];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        complete = false;
        break;
      }
      total += value;
    }

    if (complete && total > 0) {
      options.push({
        fieldPath: derived.fieldPath,
        label: derived.label,
        unit: derived.unit,
        valueText: `组合合计 ${formatTargetValue(total)} ${derived.unit}`,
      });
    }
  }

  return options;
});

const selectedDefaultTargets = computed<SupplementTargetDefinition[]>(() => {
  const optionByFieldPath = new Map(
    supplementTargetOptions.value.map((option) => [option.fieldPath, option]),
  );

  return selectedTargetFieldPaths.value
    .map((fieldPath) => optionByFieldPath.get(fieldPath))
    .filter((option): option is SupplementTargetOption => Boolean(option))
    .map((option) => ({
      fieldPath: option.fieldPath,
      label: option.label,
      unit: option.unit,
    }));
});

function buildDefaultSupplementTargetPayload(): NutritionSupplementTarget[] {
  const optionByFieldPath = new Map(
    supplementTargetOptions.value.map((option) => [option.fieldPath, option]),
  );
  const seenFieldPaths = new Set<string>();

  return selectedTargetFieldPaths.value
    .filter((fieldPath) => {
      if (seenFieldPaths.has(fieldPath)) {
        return false;
      }
      seenFieldPaths.add(fieldPath);
      return true;
    })
    .map((fieldPath) => optionByFieldPath.get(fieldPath))
    .filter((option): option is SupplementTargetOption => Boolean(option))
    .map((option) => ({
      fieldPath: option.fieldPath,
      label: option.label,
      unit: option.unit,
    }));
}

/** 已选字段被清空时移除它并给出明确提示，避免保存一个空字段目标 */
function pruneInvalidDefaultTargets() {
  if (!isSupplementProfile.value) {
    return;
  }

  const availableFieldPaths = new Set(
    supplementTargetOptions.value.map((option) => option.fieldPath),
  );
  const invalidFieldPaths = selectedTargetFieldPaths.value.filter(
    (fieldPath) => !availableFieldPaths.has(fieldPath),
  );
  if (invalidFieldPaths.length === 0) {
    return;
  }

  const invalidDefinitions = invalidFieldPaths
    .map((fieldPath) => resolveSupplementTargetDefinition(fieldPath))
    .filter(
      (definition): definition is SupplementTargetDefinition =>
        Boolean(definition),
    );
  ignoredDefaultTargets.value = invalidDefinitions;
  selectedTargetFieldPaths.value = selectedTargetFieldPaths.value.filter(
    (fieldPath) => availableFieldPaths.has(fieldPath),
  );
}


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
    pruneInvalidDefaultTargets();
  },
  { immediate: true, deep: true },
);

watch(
  () => props.defaultSupplementTargets,
  (targets) => {
    if (!isSupplementProfile.value) {
      selectedTargetFieldPaths.value = [];
      ignoredDefaultTargets.value = [];
      return;
    }

    const definitions = normalizeSupplementTargetDefinitions(targets);
    const availableFieldPaths = new Set(
      supplementTargetOptions.value.map((option) => option.fieldPath),
    );
    const validDefinitions = definitions.filter((definition) =>
      availableFieldPaths.has(definition.fieldPath),
    );

    ignoredDefaultTargets.value = definitions.filter(
      (definition) => !availableFieldPaths.has(definition.fieldPath),
    );

    syncingDefaultTargets = true;
    selectedTargetFieldPaths.value = validDefinitions.map(
      (definition) => definition.fieldPath,
    );
    /**
     * 以「档案里原样的目标」作为已同步快照：
     * 如果其中有当前档案已为空/为 0 的字段，下面的 selected 监听会把
     * 校正后的有效目标 emit 回父组件，避免保存时又把失效目标写回去。
     */
    lastEmittedDefaultTargetsSnapshot = serializeValue(
      definitions.map((definition) => ({
        fieldPath: definition.fieldPath,
        label: definition.label,
        unit: definition.unit,
      })),
    );
    syncingDefaultTargets = false;
  },
  { immediate: true, deep: true },
);

watch(
  selectedTargetFieldPaths,
  () => {
    if (syncingDefaultTargets) {
      return;
    }

    const payload = buildDefaultSupplementTargetPayload();
    const snapshot = serializeValue(payload);
    if (snapshot === lastEmittedDefaultTargetsSnapshot) {
      return;
    }

    lastEmittedDefaultTargetsSnapshot = snapshot;
    emit("update:defaultSupplementTargets", payload);
  },
  { deep: true },
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
    pruneInvalidDefaultTargets();
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

.supplement-target-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.supplement-target-select {
  width: 100%;
}

.supplement-target-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.supplement-target-option-meta {
  font-size: 12px;
  color: #909399;
}

.supplement-target-hint {
  margin-top: 0;
}

.supplement-target-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.supplement-target-preview-hint {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.supplement-target-ignored {
  font-size: 12px;
  line-height: 1.6;
  color: #e6a23c;
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

<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    top="12vh"
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    @update:model-value="onVisibleChange"
  >
    <div class="supplement-target-dialog">
      <div class="dialog-context">
        <div class="context-name">{{ ingredientName || "补剂" }}</div>
        <div class="context-profile">
          营养档案：{{ nutritionFoodName || "未命名档案" }}
        </div>
      </div>

      <el-alert
        v-if="!hasProfile"
        type="error"
        :closable="false"
        show-icon
        title="无法读取营养档案"
        description="缺少营养档案数据，无法选择目标营养素；请先在原料管理中检查该补剂档案。"
      />

      <el-alert
        v-else-if="candidates.length === 0"
        type="error"
        :closable="false"
        show-icon
        title="该档案没有可用的目标营养素"
        description="营养档案中所有字段都为空或为 0。请先补齐该补剂的营养数据（数值需大于 0），再添加或修改目标。"
      />

      <template v-else>
        <div class="field-label">目标营养素（可多选）</div>
        <el-select
          v-model="selectedFieldPaths"
          multiple
          filterable
          clearable
          class="target-select"
          placeholder="选择该补剂要提供的营养素"
          :disabled="saving"
        >
          <el-option
            v-for="option in candidates"
            :key="option.fieldPath"
            :label="option.label"
            :value="option.fieldPath"
          >
            <div class="target-option">
              <span class="target-option-label">{{ option.label }}</span>
              <span class="target-option-meta">
                {{ option.valueText }}
                <template v-if="option.source === 'DERIVED'">
                  · 组合字段
                </template>
              </span>
            </div>
          </el-option>
        </el-select>

        <div v-if="selectedTargets.length" class="selected-targets">
          <el-tag
            v-for="target in selectedTargets"
            :key="target.fieldPath"
            type="warning"
            effect="plain"
          >
            {{ target.label }}（{{ target.unit }}）
          </el-tag>
        </div>

        <el-alert
          v-if="selectedTargets.length === 0"
          class="target-validation"
          type="warning"
          :closable="false"
          show-icon
          title="必须选择至少一个目标营养素"
          description="补剂没有明确目标时不允许添加或保存，系统不会按营养缺口自动推断。"
        />
        <el-alert
          v-else
          class="target-validation"
          type="info"
          :closable="false"
          show-icon
          :title="`已选择 ${selectedTargets.length} 个目标营养素`"
          description="一个目标对应一个营养素字段；组合目标（如 EPA + DHA）请选择派生字段。"
        />

        <div v-if="ignoredInitialCount > 0" class="ignored-hint">
          已忽略 {{ ignoredInitialCount }} 个当前档案中为空或为 0
          的预选目标，请重新选择。
        </div>
      </template>
    </div>

    <template #footer>
      <el-button :disabled="saving" @click="onVisibleChange(false)">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!canConfirm"
        @click="confirm"
      >
        {{ mode === "edit" ? "保存目标" : "添加补剂" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  listSupplementTargetFieldCandidates,
  normalizeSupplementTargetDefinitions,
  type SupplementTargetDefinition,
  type SupplementTargetFieldCandidate,
} from "@/utils/recipeDesigner/supplementTargets";

interface Props {
  modelValue: boolean;
  mode?: "add" | "edit";
  ingredientName?: string;
  nutritionFoodName?: string;
  /** 补剂营养档案的 nutritionData（原始 JSON，工具内部会归一化） */
  profile: unknown;
  /** 预选目标（默认目标 / 智能添加时的当前营养素） */
  initialTargets?: Array<{
    fieldPath: string;
    label?: string | null;
    unit?: string | null;
  }>;
  saving?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode: "add",
  ingredientName: "",
  nutritionFoodName: "",
  initialTargets: () => [],
  saving: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", targets: SupplementTargetDefinition[]): void;
}>();

const selectedFieldPaths = ref<string[]>([]);
const ignoredInitialCount = ref(0);

const dialogTitle = computed(() =>
  props.mode === "edit" ? "修改补剂目标营养素" : "选择补剂目标营养素",
);

const hasProfile = computed(() => Boolean(props.profile));

const candidates = computed(() =>
  listSupplementTargetFieldCandidates(props.profile),
);

const candidateByFieldPath = computed(
  () =>
    new Map(candidates.value.map((candidate) => [candidate.fieldPath, candidate])),
);

const selectedTargets = computed<SupplementTargetDefinition[]>(() =>
  selectedFieldPaths.value
    .map((fieldPath) => candidateByFieldPath.value.get(fieldPath))
    .filter(
      (candidate): candidate is SupplementTargetFieldCandidate =>
        Boolean(candidate),
    )
    .map((candidate) => ({
      fieldPath: candidate.fieldPath,
      label: candidate.label,
      unit: candidate.unit,
    })),
);

const canConfirm = computed(
  () =>
    Boolean(props.profile) &&
    selectedTargets.value.length > 0 &&
    !props.saving,
);

function resetSelection() {
  const defaults = normalizeSupplementTargetDefinitions(props.initialTargets);
  const availableFieldPaths = new Set(
    candidates.value.map((candidate) => candidate.fieldPath),
  );
  const validFieldPaths = defaults
    .map((target) => target.fieldPath)
    .filter((fieldPath) => availableFieldPaths.has(fieldPath));
  const uniqueFieldPaths = [...new Set(validFieldPaths)];

  selectedFieldPaths.value = uniqueFieldPaths;
  ignoredInitialCount.value = defaults.length - uniqueFieldPaths.length;
}

watch(
  () => [props.modelValue, props.profile, props.initialTargets] as const,
  ([visible]) => {
    if (visible) {
      resetSelection();
    }
  },
  { immediate: true },
);

function onVisibleChange(value: boolean) {
  if (!value && props.saving) {
    return;
  }
  emit("update:modelValue", value);
}

function confirm() {
  if (!canConfirm.value) {
    return;
  }
  emit(
    "confirm",
    selectedTargets.value.map((target) => ({ ...target })),
  );
}
</script>

<style scoped>
.supplement-target-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-context {
  padding: 12px 14px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fafafa;
}

.context-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.context-profile {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.target-select {
  width: 100%;
}

.target-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.target-option-label {
  color: #303133;
}

.target-option-meta {
  font-size: 12px;
  color: #909399;
}

.selected-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.target-validation {
  margin-top: 2px;
}

.ignored-hint {
  font-size: 12px;
  line-height: 1.6;
  color: #e6a23c;
}
</style>

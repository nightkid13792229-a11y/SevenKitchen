<template>
  <div v-if="profile" class="nutrition-preview">
    <div class="preview-meta">
      <el-tag size="small" type="info">{{ rawBasisLabel }}</el-tag>
      <span class="meta-text">{{ sourceLabel }}</span>
    </div>
    <div class="nutrient-groups">
      <div
        v-for="group in nutrientGroups"
        :key="group.key"
        class="nutrient-group"
      >
        <div class="group-header">
          <span>{{ group.label }}</span>
          <el-tag size="small" effect="plain">
            已填 {{ group.filledCount }}/{{ group.items.length }}
          </el-tag>
        </div>
        <div class="nutrient-grid">
          <div
            v-for="item in group.items"
            :key="item.fieldPath"
            class="nutrient-item"
            :class="{ missing: !item.hasValue }"
          >
            <span class="nutrient-label">{{ item.label }}</span>
            <span class="nutrient-value">{{
              formatValue(item.value, item.unit)
            }}</span>
            <span v-if="item.sourceSummary" class="source-nutrient">
              来源项：{{ item.sourceSummary }}
            </span>
            <span v-if="item.conversionNote" class="source-nutrient">
              换算说明：{{ item.conversionNote }}
            </span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="reviewOnlyCustomItems.length" class="review-only-section">
      <div class="group-header">
        <span>相关来源项</span>
        <el-tag size="small" type="warning" effect="plain">未计入主字段</el-tag>
      </div>
      <div class="review-only-list">
        <div
          v-for="item in reviewOnlyCustomItems"
          :key="`${item.sourceNutrientId || item.name}-${item.value}`"
          class="review-only-item"
        >
          <div class="review-only-title">
            <span>{{ item.name }}</span>
            <el-tag size="small" type="warning" effect="plain">{{
              reviewCategoryLabel(item.reviewCategory)
            }}</el-tag>
          </div>
          <span class="nutrient-value">{{
            formatValue(item.value, item.unit)
          }}</span>
          <span v-if="item.canonicalFieldPath" class="source-nutrient"
            >对应主字段：{{ item.canonicalFieldPath }}</span
          >
          <span v-if="item.note" class="source-nutrient"
            >原因：{{ item.note }}</span
          >
        </div>
      </div>
    </div>
  </div>
  <el-empty v-else description="暂无营养预览" :image-size="56" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { INGREDIENT_NUTRITION_TAB_DEFINITIONS } from "@/constants/ingredientNutrition";
import type {
  NutritionCustomItem,
  NutritionProfile,
  NutritionSourceForm,
} from "@/types/ingredient";

const props = defineProps<{
  profile: NutritionProfile | null | undefined;
}>();

const rawBasisMap: Record<string, string> = {
  PER_100_G: "每 100g",
  PER_100_ML: "每 100ml",
  PER_1_G: "每 1g",
  PER_1_ML: "每 1ml",
  PER_SERVING: "每份",
};

const sourceTypeMap: Record<string, string> = {
  LAB_REPORT: "检测报告",
  LABEL: "标签",
  CFCT: "CFCT",
  USDA: "USDA",
  NZFCD: "NZFCD",
  LITERATURE: "文献",
  MANUAL_ESTIMATE: "人工估算",
};

const rawBasisLabel = computed(() => {
  const rawBasisType = props.profile?.meta?.rawBasisType;
  return rawBasisType ? rawBasisMap[rawBasisType] || rawBasisType : "原始基准";
});

const sourceLabel = computed(() => {
  const meta = props.profile?.meta;
  if (!meta) return "来源待补充";

  const sourceType = meta.sourceType
    ? sourceTypeMap[meta.sourceType] || meta.sourceType
    : "";
  return (
    [sourceType, meta.sourceTitle || meta.sourceProvider]
      .filter(Boolean)
      .join(" / ") || "来源待补充"
  );
});

const nutrientGroups = computed(() =>
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.map((tab) => {
    const items = tab.fields.map((field) => {
      const fieldPath = `${tab.key}.${field.key}`;
      const value = getTabValue(tab.key, field.key);
      const sourceForm = getSourceForm(fieldPath);
      return {
        fieldPath,
        label: field.label,
        value,
        unit: field.unit,
        sourceSummary: formatSourceSummary(sourceForm),
        conversionNote: getConversionNote(fieldPath),
        hasValue: typeof value === "number" && Number.isFinite(value),
      };
    });

    return {
      key: tab.key,
      label: tab.label,
      items,
      filledCount: items.filter((item) => item.hasValue).length,
    };
  }),
);

const reviewOnlyCustomItems = computed(() =>
  (props.profile?.customItems ?? []).filter(isReviewOnlyCustomItem),
);

function getTabValue(
  tabKey: string,
  fieldKey: string,
): number | null | undefined {
  const tab = props.profile?.[tabKey as keyof NutritionProfile];
  if (!tab || typeof tab !== "object" || Array.isArray(tab)) {
    return undefined;
  }

  const value = (tab as Record<string, unknown>)[fieldKey];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getSourceForm(fieldPath: string): NutritionSourceForm | undefined {
  return props.profile?.meta?.sourceForms?.[fieldPath];
}

function getConversionNote(fieldPath: string): string {
  return props.profile?.meta?.conversionNotes?.[fieldPath]?.trim() || "";
}

function formatValue(value: number | null | undefined, unit: string): string {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(3)} ${unit}`;
}

function formatSourceSummary(
  sourceForm: NutritionSourceForm | undefined,
): string {
  if (!sourceForm) return "";

  const sourceName = sourceForm.sourceNutrientName?.trim();
  if (!sourceName) return "";

  const originalValue = formatOriginalValue(sourceForm.originalValue);
  const originalUnit = sourceForm.originalUnit?.trim();
  const originalText =
    originalValue && originalUnit
      ? `（原始值 ${originalValue} ${originalUnit}）`
      : "";

  return [
    formatSourceBaseText(sourceName, originalText),
    formatConversionSummary(sourceForm),
  ]
    .filter(Boolean)
    .join("；");
}

function formatSourceBaseText(
  sourceName: string,
  originalText: string,
): string {
  return `${sourceName}${originalText}`;
}

function formatConversionSummary(sourceForm: NutritionSourceForm): string {
  const compound =
    typeof sourceForm.sourceCompound === "string"
      ? sourceForm.sourceCompound.trim()
      : "";
  const factor = sourceForm.conversionFactor;
  const factorUnit =
    typeof sourceForm.conversionFactorUnit === "string"
      ? sourceForm.conversionFactorUnit.trim()
      : "";
  const factorSource =
    typeof sourceForm.conversionFactorSource === "string"
      ? sourceForm.conversionFactorSource.trim()
      : "";

  if (!compound || typeof factor !== "number" || !Number.isFinite(factor)) {
    return "";
  }

  const factorText = formatFactorText(compound, factor, factorUnit);
  if (!factorText) {
    return "";
  }

  return ["换算", factorText, factorSource].filter(Boolean).join("，");
}

function formatFactorText(
  compound: string,
  factor: number,
  factorUnit: string,
): string {
  if (factorUnit === "IU_PER_MG") {
    return `${compound} 1 mg = ${formatOriginalValue(factor)} IU`;
  }
  if (factorUnit === "IU_PER_UG") {
    return `${compound} 1 μg = ${formatOriginalValue(factor)} IU`;
  }
  if (factorUnit === "MG_PER_G") {
    return `${compound} 1 g = ${formatOriginalValue(factor)} mg`;
  }
  if (factorUnit === "ELEMENTAL_FRACTION") {
    return `${compound} 元素占比 ${formatOriginalValue(factor)}`;
  }
  return "";
}

function formatOriginalValue(
  value: NutritionSourceForm["originalValue"],
): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(3);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
}

function isReviewOnlyCustomItem(item: NutritionCustomItem): boolean {
  return (
    item.reviewStatus === "NOT_COUNTED" ||
    !!item.reviewCategory?.startsWith("USDA_")
  );
}

function reviewCategoryLabel(category?: string | null): string {
  switch (category) {
    case "USDA_VITAMIN_A_RELATED":
      return "维 A 来源项";
    case "USDA_VITAMIN_D_RELATED":
      return "维 D 来源项";
    case "USDA_VITAMIN_E_RELATED":
      return "维 E 来源项";
    case "USDA_VITAMIN_K_RELATED":
      return "维 K 来源项";
    case "USDA_FATTY_ACID_RELATED":
      return "脂肪酸来源项";
    default:
      return "未计入主字段";
  }
}
</script>

<style scoped>
.nutrition-preview {
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.meta-text {
  color: #606266;
  font-size: 13px;
}

.nutrient-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(112px, 1fr));
  gap: 8px;
}

.nutrient-groups {
  display: grid;
  gap: 12px;
}

.review-only-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
}

.review-only-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 8px;
}

.review-only-item {
  min-width: 0;
  padding: 8px 10px;
  background: #fffaf0;
  border: 1px solid #faecd8;
  border-radius: 4px;
}

.review-only-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #303133;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.nutrient-group {
  min-width: 0;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.nutrient-item {
  min-width: 0;
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.nutrient-item.missing {
  background: #fafafa;
}

.nutrient-label {
  display: block;
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.nutrient-value {
  display: block;
  color: #303133;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.source-nutrient {
  display: block;
  margin-top: 2px;
  color: #909399;
  font-size: 11px;
  line-height: 16px;
  overflow-wrap: anywhere;
}

.nutrient-item.missing .nutrient-value {
  color: #c0c4cc;
}

@media (max-width: 720px) {
  .nutrient-grid {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }

  .review-only-list {
    grid-template-columns: 1fr;
  }
}
</style>

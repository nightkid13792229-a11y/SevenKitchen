<template>
  <div class="fediaf-target-preview-page">
    <div class="page-header">
      <div>
        <h2>FEDIAF 目标预览</h2>
        <p>按生命阶段和 MER 口径查看实际计算目标。</p>
      </div>
      <el-button :loading="loading" @click="loadTarget">刷新</el-button>
    </div>

    <el-card shadow="never" class="control-card">
      <el-form inline>
        <el-form-item label="目标生命阶段">
          <el-select
            v-model="lifeStage"
            style="width: 220px"
            @change="loadTarget"
          >
            <el-option
              v-for="option in lifeStageOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="target">
          <span class="entry-count">条目数：{{ target.entries.length }}</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="target" shadow="never">
      <el-descriptions :column="3" border>
        <el-descriptions-item label="标准版本">{{
          target.versionCode
        }}</el-descriptions-item>
        <el-descriptions-item label="目标">{{
          target.lifeStage
        }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{
          target.sourceType
        }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <el-table
        :data="target?.entries ?? []"
        v-loading="loading"
        border
        empty-text="暂无 FEDIAF 目标数据"
      >
        <el-table-column prop="sourceTable" label="来源表" width="90" />
        <el-table-column prop="pdfPage" label="页码" width="70" />
        <el-table-column
          prop="nutrientName"
          label="营养素"
          min-width="130"
          show-overflow-tooltip
        />
        <el-table-column
          prop="nutrientCode"
          label="内部代码"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column
          prop="basis"
          label="口径"
          min-width="170"
          show-overflow-tooltip
        />
        <el-table-column
          prop="unit"
          label="单位"
          width="120"
          show-overflow-tooltip
        />
        <el-table-column label="最小值" width="100">
          <template #default="{ row }">{{
            formatValue(row.minValue)
          }}</template>
        </el-table-column>
        <el-table-column label="最大值" width="100">
          <template #default="{ row }">{{
            formatValue(row.maxValue)
          }}</template>
        </el-table-column>
        <el-table-column label="推荐值" width="100">
          <template #default="{ row }">{{
            formatValue(row.recommendedValue)
          }}</template>
        </el-table-column>
        <el-table-column prop="reviewStatus" label="审核" width="110">
          <template #default="{ row }">
            <el-tag :type="reviewTagType(row.reviewStatus)">
              {{ reviewStatusLabel(row.reviewStatus) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { nutritionCalculationApi } from "@/api/nutritionCalculation";
import type {
  FediafTargetEntry,
  FediafTargetLifeStage,
  FediafTargetSelectionResult,
} from "@/types/nutritionCalculation";

type ReviewStatus = FediafTargetEntry["reviewStatus"];

const lifeStageOptions: Array<{
  label: string;
  value: FediafTargetLifeStage;
}> = [
  { value: "ADULT_MER_110", label: "成年犬 MER 110" },
  { value: "ADULT_MER_95", label: "成年犬 MER 95" },
  { value: "EARLY_GROWTH_UNDER_14_WEEKS", label: "幼犬 14 周前" },
  { value: "LATE_GROWTH_FROM_14_WEEKS", label: "幼犬 14 周后" },
  { value: "REPRODUCTION", label: "繁殖期" },
];

const lifeStage = ref<FediafTargetLifeStage>("ADULT_MER_110");
const target = ref<FediafTargetSelectionResult | null>(null);
const loading = ref(false);
let targetRequestSequence = 0;

function formatValue(value: number | null): string {
  return value === null || value === undefined ? "-" : String(value);
}

function reviewStatusLabel(status: ReviewStatus): string {
  const map: Record<ReviewStatus, string> = {
    UNREVIEWED: "未审核",
    REVIEWED: "已审核",
    QUESTION: "有疑问",
    NEEDS_FIX: "需修正",
  };
  return map[status];
}

function reviewTagType(status: ReviewStatus) {
  if (status === "REVIEWED") return "success";
  if (status === "QUESTION") return "warning";
  if (status === "NEEDS_FIX") return "danger";
  return "info";
}

async function loadTarget() {
  const requestSequence = ++targetRequestSequence;
  const requestedLifeStage = lifeStage.value;
  loading.value = true;
  try {
    const nextTarget = await nutritionCalculationApi.previewFediafTarget(
      requestedLifeStage,
    );
    if (requestSequence === targetRequestSequence) {
      target.value = nextTarget;
    }
  } catch {
    if (requestSequence === targetRequestSequence) {
      target.value = null;
    }
    // The shared API interceptor shows the request error message.
  } finally {
    if (requestSequence === targetRequestSequence) {
      loading.value = false;
    }
  }
}

onMounted(loadTarget);
</script>

<style scoped>
.fediaf-target-preview-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header h2 {
  margin: 0;
}

.page-header p {
  margin: 6px 0 0;
  color: #667085;
}

.control-card :deep(.el-card__body) {
  padding-bottom: 6px;
}

.entry-count {
  color: #667085;
  font-size: 13px;
}
</style>

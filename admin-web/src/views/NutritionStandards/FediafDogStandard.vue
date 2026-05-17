<template>
  <div class="fediaf-standard-page">
    <div class="page-header">
      <div>
        <h2>FEDIAF 2025 犬标准</h2>
        <p>标准值只读，仅支持审核标记和备注。</p>
      </div>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <el-row v-if="overview" :gutter="12" class="overview-row">
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">条目总数</div>
          <div class="metric-value">{{ overview.totalEntries }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">已审核</div>
          <div class="metric-value">{{ overview.reviewCounts.REVIEWED }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">有疑问</div>
          <div class="metric-value">{{ overview.reviewCounts.QUESTION }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">需修正</div>
          <div class="metric-value">{{ overview.reviewCounts.NEEDS_FIX }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="overview" shadow="never" class="version-card">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="标准名称">{{
          overview.version.name
        }}</el-descriptions-item>
        <el-descriptions-item label="发布年月">{{
          overview.version.publicationMonth
        }}</el-descriptions-item>
        <el-descriptions-item label="导入批次">{{
          overview.version.importBatch
        }}</el-descriptions-item>
        <el-descriptions-item label="来源">
          <a :href="overview.version.pdfUrl" target="_blank" rel="noreferrer"
            >官方 PDF</a
          >
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters">
        <el-form-item label="来源表">
          <el-select
            v-model="filters.sourceTable"
            clearable
            placeholder="全部"
            style="width: 150px"
          >
            <el-option
              v-for="item in sourceTableOptions"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="表类型">
          <el-select
            v-model="filters.sourceType"
            clearable
            placeholder="全部"
            style="width: 180px"
          >
            <el-option label="核心推荐表" value="CORE_RECOMMENDATION" />
            <el-option label="Annex 7.8" value="ANNEX_7_8" />
          </el-select>
        </el-form-item>
        <el-form-item label="生命周期">
          <el-input
            v-model="filters.lifeStage"
            clearable
            placeholder="如 ADULT_MER_110"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-input
            v-model="filters.category"
            clearable
            placeholder="如 MINERAL"
          />
        </el-form-item>
        <el-form-item label="审核">
          <el-select
            v-model="filters.reviewStatus"
            clearable
            placeholder="全部"
            style="width: 140px"
          >
            <el-option label="未审核" value="UNREVIEWED" />
            <el-option label="已审核" value="REVIEWED" />
            <el-option label="有疑问" value="QUESTION" />
            <el-option label="需修正" value="NEEDS_FIX" />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索">
          <el-input v-model="filters.search" clearable placeholder="营养素" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadEntries">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="entries" v-loading="loading" border>
        <el-table-column prop="sourceTable" label="来源表" width="90" />
        <el-table-column prop="pdfPage" label="页码" width="70" />
        <el-table-column prop="nutrientName" label="营养素" min-width="130" />
        <el-table-column prop="nutrientCode" label="内部代码" min-width="150" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="lifeStage" label="生命周期" min-width="150" />
        <el-table-column prop="basis" label="口径" min-width="170" />
        <el-table-column prop="unit" label="单位" width="110" />
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
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openReviewDialog(row)"
              >审核标记</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="reviewDialogVisible" title="审核标记" width="520px">
      <el-form :model="reviewForm" label-width="90px">
        <el-form-item label="状态">
          <el-select v-model="reviewForm.status" style="width: 100%">
            <el-option label="未审核" value="UNREVIEWED" />
            <el-option label="已审核" value="REVIEWED" />
            <el-option label="有疑问" value="QUESTION" />
            <el-option label="需修正" value="NEEDS_FIX" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="reviewForm.note"
            type="textarea"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingReview" @click="saveReview"
          >保存</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { nutritionStandardApi } from "@/api/nutritionStandards";
import type {
  NutritionStandardEntry,
  NutritionStandardEntryQuery,
  NutritionStandardOverview,
  NutritionStandardReviewStatus,
} from "@/types/nutritionStandard";

const sourceTableOptions = [
  "III-3a",
  "III-3b",
  "III-3c",
  "VII-17a",
  "VII-17b",
  "VII-17c",
  "VII-17d",
];

const overview = ref<NutritionStandardOverview | null>(null);
const entries = ref<NutritionStandardEntry[]>([]);
const loading = ref(false);
const savingReview = ref(false);
const reviewDialogVisible = ref(false);
const selectedEntry = ref<NutritionStandardEntry | null>(null);

const filters = reactive<NutritionStandardEntryQuery>({});
const reviewForm = reactive<{
  status: NutritionStandardReviewStatus;
  note: string;
}>({
  status: "REVIEWED",
  note: "",
});

function formatValue(value: number | null): string {
  return value === null || value === undefined ? "-" : String(value);
}

function reviewStatusLabel(status: NutritionStandardReviewStatus): string {
  const map: Record<NutritionStandardReviewStatus, string> = {
    UNREVIEWED: "未审核",
    REVIEWED: "已审核",
    QUESTION: "有疑问",
    NEEDS_FIX: "需修正",
  };
  return map[status];
}

function reviewTagType(status: NutritionStandardReviewStatus) {
  if (status === "REVIEWED") return "success";
  if (status === "QUESTION") return "warning";
  if (status === "NEEDS_FIX") return "danger";
  return "info";
}

async function loadOverview() {
  overview.value = await nutritionStandardApi.getFediaf2025DogOverview();
}

async function loadEntries(options: { manageLoading?: boolean } = {}) {
  if (options.manageLoading !== false) {
    loading.value = true;
  }
  try {
    entries.value = await nutritionStandardApi.listFediaf2025DogEntries({
      ...filters,
    });
  } finally {
    if (options.manageLoading !== false) {
      loading.value = false;
    }
  }
}

async function loadData() {
  loading.value = true;
  try {
    await Promise.all([loadOverview(), loadEntries({ manageLoading: false })]);
  } finally {
    loading.value = false;
  }
}

function openReviewDialog(row: NutritionStandardEntry) {
  selectedEntry.value = row;
  reviewForm.status = row.reviewStatus;
  reviewForm.note = row.reviewNote || "";
  reviewDialogVisible.value = true;
}

async function saveReview() {
  if (!selectedEntry.value) return;
  savingReview.value = true;
  try {
    await nutritionStandardApi.updateFediaf2025DogEntryReview(
      selectedEntry.value.id,
      {
        status: reviewForm.status,
        note: reviewForm.note,
      },
    );
    ElMessage.success("审核标记已保存");
    reviewDialogVisible.value = false;
    await loadData();
  } finally {
    savingReview.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped>
.fediaf-standard-page {
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

.metric-label {
  color: #667085;
  font-size: 13px;
}

.metric-value {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
}
</style>

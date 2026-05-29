<template>
  <div class="ingredient-readiness-page">
    <div class="page-header">
      <div>
        <h2>原料计算就绪度</h2>
        <p>检查原料营养档案是否足够支持 FEDIAF 计算。</p>
      </div>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <div v-if="summary" class="metric-grid">
      <el-card shadow="never">
        <div class="metric-label">原料总数</div>
        <div class="metric-value">{{ summary.totalIngredients }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="metric-label">完整就绪</div>
        <div class="metric-value">{{ summary.readyFull }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="metric-label">基础就绪</div>
        <div class="metric-value">{{ summary.readyBasic }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="metric-label">部分就绪</div>
        <div class="metric-value">{{ summary.partial }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="metric-label">未就绪</div>
        <div class="metric-value">{{ summary.notReady }}</div>
      </el-card>
    </div>

    <el-card shadow="never" class="ranking-card">
      <template #header>
        <span>高频缺失营养素</span>
      </template>
      <div v-if="topMissingNutrients.length > 0" class="ranking-tags">
        <el-tag
          v-for="item in topMissingNutrients"
          :key="item.nutrientCode"
          type="warning"
          effect="plain"
        >
          {{ item.nutrientCode }} · {{ item.count }}
        </el-tag>
      </div>
      <el-empty v-else description="暂无缺失营养素" :image-size="60" />
    </el-card>

    <el-card shadow="never">
      <el-table
        :data="filteredItems"
        v-loading="loading"
        border
        empty-text="暂无原料就绪度数据"
      >
        <el-table-column
          prop="ingredientName"
          label="原料"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column
          prop="ingredientType"
          label="类型"
          width="120"
          show-overflow-tooltip
        />
        <el-table-column label="就绪度" width="110">
          <template #default="{ row }">
            <el-tag :type="readinessTagType(row.readinessLevel)">
              {{ readinessLabel(row.readinessLevel) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="覆盖率" width="90">
          <template #default="{ row }">
            {{ formatPercent(row.coverageRatio) }}
          </template>
        </el-table-column>
        <el-table-column label="能量" width="80">
          <template #default="{ row }">
            <el-tag :type="presenceTagType(row.hasEnergy)" effect="plain">
              {{ presenceLabel(row.hasEnergy) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="水分" width="80">
          <template #default="{ row }">
            <el-tag :type="presenceTagType(row.hasMoisture)" effect="plain">
              {{ presenceLabel(row.hasMoisture) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="营养库映射" width="110">
          <template #default="{ row }">
            <el-tag
              :type="presenceTagType(row.hasNutritionFoodMapping)"
              effect="plain"
            >
              {{ presenceLabel(row.hasNutritionFoodMapping) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="缺失营养素" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatMissingNutrients(row.missingNutrients) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { nutritionCalculationApi } from "@/api/nutritionCalculation";
import type {
  IngredientReadinessItem,
  IngredientReadinessLevel,
  IngredientReadinessResult,
  MissingNutrientRankingItem,
} from "@/types/nutritionCalculation";

const data = ref<IngredientReadinessResult | null>(null);
const loading = ref(false);

const summary = computed(() => data.value?.summary ?? null);
const filteredItems = computed<IngredientReadinessItem[]>(
  () => data.value?.items ?? [],
);
const topMissingNutrients = computed<MissingNutrientRankingItem[]>(() =>
  (data.value?.missingNutrientRanking ?? []).slice(0, 20),
);

function readinessLabel(level: IngredientReadinessLevel): string {
  const map: Record<IngredientReadinessLevel, string> = {
    READY_FULL: "完整就绪",
    READY_BASIC: "基础就绪",
    PARTIAL: "部分就绪",
    NOT_READY: "未就绪",
  };
  return map[level];
}

function readinessTagType(level: IngredientReadinessLevel) {
  if (level === "READY_FULL") return "success";
  if (level === "READY_BASIC") return "primary";
  if (level === "PARTIAL") return "warning";
  return "danger";
}

function presenceLabel(value: boolean): string {
  return value ? "有" : "缺";
}

function presenceTagType(value: boolean) {
  return value ? "success" : "danger";
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatMissingNutrients(nutrients: string[]): string {
  const visibleNutrients = nutrients.slice(0, 8);
  return visibleNutrients.length > 0 ? visibleNutrients.join(", ") : "-";
}

async function loadData() {
  loading.value = true;
  try {
    data.value = await nutritionCalculationApi.listIngredientReadiness();
  } catch {
    // The shared API interceptor shows the request error message.
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped>
.ingredient-readiness-page {
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

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr));
  gap: 12px;
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

.ranking-card :deep(.el-card__header) {
  padding: 12px 16px;
}

.ranking-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 1200px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
  }
}
</style>

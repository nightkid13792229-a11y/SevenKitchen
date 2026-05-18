<template>
  <div class="overview-grid">
    <el-card
      v-for="item in items"
      :key="item.label"
      class="overview-card"
      shadow="hover"
    >
      <div class="card-label">{{ item.label }}</div>
      <div class="card-value" :class="item.className">
        {{ formatCount(item.value) }}
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NutritionGovernanceOverview } from '@/types/nutritionGovernance'

const props = defineProps<{
  overview: NutritionGovernanceOverview | null
}>()

const items = computed(() => [
  {
    label: '食材原料',
    value: props.overview?.foodIngredientCount,
    className: 'is-food'
  },
  {
    label: '补剂原料',
    value: props.overview?.supplementIngredientCount,
    className: 'is-supplement'
  },
  {
    label: '已确认档案',
    value: props.overview?.confirmedNutritionProfileCount,
    className: 'is-confirmed'
  },
  {
    label: '待确认候选',
    value: props.overview?.candidateCount,
    className: 'is-candidate'
  },
  {
    label: '补剂草稿',
    value: props.overview?.supplementDraftCount,
    className: 'is-draft'
  },
  {
    label: '缺失/不完整',
    value: props.overview?.incompleteProfileCount,
    className: 'is-warning'
  }
])

function formatCount(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '-'
}
</script>

<style scoped>
.overview-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 12px;
}

.overview-card :deep(.el-card__body) {
  padding: 14px 16px;
}

.card-label {
  color: #606266;
  font-size: 13px;
  line-height: 20px;
}

.card-value {
  color: #303133;
  font-size: 24px;
  font-weight: 600;
  line-height: 32px;
  margin-top: 4px;
}

.card-value.is-food {
  color: #409eff;
}

.card-value.is-supplement {
  color: #67c23a;
}

.card-value.is-confirmed {
  color: #529b2e;
}

.card-value.is-candidate {
  color: #e6a23c;
}

.card-value.is-draft {
  color: #909399;
}

.card-value.is-warning {
  color: #f56c6c;
}

@media (max-width: 1200px) {
  .overview-grid {
    grid-template-columns: repeat(3, minmax(140px, 1fr));
  }
}

@media (max-width: 720px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}
</style>

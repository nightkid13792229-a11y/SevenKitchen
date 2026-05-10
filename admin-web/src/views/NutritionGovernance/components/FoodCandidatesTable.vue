<template>
  <el-card shadow="never" class="table-card">
    <el-table
      v-loading="loading"
      :data="candidates"
      stripe
      style="width: 100%"
      empty-text="暂无待确认候选"
    >
      <el-table-column type="expand" width="48">
        <template #default="{ row }">
          <NutritionProfilePreview :profile="row.normalizedNutrition" />
        </template>
      </el-table-column>

      <el-table-column label="后台原料" min-width="160">
        <template #default="{ row }">
          <div class="primary-text">{{ row.ingredient?.name || '-' }}</div>
          <div class="secondary-text">{{ row.ingredient?.id || row.ingredientId }}</div>
        </template>
      </el-table-column>

      <el-table-column label="来源" width="130">
        <template #default="{ row }">
          <el-tag size="small" type="info">
            {{ row.sourceRecord?.sourceType || '-' }}
          </el-tag>
          <div class="secondary-text source-key">{{ row.sourceRecord?.sourceKey || '-' }}</div>
        </template>
      </el-table-column>

      <el-table-column label="候选食物" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="primary-text">{{ row.sourceRecord?.foodName || row.sourceRecord?.sourceTitle || '-' }}</div>
          <div class="secondary-text">{{ row.sourceRecord?.foodNameEn || row.sourceRecord?.category || '-' }}</div>
        </template>
      </el-table-column>

      <el-table-column label="置信度" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="confidenceTagType(row.confidence)" size="small">
            {{ confidenceLabel(row.confidence) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="分数" width="90" align="right">
        <template #default="{ row }">
          {{ formatScore(row.score) }}
        </template>
      </el-table-column>

      <el-table-column label="原因" min-width="220">
        <template #default="{ row }">
          <div class="reason-list">
            <el-tag
              v-for="reason in row.matchReasons"
              :key="`${row.id}-${reason.code}-${reason.label}`"
              size="small"
              effect="plain"
            >
              {{ reason.label }}
            </el-tag>
            <span v-if="!row.matchReasons?.length" class="muted">-</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            link
            :disabled="!!busyId"
            :loading="busyId === row.id"
            @click="$emit('confirm', row)"
          >
            确认
          </el-button>
          <el-button
            type="danger"
            size="small"
            link
            :disabled="!!busyId"
            :loading="busyId === row.id"
            @click="$emit('reject', row)"
          >
            拒绝
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import type { TagProps } from 'element-plus'
import NutritionProfilePreview from './NutritionProfilePreview.vue'
import type {
  IngredientNutritionCandidateListItem,
  NutritionMatchConfidence
} from '@/types/nutritionGovernance'

defineProps<{
  candidates: IngredientNutritionCandidateListItem[]
  loading: boolean
  busyId?: string
}>()

defineEmits<{
  (e: 'confirm', candidate: IngredientNutritionCandidateListItem): void
  (e: 'reject', candidate: IngredientNutritionCandidateListItem): void
}>()

const confidenceLabels: Record<NutritionMatchConfidence, string> = {
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低'
}

function confidenceLabel(confidence: NutritionMatchConfidence): string {
  return confidenceLabels[confidence] || confidence
}

function confidenceTagType(confidence: NutritionMatchConfidence): TagProps['type'] {
  const tagTypes: Record<NutritionMatchConfidence, TagProps['type']> = {
    HIGH: 'success',
    MEDIUM: 'warning',
    LOW: 'info'
  }
  return tagTypes[confidence] || 'info'
}

function formatScore(score: number): string {
  return typeof score === 'number' ? score.toFixed(2) : '-'
}
</script>

<style scoped>
.table-card :deep(.el-card__body) {
  padding: 0;
}

.primary-text {
  color: #303133;
  font-weight: 500;
  line-height: 20px;
}

.secondary-text {
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.source-key {
  margin-top: 2px;
  overflow-wrap: anywhere;
}

.reason-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.muted {
  color: #909399;
}
</style>

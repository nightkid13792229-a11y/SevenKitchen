<template>
  <el-card shadow="never" class="draft-card">
    <el-table
      v-if="drafts.length > 0"
      :data="drafts"
      stripe
      style="width: 100%"
    >
      <el-table-column label="补剂原料" min-width="180">
        <template #default="{ row }">
          <div class="primary-text">{{ row.ingredient?.name || row.ingredientId }}</div>
          <div class="secondary-text">{{ row.ingredientId }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ draftStatusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="缺失字段" min-width="220">
        <template #default="{ row }">
          <div class="field-tags">
            <el-tag
              v-for="field in row.missingFields"
              :key="field"
              size="small"
              type="warning"
              effect="plain"
            >
              {{ field }}
            </el-tag>
            <span v-if="!row.missingFields?.length" class="muted">无</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-else
      description="暂无可查看的补剂草稿列表"
      :image-size="80"
    />
  </el-card>
</template>

<script setup lang="ts">
import type { SupplementNutritionDraft } from '@/types/nutritionGovernance'

defineProps<{
  drafts: SupplementNutritionDraft[]
}>()

function draftStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: '草稿',
    CONFIRMED: '已确认',
    REJECTED: '已拒绝'
  }
  return labels[status] || status
}

function formatDate(value: string | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.draft-card :deep(.el-card__body) {
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

.field-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.muted {
  color: #909399;
}
</style>

<template>
  <el-card shadow="never" class="draft-card">
    <el-table
      v-if="drafts.length > 0"
      v-loading="loading"
      :data="drafts"
      stripe
      style="width: 100%"
    >
      <el-table-column type="expand" width="48">
        <template #default="{ row }">
          <div class="draft-detail">
            <el-image
              :src="row.imageUrl"
              fit="cover"
              class="label-image"
              :preview-src-list="[row.imageUrl]"
              preview-teleported
            />
            <div class="draft-preview">
              <div class="ocr-text">{{ row.ocrText || '暂无 OCR 文本' }}</div>
              <NutritionProfilePreview :profile="row.normalizedNutrition" />
            </div>
          </div>
        </template>
      </el-table-column>

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
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            link
            :disabled="!!busyId || !row.normalizedNutrition"
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

    <el-empty
      v-else
      v-loading="loading"
      description="暂无可查看的补剂草稿列表"
      :image-size="80"
    />
  </el-card>
</template>

<script setup lang="ts">
import type { SupplementNutritionDraft } from '@/types/nutritionGovernance'
import NutritionProfilePreview from './NutritionProfilePreview.vue'

defineProps<{
  drafts: SupplementNutritionDraft[]
  loading: boolean
  busyId?: string
}>()

defineEmits<{
  (e: 'confirm', draft: SupplementNutritionDraft): void
  (e: 'reject', draft: SupplementNutritionDraft): void
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

.draft-detail {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 12px;
  padding: 8px 12px;
}

.label-image {
  width: 160px;
  height: 120px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.draft-preview {
  min-width: 0;
}

.ocr-text {
  margin-bottom: 8px;
  color: #606266;
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .draft-detail {
    grid-template-columns: 1fr;
  }
}
</style>

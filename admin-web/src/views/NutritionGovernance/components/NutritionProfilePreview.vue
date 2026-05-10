<template>
  <div v-if="profile" class="nutrition-preview">
    <div class="preview-meta">
      <el-tag size="small" type="info">{{ rawBasisLabel }}</el-tag>
      <span class="meta-text">{{ sourceLabel }}</span>
    </div>
    <div class="nutrient-grid">
      <div
        v-for="item in nutrients"
        :key="item.label"
        class="nutrient-item"
      >
        <span class="nutrient-label">{{ item.label }}</span>
        <span class="nutrient-value">{{ formatValue(item.value, item.unit) }}</span>
      </div>
    </div>
  </div>
  <el-empty v-else description="暂无营养预览" :image-size="56" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NutritionProfile } from '@/types/ingredient'

const props = defineProps<{
  profile: NutritionProfile | null | undefined
}>()

const rawBasisMap: Record<string, string> = {
  PER_100_G: '每 100g',
  PER_100_ML: '每 100ml',
  PER_1_G: '每 1g',
  PER_1_ML: '每 1ml',
  PER_SERVING: '每份'
}

const sourceTypeMap: Record<string, string> = {
  LAB_REPORT: '检测报告',
  LABEL: '标签',
  CFCT: 'CFCT',
  USDA: 'USDA',
  LITERATURE: '文献',
  MANUAL_ESTIMATE: '人工估算'
}

const rawBasisLabel = computed(() => {
  const rawBasisType = props.profile?.meta?.rawBasisType
  return rawBasisType ? rawBasisMap[rawBasisType] || rawBasisType : '原始基准'
})

const sourceLabel = computed(() => {
  const meta = props.profile?.meta
  if (!meta) return '来源待补充'

  const sourceType = meta.sourceType ? sourceTypeMap[meta.sourceType] || meta.sourceType : ''
  return [sourceType, meta.sourceTitle || meta.sourceProvider].filter(Boolean).join(' / ') || '来源待补充'
})

const nutrients = computed(() => [
  {
    label: '能量',
    value: props.profile?.macros?.energyKcal,
    unit: 'kcal'
  },
  {
    label: '蛋白质',
    value: props.profile?.macros?.crudeProtein,
    unit: 'g'
  },
  {
    label: '脂肪',
    value: props.profile?.macros?.crudeFat,
    unit: 'g'
  },
  {
    label: '钙',
    value: props.profile?.minerals?.calcium,
    unit: 'mg'
  },
  {
    label: '磷',
    value: props.profile?.minerals?.phosphorus,
    unit: 'mg'
  }
])

function formatValue(value: number | null | undefined, unit: string): string {
  if (typeof value !== 'number') return '-'
  return `${Number.isInteger(value) ? value : value.toFixed(2)} ${unit}`
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
  grid-template-columns: repeat(5, minmax(88px, 1fr));
  gap: 8px;
}

.nutrient-item {
  min-width: 0;
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

@media (max-width: 720px) {
  .nutrient-grid {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }
}
</style>

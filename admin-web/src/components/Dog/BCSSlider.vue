<template>
  <div class="bcs-slider">
    <div class="bcs-header">
      <span class="bcs-label">体况评分 (BCS)</span>
      <span class="bcs-value" :class="`bcs-${bcsLevel}`">{{ modelValue }}</span>
    </div>
    <div class="bcs-description">{{ bcsDescription }}</div>
    <el-slider
      :model-value="modelValue"
      @update:model-value="handleChange"
      :min="1"
      :max="9"
      :step="1"
      :marks="bcsMarks"
      :show-tooltip="false"
    />
    <div class="bcs-legend">
      <span class="legend-item underweight">1-3 偏瘦</span>
      <span class="legend-item ideal">4-5 理想</span>
      <span class="legend-item overweight">6-9 偏胖</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: number
}

interface Emits {
  (e: 'update:modelValue', value: number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleChange = (value: number) => {
  emit('update:modelValue', value)
}

const bcsLevel = computed(() => {
  const score = props.modelValue
  if (score <= 3) return 'underweight'
  if (score <= 5) return 'ideal'
  return 'overweight'
})

const bcsDescription = computed(() => {
  const score = props.modelValue
  if (score <= 3) return '偏瘦 - 需要增加营养摄入'
  if (score <= 5) return '理想 - 保持当前喂养方案'
  return '偏胖 - 建议控制饮食'
})

const bcsMarks: Record<number, string> = {
  1: '1',
  3: '3',
  5: '5',
  7: '7',
  9: '9'
}
</script>

<style scoped>
.bcs-slider {
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.bcs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.bcs-label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.bcs-value {
  font-size: 24px;
  font-weight: bold;
}

.bcs-value.bcs-underweight {
  color: #409eff;
}

.bcs-value.bcs-ideal {
  color: #67c23a;
}

.bcs-value.bcs-overweight {
  color: #e6a23c;
}

.bcs-description {
  font-size: 13px;
  color: #606266;
  margin-bottom: 16px;
}

.bcs-legend {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 12px;
}

.legend-item {
  padding: 4px 8px;
  border-radius: 4px;
}

.legend-item.underweight {
  color: #409eff;
  background-color: rgba(64, 158, 255, 0.1);
}

.legend-item.ideal {
  color: #67c23a;
  background-color: rgba(103, 194, 58, 0.1);
}

.legend-item.overweight {
  color: #e6a23c;
  background-color: rgba(230, 162, 60, 0.1);
}
</style>

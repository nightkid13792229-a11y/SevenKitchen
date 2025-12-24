<template>
  <div class="treat-config">
    <div class="treat-header">
      <span class="treat-label">零食配置</span>
    </div>

    <div class="treat-mode-selector">
      <span class="mode-label">零食模式:</span>
      <el-radio-group
        :model-value="treatInputMode"
        @update:model-value="handleModeChange"
      >
        <el-radio :label="TreatInputMode.ESTIMATE_LEVEL">估算模式</el-radio>
        <el-radio :label="TreatInputMode.EXACT_KCAL">精确模式</el-radio>
      </el-radio-group>
    </div>

    <!-- Estimate Mode -->
    <div v-if="treatInputMode === TreatInputMode.ESTIMATE_LEVEL" class="treat-estimate">
      <div class="level-label">零食习惯:</div>
      <el-radio-group
        :model-value="treatLevel"
        @update:model-value="handleLevelChange"
      >
        <el-radio
          v-for="(label, level) in TreatLevelLabels"
          :key="level"
          :label="level as TreatLevel"
        >
          {{ label }}
        </el-radio>
      </el-radio-group>
      <div class="level-hint">
        {{ treatLevelHint }}
      </div>
    </div>

    <!-- Exact Mode -->
    <div v-if="treatInputMode === TreatInputMode.EXACT_KCAL" class="treat-exact">
      <div class="exact-label">每日零食能量:</div>
      <el-input-number
        :model-value="manualTreatKcal"
        @update:model-value="handleExactChange"
        :min="0"
        :max="2000"
        :step="10"
        controls-position="right"
      />
      <span class="exact-unit">kcal</span>
      <div class="exact-hint">
        请输入每日喂食零食的大致卡路里数值
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TreatInputMode, TreatLevel, TreatLevelLabels } from '@/types/dog'

interface Props {
  treatInputMode: TreatInputMode
  treatLevel: TreatLevel
  manualTreatKcal: number | null
}

interface Emits {
  (e: 'update:treatInputMode', value: TreatInputMode): void
  (e: 'update:treatLevel', value: TreatLevel): void
  (e: 'update:manualTreatKcal', value: number | null): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleModeChange = (value: TreatInputMode) => {
  emit('update:treatInputMode', value)
  // Reset dependent fields when switching modes
  if (value === TreatInputMode.ESTIMATE_LEVEL) {
    emit('update:manualTreatKcal', null)
  } else {
    emit('update:treatLevel', TreatLevel.NONE)
  }
}

const handleLevelChange = (value: TreatLevel) => {
  emit('update:treatLevel', value)
}

const handleExactChange = (value: number | null) => {
  emit('update:manualTreatKcal', value)
}

const treatLevelHint = computed(() => {
  const hints: Record<TreatLevel, string> = {
    [TreatLevel.NONE]: '不喂零食 (0% DER)',
    [TreatLevel.LOW]: '偶尔喂零食 (3% DER)',
    [TreatLevel.MODERATE]: '经常喂零食 (6% DER)',
    [TreatLevel.HIGH]: '大量喂零食 (10% DER, 上限)'
  }
  return hints[props.treatLevel] || ''
})
</script>

<style scoped>
.treat-config {
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.treat-header {
  margin-bottom: 16px;
}

.treat-label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.treat-mode-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.mode-label {
  font-size: 14px;
  color: #606266;
}

.treat-estimate {
  padding-top: 12px;
  border-top: 1px solid #dcdfe6;
}

.level-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
}

.level-hint {
  margin-top: 12px;
  font-size: 13px;
  color: #909399;
}

.treat-exact {
  padding-top: 12px;
  border-top: 1px solid #dcdfe6;
}

.exact-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
}

.exact-unit {
  margin-left: 8px;
  font-size: 14px;
  color: #606266;
}

.exact-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
}
</style>

<script setup lang="ts">
import type { FinanceRangePreset } from '@/types/finance'

defineProps<{
  modelValue: FinanceRangePreset
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: FinanceRangePreset): void
  (e: 'change', value: FinanceRangePreset): void
}>()

const handleChange = (value: string | number | boolean) => {
  const nextValue = value as FinanceRangePreset
  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}
</script>

<template>
  <div class="range-switcher">
    <el-radio-group :model-value="modelValue" @change="handleChange">
      <el-radio-button label="TODAY">今天</el-radio-button>
      <el-radio-button label="THIS_WEEK">本周</el-radio-button>
      <el-radio-button label="THIS_MONTH">本月</el-radio-button>
    </el-radio-group>
  </div>
</template>

<style scoped>
.range-switcher {
  display: flex;
  justify-content: flex-end;
}
</style>

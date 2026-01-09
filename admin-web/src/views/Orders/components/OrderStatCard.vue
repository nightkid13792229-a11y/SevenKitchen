<template>
  <el-card class="stat-card" :body-style="{ padding: '20px' }" shadow="hover" @click="handleClick">
    <div class="stat-content">
      <div class="stat-icon" :style="{ backgroundColor: bgColor }">
        <el-icon :size="24">
          <component :is="icon" />
        </el-icon>
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ value }}</div>
        <div class="stat-label">{{ label }}</div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  label: string
  value: number
  icon?: any
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'primary'
})

const emit = defineEmits<{
  click: [label: string]
}>()

const bgColor = computed(() => {
  const colorMap = {
    primary: '#409eff',
    success: '#67c23a',
    warning: '#e6a23c',
    danger: '#f56c6c',
    info: '#909399'
  }
  return colorMap[props.type]
})

const handleClick = () => {
  emit('click', props.label)
}
</script>

<style scoped>
.stat-card {
  cursor: pointer;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  line-height: 1.2;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}
</style>

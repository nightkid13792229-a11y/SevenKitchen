<template>
  <div class="order-timeline">
    <el-timeline>
      <el-timeline-item
        v-for="item in timelineItems"
        :key="item.id"
        :timestamp="formatTime(item.operatedAt)"
        placement="top"
        :type="getTimelineType(item.toStatus)"
        :icon="getTimelineIcon(item.toStatus)"
      >
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-status">{{ getStatusText(item.toStatus) }}</span>
            <span v-if="item.fromStatus" class="timeline-from">
              {{ getStatusText(item.fromStatus) }} →
            </span>
          </div>
          <div v-if="item.operatedBy" class="timeline-operator">
            操作人：{{ item.operatedBy }}
          </div>
          <div v-if="item.remark" class="timeline-remark">
            {{ item.remark }}
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { OrderHistory, OrderStatus } from '@/types/order'

interface Props {
  history: OrderHistory[]
}

const props = defineProps<Props>()

const timelineItems = computed(() => {
  return props.history.sort((a, b) => {
    return new Date(b.operatedAt).getTime() - new Date(a.operatedAt).getTime()
  })
})

const formatTime = (time: Date) => {
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

const getStatusText = (status: OrderStatus) => {
  const statusMap: Record<OrderStatus, string> = {
    INIT: '订单创建',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    PURCHASING: '生产中（内部）',
    IN_PRODUCTION: '生产中（内部）',
    READY_FOR_PACKAGING: '包装中（内部）',
    READY_FOR_SHIPMENT: '急冻中待发货',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
  }
  return statusMap[status] || status
}

const getTimelineType = (status: OrderStatus): 'primary' | 'success' | 'warning' | 'danger' | 'info' => {
  const typeMap: Record<OrderStatus, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    INIT: 'info',
    PENDING_PAYMENT: 'warning',
    PAID: 'success',
    PURCHASING: 'primary',
    IN_PRODUCTION: 'primary',
    READY_FOR_PACKAGING: 'primary',
    READY_FOR_SHIPMENT: 'primary',
    SHIPPED: 'info',
    COMPLETED: 'success',
    CANCELLED: 'danger'
  }
  return typeMap[status] || 'info'
}

const getTimelineIcon = (_status: OrderStatus) => {
  // 可以根据不同状态返回不同的图标
  return undefined
}
</script>

<style scoped>
.order-timeline {
  padding: 20px 0;
}

.timeline-content {
  padding: 10px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.timeline-status {
  font-weight: bold;
  color: #303133;
}

.timeline-from {
  color: #909399;
  font-size: 14px;
}

.timeline-operator {
  color: #606266;
  font-size: 14px;
  margin-bottom: 4px;
}

.timeline-remark {
  color: #909399;
  font-size: 13px;
  line-height: 1.5;
}

:deep(.el-timeline-item__timestamp) {
  color: #909399;
  font-size: 13px;
}
</style>

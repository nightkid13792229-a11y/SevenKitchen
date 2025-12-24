<template>
  <div class="orders-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>订单管理</span>
          <el-select v-model="statusFilter" placeholder="筛选状态" clearable @change="loadOrders">
            <el-option label="全部" value="" />
            <el-option label="待支付" value="PENDING_PAYMENT" />
            <el-option label="已支付" value="PAID" />
            <el-option label="生产中" value="IN_PRODUCTION" />
            <el-option label="已发货" value="SHIPPED" />
            <el-option label="已完成" value="COMPLETED" />
            <el-option label="已取消" value="CANCELLED" />
          </el-select>
        </div>
      </template>

      <el-table :data="orders" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="订单ID" width="120" />
        <el-table-column prop="customerId" label="客户ID" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amountTotal" label="总金额" />
        <el-table-column prop="createdAt" label="创建时间" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewDetail(row.id)">
              查看详情
            </el-button>
            <el-button
              v-if="row.status === 'PAID'"
              type="success"
              size="small"
              @click="completeOrder(row.id)"
            >
              完成
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { orderApi } from '@/api'

const router = useRouter()
const loading = ref(false)
const orders = ref<any[]>([])
const statusFilter = ref('')

const getStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    PAID: 'success',
    PENDING_PAYMENT: 'warning',
    IN_PRODUCTION: 'primary',
    SHIPPED: 'info',
    COMPLETED: 'success',
    CANCELLED: 'danger'
  }
  return typeMap[status] || ''
}

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    PAID: '已支付',
    PENDING_PAYMENT: '待支付',
    IN_PRODUCTION: '生产中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
  }
  return textMap[status] || status
}

const loadOrders = async () => {
  loading.value = true
  try {
    const data = await orderApi.list()
    const filteredData = statusFilter.value
      ? data.filter((o: any) => o.status === statusFilter.value)
      : data
    orders.value = filteredData
  } catch (error) {
    ElMessage.error('加载订单列表失败')
  } finally {
    loading.value = false
  }
}

const viewDetail = (id: string) => {
  router.push(`/orders/${id}`)
}

const completeOrder = async (id: string) => {
  try {
    await orderApi.complete(id)
    ElMessage.success('订单已完成')
    loadOrders()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

onMounted(() => {
  loadOrders()
})
</script>

<style scoped>
.orders-page {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>

<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #409eff">
              <el-icon :size="24"><List /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">总订单数</div>
              <div class="stat-value">{{ stats.totalOrders }}</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #67c23a">
              <el-icon :size="24"><Money /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">总收入</div>
              <div class="stat-value">¥{{ stats.totalRevenue }}</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #e6a23c">
              <el-icon :size="24"><Clock /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">待处理订单</div>
              <div class="stat-value">{{ stats.pendingOrders }}</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #f56c6c">
              <el-icon :size="24"><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">活跃用户</div>
              <div class="stat-value">{{ stats.activeUsers }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近订单</span>
            </div>
          </template>
          <el-table :data="recentOrders" style="width: 100%">
            <el-table-column prop="id" label="订单ID" width="120" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amountTotal" label="金额" />
            <el-table-column prop="createdAt" label="创建时间" />
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>生产批次</span>
            </div>
          </template>
          <el-table :data="recentBatches" style="width: 100%">
            <el-table-column prop="id" label="批次ID" width="120" />
            <el-table-column prop="productionDate" label="生产日期" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getBatchStatusType(row.status)">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="totalProductionG" label="产量(g)" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { List, Money, Clock, User } from '@element-plus/icons-vue'
import { orderApi, productionApi } from '@/api'

const stats = ref({
  totalOrders: 0,
  totalRevenue: '0',
  pendingOrders: 0,
  activeUsers: 0
})

const recentOrders = ref<any[]>([])
const recentBatches = ref<any[]>([])

const getStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    PAID: 'success',
    PENDING_PAYMENT: 'warning',
    IN_PRODUCTION: 'primary',
    SHIPPED: 'info',
    COMPLETED: 'success'
  }
  return typeMap[status] || ''
}

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    PAID: '已支付',
    PENDING_PAYMENT: '待支付',
    IN_PRODUCTION: '生产中',
    SHIPPED: '已发货',
    COMPLETED: '已完成'
  }
  return textMap[status] || status
}

const getBatchStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    PLANNED: 'info',
    IN_PRODUCTION: 'warning',
    COMPLETED: 'success'
  }
  return typeMap[status] || ''
}

const loadData = async () => {
  try {
    const [ordersData, batchesData] = await Promise.all([
      orderApi.list(),
      productionApi.getBatches()
    ])

    // orderApi.list() 返回 {list: [...], total: number}
    const ordersList = Array.isArray(ordersData) ? ordersData : ordersData.list || []

    recentOrders.value = ordersList.slice(0, 5)
    stats.value.totalOrders = ordersList.length
    stats.value.pendingOrders = ordersList.filter(
      (o: any) => o.status === 'PENDING_PAYMENT'
    ).length
    stats.value.totalRevenue = ordersList
      .reduce((sum: number, o: any) => sum + Number(o.amountTotal || 0), 0)
      .toFixed(2)

    recentBatches.value = batchesData.slice(0, 5)
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stat-card {
  cursor: pointer;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.stat-info {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: #999;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>

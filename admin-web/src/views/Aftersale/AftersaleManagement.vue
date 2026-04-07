<template>
  <div class="aftersale-management">
    <h2>售后工单管理</h2>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-item">
            <div class="stat-label">待处理</div>
            <div class="stat-value pending">{{ stats.pending }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-item">
            <div class="stat-label">退款申请</div>
            <div class="stat-value refund">{{ stats.refund }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-item">
            <div class="stat-label">重做申请</div>
            <div class="stat-value remake">{{ stats.remake }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-item">
            <div class="stat-label">投诉建议</div>
            <div class="stat-value complaint">{{ stats.complaint }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 工单列表 -->
    <el-card class="table-card">
      <el-table :data="aftersales" v-loading="loading" stripe>
        <el-table-column prop="id" label="订单ID" width="180" />
        <el-table-column prop="status" label="订单状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="aftersaleType" label="售后类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getAftersaleTypeTag(row.aftersaleType)">
              {{ getAftersaleTypeText(row.aftersaleType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="aftersaleReason" label="售后原因" min-width="200" show-overflow-tooltip />
        <el-table-column prop="aftersaleSince" label="申请时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.aftersaleSince) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleResolve(row)">
              处理工单
            </el-button>
            <el-button size="small" @click="viewDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 处理工单对话框 -->
    <el-dialog
      v-model="resolveDialogVisible"
      title="处理售后工单"
      width="600px"
    >
      <el-form :model="resolveForm" label-width="120px">
        <el-form-item label="订单ID:">
          <span>{{ currentOrder?.id }}</span>
        </el-form-item>
        <el-form-item label="售后类型:">
          <el-tag :type="getAftersaleTypeTag(currentOrder?.aftersaleType)">
            {{ getAftersaleTypeText(currentOrder?.aftersaleType) }}
          </el-tag>
        </el-form-item>
        <el-form-item label="售后原因:">
          <span>{{ currentOrder?.aftersaleReason }}</span>
        </el-form-item>
        <el-form-item label="处理方式:" required>
          <el-select v-model="resolveForm.resolutionType" placeholder="请选择处理方式">
            <el-option label="同意退款" value="refunded" />
            <el-option label="安排重做" value="remade" />
            <el-option label="已解决" value="resolved" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理备注:">
          <el-input
            v-model="resolveForm.adminNote"
            type="textarea"
            :rows="4"
            placeholder="请输入处理备注（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmResolve" :loading="submitting">
          确认处理
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

interface AftersaleOrder {
  id: string
  status: string
  aftersaleType: string
  aftersaleReason: string
  aftersaleSince: string
  aftersalePhotos?: string[]
}

const loading = ref(false)
const submitting = ref(false)
const aftersales = ref<AftersaleOrder[]>([])
const resolveDialogVisible = ref(false)
const currentOrder = ref<AftersaleOrder | null>(null)

const stats = reactive({
  pending: 0,
  refund: 0,
  remake: 0,
  complaint: 0,
})

const resolveForm = reactive({
  resolutionType: '',
  adminNote: '',
})

onMounted(() => {
  loadAftersales()
})

async function loadAftersales() {
  loading.value = true
  try {
    const response = await axios.get(`${API_BASE}/orders/aftersale/pending`, {
      headers: {
        'X-Customer-Id': 'admin', // 实际使用时应从auth获取
      },
    })

    if (response.data.code === 0) {
      aftersales.value = response.data.data
      updateStats()
    } else {
      ElMessage.error(response.data.message || '加载失败')
    }
  } catch (error: any) {
    console.error('Load aftersales error:', error)
    ElMessage.error('加载失败: ' + (error.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

function updateStats() {
  stats.pending = aftersales.value.length
  stats.refund = aftersales.value.filter(o => o.aftersaleType === 'REFUND').length
  stats.remake = aftersales.value.filter(o => o.aftersaleType === 'REMAKE').length
  stats.complaint = aftersales.value.filter(o => o.aftersaleType === 'COMPLAINT').length
}

function handleResolve(row: AftersaleOrder) {
  currentOrder.value = row
  resolveForm.resolutionType = ''
  resolveForm.adminNote = ''
  resolveDialogVisible.value = true
}

function viewDetail(row: AftersaleOrder) {
  ElMessageBox.alert(
    `
    <div>
      <p><strong>订单ID:</strong> ${row.id}</p>
      <p><strong>订单状态:</strong> ${getStatusText(row.status)}</p>
      <p><strong>售后类型:</strong> ${getAftersaleTypeText(row.aftersaleType)}</p>
      <p><strong>申请时间:</strong> ${formatTime(row.aftersaleSince)}</p>
      <p><strong>售后原因:</strong> ${row.aftersaleReason}</p>
      ${row.aftersalePhotos && row.aftersalePhotos.length > 0 ?
        `<p><strong>凭证图片:</strong> ${row.aftersalePhotos.length}张</p>` : ''}
    </div>
    `,
    '售后详情',
    {
      dangerouslyUseHTMLString: true,
      confirmButtonText: '关闭',
    }
  )
}

async function confirmResolve() {
  if (!resolveForm.resolutionType) {
    ElMessage.warning('请选择处理方式')
    return
  }

  submitting.value = true
  try {
    const response = await axios.post(
      `${API_BASE}/orders/${currentOrder.value!.id}/aftersale/resolve`,
      {
        resolutionType: resolveForm.resolutionType,
        adminNote: resolveForm.adminNote,
      },
      {
        headers: {
          'X-Customer-Id': 'admin',
        },
      }
    )

    if (response.data.code === 0) {
      ElMessage.success('处理成功')
      resolveDialogVisible.value = false
      loadAftersales()
    } else {
      ElMessage.error(response.data.message || '处理失败')
    }
  } catch (error: any) {
    console.error('Resolve aftersale error:', error)
    ElMessage.error('处理失败: ' + (error.message || '网络错误'))
  } finally {
    submitting.value = false
  }
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'FREEZING': '急冻中',
    'SHIPPED': '已发货',
    'COMPLETED': '已完成',
    'AFTERSALE': '售后中',
  }
  return statusMap[status] || status
}

function getAftersaleTypeText(type?: string): string {
  const typeMap: Record<string, string> = {
    'REFUND': '申请退款',
    'REMAKE': '申请重做',
    'COMPLAINT': '投诉建议',
    'RESOLVED': '已解决',
  }
  return typeMap[type || ''] || ''
}

function getStatusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    'FREEZING': 'warning',
    'SHIPPED': 'success',
    'COMPLETED': 'info',
    'AFTERSALE': 'danger',
  }
  return typeMap[status] || 'info'
}

function getAftersaleTypeTag(type?: string): 'success' | 'warning' | 'info' | 'danger' {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    'REFUND': 'danger',
    'REMAKE': 'warning',
    'COMPLAINT': 'info',
    'RESOLVED': 'success',
  }
  return typeMap[type || ''] || 'info'
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped lang="scss">
.aftersale-management {
  padding: 20px;

  h2 {
    margin-bottom: 20px;
    color: #333;
  }

  .stats-row {
    margin-bottom: 20px;
  }

  .stat-card {
    .stat-item {
      text-align: center;

      .stat-label {
        font-size: 14px;
        color: #666;
        margin-bottom: 10px;
      }

      .stat-value {
        font-size: 32px;
        font-weight: bold;

        &.pending {
          color: #409eff;
        }

        &.refund {
          color: #f56c6c;
        }

        &.remake {
          color: #e6a23c;
        }

        &.complaint {
          color: #909399;
        }
      }
    }
  }

  .table-card {
    margin-top: 20px;
  }
}
</style>

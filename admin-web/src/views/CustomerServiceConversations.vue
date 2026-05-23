<template>
  <div class="customer-service-page">
    <div class="page-header">
      <div>
        <h2>客服会话</h2>
        <p>记录客户从小程序发起客服咨询的来源、订单/商品线索和回调消息。</p>
      </div>
      <div class="header-actions">
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="primary" :loading="loading" @click="loadConversations">刷新</el-button>
      </div>
    </div>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" class="filter-control">
            <el-option label="待处理" value="OPEN" />
            <el-option label="处理中" value="IN_PROGRESS" />
            <el-option label="已关闭" value="CLOSED" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="filters.sourceType" clearable placeholder="全部来源" class="filter-control">
            <el-option label="订单咨询" value="ORDER" />
            <el-option label="商品咨询" value="PRODUCT" />
            <el-option label="售后咨询" value="AFTERSALE" />
            <el-option label="普通咨询" value="GENERAL" />
          </el-select>
        </el-form-item>
        <el-form-item label="订单号">
          <el-input v-model="filters.orderId" clearable placeholder="输入订单号" class="order-input" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="conversations" v-loading="loading" stripe>
        <el-table-column label="来源" width="120">
          <template #default="{ row }">
            <el-tag :type="getSourceTagType(row.sourceType)">
              {{ getSourceText(row.sourceType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="咨询内容" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="stack">
              <span class="primary-text">{{ row.sourceTitle || latestMessage(row)?.content || '客户咨询' }}</span>
              <span class="muted-text">{{ row.sourcePath || row.externalConversationId || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="关联业务" min-width="210">
          <template #default="{ row }">
            <div class="stack">
              <router-link v-if="row.orderId" class="link" :to="`/orders/${row.orderId}`">
                订单：{{ row.orderId }}
              </router-link>
              <span v-if="row.productId" class="primary-text">商品：{{ row.productId }}</span>
              <span v-if="!row.orderId && !row.productId" class="muted-text">未关联订单/商品</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="客户标识" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="stack">
              <span class="primary-text">{{ row.customerId || '未匹配系统客户' }}</span>
              <span class="muted-text">{{ row.externalUserId || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="处理人" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.assignedStaffId || '未接手' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近消息" width="170">
          <template #default="{ row }">{{ formatTime(row.lastMessageAt || row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.id)">查看</el-button>
            <el-button
              v-if="row.status === 'OPEN'"
              size="small"
              type="success"
              :loading="statusUpdatingId === row.id"
              @click="updateStatus(row, 'IN_PROGRESS')"
            >
              接手
            </el-button>
            <el-button
              v-else-if="row.status === 'IN_PROGRESS'"
              size="small"
              type="warning"
              :loading="statusUpdatingId === row.id"
              @click="updateStatus(row, 'CLOSED')"
            >
              关闭
            </el-button>
            <el-button v-if="row.orderId" size="small" type="primary" @click="goOrder(row.orderId)">
              订单
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadConversations"
          @current-change="loadConversations"
        />
      </div>
    </el-card>

    <el-drawer
      v-model="detailVisible"
      title="客服会话详情"
      size="720px"
      :destroy-on-close="true"
    >
      <template v-if="currentConversation">
        <div class="detail-section">
          <div class="section-title">业务来源</div>
          <div class="detail-actions">
            <el-button
              v-if="currentConversation.status === 'OPEN'"
              type="success"
              :loading="statusUpdatingId === currentConversation.id"
              @click="updateStatus(currentConversation, 'IN_PROGRESS')"
            >
              标记处理中
            </el-button>
            <el-button
              v-if="currentConversation.status !== 'CLOSED'"
              type="warning"
              :loading="statusUpdatingId === currentConversation.id"
              @click="updateStatus(currentConversation, 'CLOSED')"
            >
              关闭会话
            </el-button>
            <el-button
              v-if="currentConversation.status === 'CLOSED'"
              :loading="statusUpdatingId === currentConversation.id"
              @click="updateStatus(currentConversation, 'OPEN')"
            >
              重新打开
            </el-button>
          </div>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="来源">
              {{ getSourceText(currentConversation.sourceType) }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              {{ getStatusText(currentConversation.status) }}
            </el-descriptions-item>
            <el-descriptions-item label="订单号">
              <router-link
                v-if="currentConversation.orderId"
                class="link"
                :to="`/orders/${currentConversation.orderId}`"
              >
                {{ currentConversation.orderId }}
              </router-link>
              <span v-else>-</span>
            </el-descriptions-item>
            <el-descriptions-item label="商品ID">
              {{ currentConversation.productId || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="页面路径" :span="2">
              {{ currentConversation.sourcePath || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="客户标识" :span="2">
              {{ currentConversation.externalUserId || currentConversation.customerId || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="处理人" :span="2">
              {{ currentConversation.assignedStaffId || '未接手' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="detail-section">
          <div class="section-title">消息记录</div>
          <el-empty
            v-if="!currentConversation.messages?.length"
            description="暂无回调消息"
          />
          <div v-else class="message-list">
            <div
              v-for="message in currentConversation.messages"
              :key="message.id"
              class="message-item"
            >
              <div class="message-head">
                <span>{{ message.direction === 'INBOUND' ? '客户消息' : '客服消息' }}</span>
                <span>{{ formatTime(message.createdAt) }}</span>
              </div>
              <div class="message-content">
                {{ message.content || message.eventType || message.messageType || '事件回调' }}
              </div>
              <pre class="raw-payload">{{ formatRawPayload(message.rawPayload) }}</pre>
            </div>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  customerServiceApi,
  type CustomerServiceConversation,
  type CustomerServiceMessage
} from '@/api/customerService'

const router = useRouter()
const loading = ref(false)
const detailLoading = ref(false)
const statusUpdatingId = ref('')
const detailVisible = ref(false)
const conversations = ref<CustomerServiceConversation[]>([])
const currentConversation = ref<CustomerServiceConversation | null>(null)

const filters = reactive({
  status: '',
  sourceType: '',
  orderId: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

onMounted(loadConversations)

async function loadConversations() {
  loading.value = true
  try {
    const data = await customerServiceApi.listConversations({
      status: filters.status || undefined,
      sourceType: filters.sourceType || undefined,
      orderId: filters.orderId || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize
    })
    conversations.value = data.items
    pagination.total = data.total
  } catch (error: any) {
    ElMessage.error(error.message || '加载客服会话失败')
  } finally {
    loading.value = false
  }
}

function search() {
  pagination.page = 1
  loadConversations()
}

function resetFilters() {
  filters.status = ''
  filters.sourceType = ''
  filters.orderId = ''
  search()
}

async function openDetail(id: string) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    currentConversation.value = await customerServiceApi.getConversation(id)
  } catch (error: any) {
    ElMessage.error(error.message || '加载客服会话详情失败')
  } finally {
    detailLoading.value = false
  }
}

function goOrder(orderId: string) {
  router.push(`/orders/${orderId}`)
}

async function updateStatus(
  row: CustomerServiceConversation,
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
) {
  statusUpdatingId.value = row.id
  try {
    const updated = await customerServiceApi.updateConversationStatus(row.id, status)
    const index = conversations.value.findIndex((item) => item.id === row.id)
    if (index >= 0) {
      const previous = conversations.value[index]
      conversations.value[index] = {
        ...previous,
        ...updated,
        messages: previous?.messages
      }
    }
    if (currentConversation.value?.id === row.id) {
      currentConversation.value = updated
    }
    ElMessage.success('客服会话状态已更新')
  } catch (error: any) {
    ElMessage.error(error.message || '更新客服会话状态失败')
  } finally {
    statusUpdatingId.value = ''
  }
}

function latestMessage(row: CustomerServiceConversation): CustomerServiceMessage | null {
  return row.messages?.[0] || null
}

function getSourceText(sourceType: string): string {
  const sourceMap: Record<string, string> = {
    ORDER: '订单咨询',
    PRODUCT: '商品咨询',
    AFTERSALE: '售后咨询',
    GENERAL: '普通咨询'
  }
  return sourceMap[sourceType] || sourceType
}

function getSourceTagType(sourceType: string): 'success' | 'warning' | 'info' | 'danger' {
  if (sourceType === 'ORDER') return 'success'
  if (sourceType === 'AFTERSALE') return 'warning'
  if (sourceType === 'PRODUCT') return 'info'
  return 'info'
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    OPEN: '待处理',
    IN_PROGRESS: '处理中',
    CLOSED: '已关闭'
  }
  return statusMap[status] || status
}

function getStatusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'OPEN') return 'warning'
  if (status === 'IN_PROGRESS') return 'success'
  if (status === 'CLOSED') return 'info'
  return 'info'
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return '-'
  return new Date(timeStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRawPayload(payload?: Record<string, unknown> | null): string {
  if (!payload) return '{}'
  return JSON.stringify(payload, null, 2)
}
</script>

<style scoped lang="scss">
.customer-service-page {
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;

    h2 {
      margin: 0 0 6px;
      color: #1f2937;
      font-size: 22px;
    }

    p {
      margin: 0;
      color: #667085;
      font-size: 14px;
    }
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .filter-card,
  .table-card {
    border-radius: 8px;
  }

  .filter-card {
    margin-bottom: 16px;
  }

  .filter-form {
    margin-bottom: -18px;
  }

  .filter-control {
    width: 160px;
  }

  .order-input {
    width: 230px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
    line-height: 1.4;
  }

  .primary-text {
    color: #1f2937;
    font-weight: 500;
  }

  .muted-text {
    color: #667085;
    font-size: 12px;
  }

  .link {
    color: #1677ff;
    font-weight: 600;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  .pagination-wrap {
    display: flex;
    justify-content: flex-end;
    padding-top: 16px;
  }

  .detail-section {
    margin-bottom: 22px;
  }

  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .section-title {
    margin-bottom: 10px;
    color: #1f2937;
    font-size: 15px;
    font-weight: 700;
  }

  .message-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message-item {
    padding: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fafafa;
  }

  .message-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    color: #667085;
    font-size: 13px;
  }

  .message-content {
    color: #1f2937;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .raw-payload {
    max-height: 220px;
    margin: 10px 0 0;
    padding: 10px;
    overflow: auto;
    border-radius: 6px;
    background: #111827;
    color: #d1d5db;
    font-size: 12px;
    line-height: 1.5;
  }
}
</style>

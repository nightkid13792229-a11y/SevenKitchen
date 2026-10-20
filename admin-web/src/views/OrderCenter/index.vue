<template>
  <div class="order-center">
    <div class="page-header">
      <div>
        <h2>订单中心</h2>
        <p class="subtitle">
          三类订单统一视图，只读；点订单号去对应详情。售后单独筛选，不占状态。
        </p>
      </div>
    </div>

    <el-card shadow="never" class="filter-card">
      <div class="type-row">
        <el-radio-group v-model="query.type" @change="handleSearch">
          <el-radio-button :value="undefined">全部</el-radio-button>
          <el-radio-button value="FOOD">鲜食</el-radio-button>
          <el-radio-button value="CUSTOM_RECIPE">定制食谱</el-radio-button>
          <el-radio-button value="SUPPLEMENT">补剂</el-radio-button>
        </el-radio-group>
        <div class="counts">
          <span>鲜食 {{ counts.FOOD }}</span>
          <span>定制 {{ counts.CUSTOM_RECIPE }}</span>
          <span>补剂 {{ counts.SUPPLEMENT }}</span>
        </div>
      </div>

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 130px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item v-if="query.type === 'SUPPLEMENT' || !query.type" label="日期口径">
          <el-select v-model="query.dateField" style="width: 110px">
            <el-option label="下单时间" value="created" />
            <el-option label="分装日" value="packing" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="订单号 / 姓名 / 手机号"
            style="width: 210px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.aftersale">只看售后中</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column label="类型" width="92">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ typeLabel(row.type) }}</el-tag>
            <div v-if="row.subtypeLabel" class="muted">{{ row.subtypeLabel }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订单号" min-width="180">
          <template #default="{ row }">
            <el-link type="primary" @click="openOrder(row)">{{ row.orderNo }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="顾客" min-width="130">
          <template #default="{ row }">
            <div>{{ row.customerName || '—' }}</div>
            <div class="muted">{{ row.customerPhone || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.statusGroup)" size="small">{{ row.statusLabel }}</el-tag>
            <el-tag v-if="row.hasOpenAftersale" type="warning" size="small" class="aftersale-tag">
              {{ row.aftersaleLabel || '售后中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">
            <span v-if="row.amountTotal === null" class="muted">—</span>
            <span v-else>¥{{ formatMoney(row.amountTotal) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="165">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="生产/分装日" width="120">
          <template #default="{ row }">{{ row.scheduledDate || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openOrder(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="handleSearch"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { orderCenterApi } from '@/api/orderCenter'
import type {
  OrderCenterItem,
  OrderCenterQuery,
  OrderCenterType,
  UnifiedStatusGroup,
} from '@/api/orderCenter'

const router = useRouter()
const loading = ref(false)
const items = ref<OrderCenterItem[]>([])
const total = ref(0)
const counts = reactive({ FOOD: 0, CUSTOM_RECIPE: 0, SUPPLEMENT: 0 })
const dateRange = ref<[string, string] | null>(null)

const route = useRoute();
const initialType = String(route.query.type || '');
const query = reactive<OrderCenterQuery>({
  type: ['FOOD', 'CUSTOM_RECIPE', 'SUPPLEMENT'].includes(initialType)
    ? (initialType as OrderCenterType)
    : undefined,
  status: undefined,
  dateField: 'created',
  keyword: '',
  aftersale: String(route.query.aftersale || '') === '1',
  page: 1,
  pageSize: 20,
})

const statusOptions: Array<{ label: string; value: UnifiedStatusGroup }> = [
  { label: '待处理', value: 'PENDING' },
  { label: '待付款', value: 'PENDING_PAYMENT' },
  { label: '处理中', value: 'IN_PROGRESS' },
  { label: '待发货', value: 'TO_SHIP' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '已取消', value: 'CANCELLED' },
]

function typeLabel(type: OrderCenterType) {
  return type === 'FOOD' ? '鲜食' : type === 'CUSTOM_RECIPE' ? '定制' : '补剂'
}

function statusTagType(status: UnifiedStatusGroup) {
  if (status === 'CANCELLED') return 'info'
  if (status === 'COMPLETED') return 'success'
  if (status === 'TO_SHIP' || status === 'PENDING_PAYMENT') return 'warning'
  if (status === 'IN_PROGRESS') return 'primary'
  return ''
}

function formatMoney(value: number) {
  return Number(value || 0).toFixed(2)
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  try {
    const result = await orderCenterApi.list({
      ...query,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
      keyword: query.keyword?.trim() || undefined,
    })
    items.value = result.items
    total.value = result.total
    counts.FOOD = result.counts.FOOD
    counts.CUSTOM_RECIPE = result.counts.CUSTOM_RECIPE
    counts.SUPPLEMENT = result.counts.SUPPLEMENT
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  load()
}

function handleReset() {
  query.type = undefined
  query.status = undefined
  query.dateField = 'created'
  query.keyword = ''
  query.aftersale = false
  query.page = 1
  dateRange.value = null
  load()
}

function openOrder(row: OrderCenterItem) {
  if (row.type === 'FOOD') {
    router.push(`/orders/${row.id}`)
    return
  }
  if (row.type === 'CUSTOM_RECIPE') {
    router.push({ path: '/custom-recipes', query: { keyword: row.orderNo } })
    return
  }
  router.push({ path: '/supplement-shop/orders', query: { keyword: row.orderNo } })
}

onMounted(load)
</script>

<style scoped>
.order-center { padding: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.subtitle { margin: 6px 0 0; color: #909399; font-size: 13px; }
.filter-card { margin-bottom: 12px; }
.type-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.counts { display: flex; gap: 14px; color: #606266; font-size: 13px; }
.filter-form { margin-top: 12px; }
.muted { color: #909399; font-size: 12px; }
.aftersale-tag { margin-left: 4px; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>

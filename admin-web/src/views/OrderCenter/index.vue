<template>
  <div class="order-center">
    <div class="page-header">
      <div>
        <h2>订单中心</h2>
        <p class="subtitle">
          三类订单统一视图，只读；点订单号去对应详情。售后单独筛选，不占状态。
        </p>
      </div>
      <div class="header-actions">
        <el-tooltip
          v-if="isAdmin"
          content="为已有账号顾客或无账号代客客户代下定制食谱订单（线下收款）"
          placement="bottom"
        >
          <el-button type="primary" @click="openAssistedOrder">代客下单</el-button>
        </el-tooltip>
        <el-tooltip v-else :content="`${ADMIN_ONLY_TIP}：代客下单`" placement="bottom">
          <span><el-button type="primary" disabled>代客下单</el-button></span>
        </el-tooltip>
      </div>
    </div>

    <el-card shadow="never" class="filter-card">
      <div class="type-row">
        <div class="type-left">
        <el-radio-group v-model="query.type" @change="handleTypeChange">
          <el-radio-button :value="undefined">全部</el-radio-button>
          <el-radio-button value="FOOD">鲜食</el-radio-button>
          <el-radio-button value="CUSTOM_RECIPE">食谱定制</el-radio-button>
          <el-radio-button value="SUPPLEMENT">补剂</el-radio-button>
        </el-radio-group>
        <!--
          赠送单筛选（2026-10-30）：赠送是定制单的结算方式，
          鲜食/补剂没有这个概念，所以只在「食谱定制」下出现。
        -->
        <el-checkbox
          v-if="query.type === 'CUSTOM_RECIPE'"
          v-model="query.gift"
          class="gift-filter"
          @change="handleSearch"
        >
          只看赠送单
        </el-checkbox>
        </div>
        <div class="counts">
          <span>鲜食 {{ counts.FOOD }}</span>
          <span>食谱定制 {{ counts.CUSTOM_RECIPE }}</span>
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
          <!-- 2026-10-30：补剂售后改成「提过就算」，已解决/已驳回的也会出现，
               所以文案不能再写「只看售后中」 -->
          <el-checkbox v-model="query.aftersale">只看有售后</el-checkbox>
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
            <el-tag size="small" effect="plain" :type="typeTagType(row.type)">
              {{ typeLabel(row.type) }}
            </el-tag>
            <!-- 定制 / 补剂的 subtype 与类型名重复，只保留鲜食的「试吃装 / 定制服务」 -->
            <div v-if="showSubtype(row)" class="muted">{{ row.subtypeLabel }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订单号" min-width="180">
          <template #default="{ row }">
            <el-link type="primary" @click="openOrder(row)">{{ row.orderNo }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="顾客" min-width="130">
          <template #default="{ row }">
            <div>
              {{ row.customerName || '—' }}
              <el-tag
                v-if="isInternalCustomerRole(row.customerRole)"
                size="small"
                type="danger"
                effect="plain"
                class="internal-tag"
              >
                {{ INTERNAL_CUSTOMER_BADGE }}
              </el-tag>
            </div>
            <div class="muted">{{ row.customerPhone || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagTypeForRow(row)" size="small">
              {{ displayStatusLabel(row) }}
            </el-tag>
            <el-tag v-if="row.hasOpenAftersale" type="warning" size="small" class="aftersale-tag">
              {{ row.aftersaleLabel || '售后中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">
            <span v-if="row.amountTotal === null" class="muted">—</span>
            <span v-else>¥{{ formatMoney(row.amountTotal) }}</span>
            <!-- 赠送单金额是 0 元：不标出来会被当成价格异常 -->
            <el-tag
              v-if="row.isGift"
              type="success"
              size="small"
              effect="plain"
              class="gift-tag"
            >
              赠送
            </el-tag>
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

    <!-- 定制订单详情：从订单中心直接打开，不再跳独立的定制单列表页 -->
    <el-drawer
      v-model="customDrawerVisible"
      title="定制订单详情"
      size="60%"
      direction="rtl"
      destroy-on-close
    >
      <OrderDetail
        v-if="customDrawerVisible && customDrawerOrderId"
        :order-id="customDrawerOrderId"
        @refresh="load"
        @close="customDrawerVisible = false"
      />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { orderCenterApi } from '@/api/orderCenter'
import type {
  OrderCenterItem,
  OrderCenterQuery,
  OrderCenterType,
  UnifiedStatusGroup,
} from '@/api/orderCenter'
import OrderDetail from '@/views/CustomRecipes/OrderDetail.vue'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import {
  INTERNAL_CUSTOMER_BADGE,
  isInternalCustomerRole,
} from '@/utils/customerRole'

const router = useRouter()
/** 代客下单会创建订单并登记线下收款，后端仅管理员可用 */
const isAdmin = useIsAdmin()
const loading = ref(false)
const items = ref<OrderCenterItem[]>([])
const total = ref(0)
const counts = reactive({ FOOD: 0, CUSTOM_RECIPE: 0, SUPPLEMENT: 0 })
const dateRange = ref<[string, string] | null>(null)

/** 定制订单详情抽屉（2026-10-21 合并入口） */
const customDrawerVisible = ref(false)
const customDrawerOrderId = ref('')

const route = useRoute();
const initialType = String(route.query.type || '');
/** 深链 /order-center?type=CUSTOM_RECIPE&orderId=CR...：列表加载完后自动开抽屉 */
const initialOrderId = String(route.query.orderId || '').trim();
const query = reactive<OrderCenterQuery>({
  type: ['FOOD', 'CUSTOM_RECIPE', 'SUPPLEMENT'].includes(initialType)
    ? (initialType as OrderCenterType)
    : undefined,
  status: undefined,
  dateField: 'created',
  keyword: '',
  aftersale: String(route.query.aftersale || '') === '1',
  gift: false,
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

/**
 * 定制单在订单中心显示**自己的原始状态**，不并到「处理中」。
 *
 * 订单中心的统一状态组只是拿来筛选（PAID / IN_PROGRESS 都算处理中），
 * 但运营看这张表时要能直接分辨「已付款」「制作中」「已交付」。
 */
const CUSTOM_RAW_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: '待付款',
  PAID: '已付款',
  IN_PROGRESS: '制作中',
  DELIVERED: '已交付',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

function typeLabel(type: OrderCenterType) {
  if (type === 'FOOD') return '鲜食'
  if (type === 'CUSTOM_RECIPE') return '食谱定制'
  return '补剂'
}

/**
 * 三类订单用不同颜色的类型标签，扫一眼就能区分。
 * 空字符串是 Element Plus 的默认蓝色，这里给鲜食 / 定制 / 补剂分别用绿 / 橙 / 蓝。
 */
function typeTagType(type: OrderCenterType) {
  if (type === 'FOOD') return 'success'
  if (type === 'CUSTOM_RECIPE') return 'warning'
  return 'primary'
}

/** 定制 / 补剂后端的 subtypeLabel 与类型名重复，只展示鲜食的有意义子类型 */
function showSubtype(row: OrderCenterItem) {
  return row.type === 'FOOD' && Boolean(row.subtypeLabel)
}

function displayStatusLabel(row: OrderCenterItem) {
  if (row.type === 'CUSTOM_RECIPE') {
    return CUSTOM_RAW_STATUS_LABELS[String(row.rawStatus || '').toUpperCase()] || row.statusLabel
  }
  return row.statusLabel
}

function statusTagType(status: UnifiedStatusGroup) {
  if (status === 'CANCELLED') return 'info'
  if (status === 'COMPLETED') return 'success'
  if (status === 'TO_SHIP' || status === 'PENDING_PAYMENT') return 'warning'
  if (status === 'IN_PROGRESS') return 'primary'
  return ''
}

/** 定制单按原始状态上色；其余订单仍用统一状态组 */
function statusTagTypeForRow(row: OrderCenterItem) {
  if (row.type === 'CUSTOM_RECIPE') {
    switch (String(row.rawStatus || '').toUpperCase()) {
      case 'PAID':
        return 'warning'
      case 'DELIVERED':
        return 'success'
      case 'COMPLETED':
      case 'CANCELLED':
        return 'info'
      case 'PENDING_PAYMENT':
        return 'warning'
      case 'IN_PROGRESS':
        return 'primary'
      default:
        return statusTagType(row.statusGroup)
    }
  }
  return statusTagType(row.statusGroup)
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

/** 切换类型：离开食谱定制时，赠送筛选必须一起清掉 */
function handleTypeChange() {
  if (query.type !== 'CUSTOM_RECIPE') {
    query.gift = false
  }
  handleSearch()
}

async function load() {
  loading.value = true
  try {
    const result = await orderCenterApi.list({
      ...query,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
      keyword: query.keyword?.trim() || undefined,
      // 只有食谱定制会带这个参数，其余类型传了也不该生效
      gift: query.type === 'CUSTOM_RECIPE' ? query.gift || undefined : undefined,
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

function openCustomOrder(orderId: string) {
  const id = String(orderId || '').trim()
  if (!id) return
  customDrawerOrderId.value = id
  customDrawerVisible.value = true
}

function openOrder(row: OrderCenterItem) {
  if (row.type === 'FOOD') {
    router.push(`/orders/${row.id}`)
    return
  }
  if (row.type === 'CUSTOM_RECIPE') {
    // 定制订单统一在订单中心里看，不再跳独立列表页
    openCustomOrder(row.orderNo)
    return
  }
  router.push({ path: '/supplement-shop/orders', query: { keyword: row.orderNo } })
}

/** 去代客下单页（仅管理员；按钮对其他人置灰并说明原因） */
function openAssistedOrder() {
  if (!isAdmin.value) return
  router.push('/custom-recipes/assisted-order')
}

onMounted(async () => {
  // 深链要在列表加载完成后打开，避免抽屉先闪一下再被列表刷新打断
  try {
    await load()
  } finally {
    if (initialOrderId && (!query.type || query.type === 'CUSTOM_RECIPE')) {
      openCustomOrder(initialOrderId)
    }
  }
})

// 已经在订单中心时再跳到深链，组件会被复用、onMounted 不会再跑，这里兜住
watch(
  () => route.query.orderId,
  (value) => {
    const id = String(value || '').trim()
    if (!id) return
    if (query.type && query.type !== 'CUSTOM_RECIPE') return
    openCustomOrder(id)
  },
)
</script>

<style scoped>
.order-center { padding: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.subtitle { margin: 6px 0 0; color: #909399; font-size: 13px; }
.filter-card { margin-bottom: 12px; }
.type-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.type-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.counts { display: flex; gap: 14px; color: #606266; font-size: 13px; }
.filter-form { margin-top: 12px; }
.muted { color: #909399; font-size: 12px; }
.internal-tag { margin-left: 4px; }
.aftersale-tag { margin-left: 4px; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>

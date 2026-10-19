<template>
  <div class="aftersales-page">
    <div class="page-header">
      <div>
        <h2>补剂售后</h2>
        <p class="subtitle">退款/补发/仅登记/驳回。未发货订单只支持全额退款；退款成功会自动取消订单。</p>
      </div>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 140px">
            <el-option label="待受理" value="PENDING" />
            <el-option label="处理中" value="PROCESSING" />
            <el-option label="已解决" value="RESOLVED" />
            <el-option label="已驳回" value="REJECTED" />
            <el-option label="已撤回" value="CANCELLED" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="售后单号 / 订单号"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column label="售后单号" min-width="190">
          <template #default="{ row }">
            <div class="mono">{{ row.caseNo }}</div>
            <div class="muted">{{ row.orderNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请" width="100">
          <template #default="{ row }">{{ requestLabel(row.requestType) }}</template>
        </el-table-column>
        <el-table-column label="原因" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.requestedReason }}</template>
        </el-table-column>
        <el-table-column label="退款" width="130" align="right">
          <template #default="{ row }">
            <span v-if="row.refundAmount !== null">¥{{ formatMoney(row.refundAmount) }}</span>
            <span v-else class="muted">—</span>
            <div v-if="row.refundStatus" class="muted">{{ row.refundStatus }}</div>
          </template>
        </el-table-column>
        <el-table-column label="补发单" min-width="150">
          <template #default="{ row }">
            <span v-if="row.reshipOrderNo" class="mono">{{ row.reshipOrderNo }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="165">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="['PENDING', 'PROCESSING'].includes(row.status)"
              link
              type="primary"
              @click="openResolve(row)"
            >处理</el-button>
            <span v-else class="muted">已结束</span>
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

    <el-dialog v-model="dialogVisible" title="处理售后" width="520px">
      <div v-if="selected" class="case-brief">
        <div><strong>{{ selected.caseNo }}</strong> · {{ selected.orderNo }}</div>
        <div class="muted">{{ requestLabel(selected.requestType) }}：{{ selected.requestedReason }}</div>
        <div v-if="selected.refundAmount !== null" class="muted">申请退款 ¥{{ formatMoney(selected.refundAmount) }}</div>
      </div>

      <el-form label-width="90px" class="resolve-form">
        <el-form-item label="处理方式">
          <el-radio-group v-model="form.resolutionType">
            <el-radio value="REFUND">退款</el-radio>
            <el-radio value="RESHIP">补发</el-radio>
            <el-radio value="REGISTER_ONLY">仅登记</el-radio>
            <el-radio value="REJECT">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.resolutionType === 'REFUND'" label="退款金额">
          <el-input-number v-model="form.refundAmount" :min="0.01" :precision="2" :step="1" />
          <div class="hint">未发货订单必须是全额；已发货可部分退，累计不超实付。</div>
        </el-form-item>
        <el-form-item v-if="form.resolutionType === 'REJECT'" label="驳回原因">
          <el-input v-model="form.rejectReason" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item label="处理说明">
          <el-input v-model="form.note" type="textarea" :rows="3" maxlength="1000" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitResolve">确认处理</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { orderCenterApi } from '@/api/orderCenter'
import type { SupplementAftersaleCase } from '@/api/orderCenter'

const loading = ref(false)
const submitting = ref(false)
const items = ref<SupplementAftersaleCase[]>([])
const total = ref(0)
const dialogVisible = ref(false)
const selected = ref<SupplementAftersaleCase | null>(null)

const query = reactive({
  status: '',
  keyword: '',
  page: 1,
  pageSize: 20,
})

const form = reactive<{
  resolutionType: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT'
  refundAmount: number
  note: string
  rejectReason: string
}>({
  resolutionType: 'REFUND',
  refundAmount: 0,
  note: '',
  rejectReason: '',
})

function statusLabel(status: string) {
  return (
    {
      PENDING: '待受理',
      PROCESSING: '处理中',
      RESOLVED: '已解决',
      REJECTED: '已驳回',
      CANCELLED: '已撤回',
    } as Record<string, string>
  )[status] || status
}

function statusTag(status: string) {
  if (status === 'RESOLVED') return 'success'
  if (status === 'REJECTED' || status === 'CANCELLED') return 'info'
  if (status === 'PROCESSING') return 'warning'
  return 'primary'
}

function requestLabel(type: string) {
  return ({ REFUND: '退款', RESHIP: '补发', OTHER: '其他' } as Record<string, string>)[type] || type
}

function formatMoney(value: number | null) {
  return Number(value || 0).toFixed(2)
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  try {
    const result = await orderCenterApi.listSupplementAftersales({
      status: query.status || undefined,
      keyword: query.keyword.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
    })
    items.value = result.items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  load()
}

function handleReset() {
  query.status = ''
  query.keyword = ''
  query.page = 1
  load()
}

function openResolve(row: SupplementAftersaleCase) {
  selected.value = row
  form.resolutionType = row.requestType === 'RESHIP' ? 'RESHIP' : 'REFUND'
  form.refundAmount = Number(row.refundAmount || 0)
  form.note = ''
  form.rejectReason = ''
  dialogVisible.value = true
}

async function submitResolve() {
  if (!selected.value) return
  if (form.resolutionType === 'REFUND' && (!form.refundAmount || form.refundAmount <= 0)) {
    ElMessage.warning('请填写退款金额')
    return
  }
  if (form.resolutionType === 'REJECT' && !form.rejectReason.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }

  const actionLabel = {
    REFUND: '退款',
    RESHIP: '补发',
    REGISTER_ONLY: '仅登记',
    REJECT: '驳回',
  }[form.resolutionType]

  await ElMessageBox.confirm(`确认执行「${actionLabel}」？`, '确认', { type: 'warning' })
  submitting.value = true
  try {
    await orderCenterApi.resolveSupplementAftersale(selected.value.id, {
      resolutionType: form.resolutionType,
      refundAmount: form.resolutionType === 'REFUND' ? form.refundAmount : undefined,
      note: form.note.trim() || undefined,
      rejectReason: form.rejectReason.trim() || undefined,
    })
    ElMessage.success('已处理')
    dialogVisible.value = false
    await load()
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.aftersales-page { padding: 16px; }
.page-header { margin-bottom: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.subtitle { margin: 6px 0 0; color: #909399; font-size: 13px; }
.filter-card { margin-bottom: 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.muted { color: #909399; font-size: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
.case-brief { padding: 10px 12px; margin-bottom: 14px; background: #f5f7fa; border-radius: 6px; line-height: 1.8; }
.hint { color: #909399; font-size: 12px; line-height: 1.5; }
</style>

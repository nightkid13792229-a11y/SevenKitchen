<template>
  <div class="finance-page">
    <div class="page-header">
      <div>
        <h2>费用与待支付</h2>
        <p>统一管理公司直接应付的房租、水电、服务器和工资等费用单。</p>
      </div>
      <div class="header-actions">
        <RangeSwitcher v-model="preset" @change="loadBills" />
        <el-button type="primary" @click="dialogVisible = true">新建费用单</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column prop="billNumber" label="费用单号" min-width="160" />
        <el-table-column prop="title" label="费用名称" min-width="220" />
        <el-table-column prop="payeeName" label="收款方" min-width="140" />
        <el-table-column prop="status" label="状态" width="140">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            ¥{{ Number(row.amount ?? 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="应付日期" min-width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.dueAt) }}
          </template>
        </el-table-column>
        <el-table-column label="归属期间" min-width="220">
          <template #default="{ row }">
            {{ formatDate(row.recognitionStart) }} 至 {{ formatDate(row.recognitionEnd) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status !== 'PAID'"
              type="primary"
              link
              @click="openPaymentDialog(row)"
            >
              记录付款
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <ExpenseBillDialog v-model="dialogVisible" @saved="loadBills" />

    <el-dialog v-model="paymentDialogVisible" title="记录付款" width="520px">
      <el-form :model="paymentForm" label-width="100px">
        <el-form-item label="付款金额">
          <el-input-number
            v-model="paymentForm.paidAmount"
            :min="0"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="付款时间">
          <el-date-picker
            v-model="paymentForm.paidAt"
            type="datetime"
            format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="付款方式">
          <el-select v-model="paymentForm.paymentMethod" style="width: 100%">
            <el-option label="银行转账" value="BANK_TRANSFER" />
            <el-option label="微信转账" value="WECHAT_TRANSFER" />
            <el-option label="支付宝转账" value="ALIPAY_TRANSFER" />
            <el-option label="现金" value="CASH" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="paymentForm.note" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="paymentDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingPayment" @click="submitPayment">
          保存付款记录
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { financeApi } from '@/api/finance'
import ExpenseBillDialog from './components/ExpenseBillDialog.vue'
import RangeSwitcher from './components/RangeSwitcher.vue'
import type { ExpenseBillItem, FinanceRangePreset } from '@/types/finance'

const preset = ref<FinanceRangePreset>('THIS_MONTH')
const rows = ref<ExpenseBillItem[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const paymentDialogVisible = ref(false)
const submittingPayment = ref(false)
const selectedBillId = ref<string | null>(null)
const paymentForm = reactive({
  paidAmount: 0,
  paidAt: null as Date | null,
  paymentMethod: 'BANK_TRANSFER',
  note: ''
})

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PENDING_PAYMENT: '待支付',
    PARTIALLY_PAID: '部分支付',
    PAID: '已支付',
    CANCELLED: '已取消'
  }
  return map[status] || status
}

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'info',
    PENDING_PAYMENT: 'warning',
    PARTIALLY_PAID: 'warning',
    PAID: 'success',
    CANCELLED: 'danger'
  }
  return map[status] || 'info'
}

const formatDateTime = (value?: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const formatDate = (value?: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('zh-CN')
}

const loadBills = async () => {
  loading.value = true
  try {
    rows.value = await financeApi.getExpenseBills(preset.value)
  } finally {
    loading.value = false
  }
}

const openPaymentDialog = (row: ExpenseBillItem) => {
  selectedBillId.value = row.id
  paymentForm.paidAmount = Number(row.amount ?? 0)
  paymentForm.paidAt = new Date()
  paymentForm.paymentMethod = 'BANK_TRANSFER'
  paymentForm.note = ''
  paymentDialogVisible.value = true
}

const submitPayment = async () => {
  if (!selectedBillId.value || !paymentForm.paidAt) {
    ElMessage.warning('请先填写付款时间')
    return
  }

  submittingPayment.value = true
  try {
    await financeApi.recordExpensePayment(selectedBillId.value, {
      paidAmount: paymentForm.paidAmount,
      paidAt: paymentForm.paidAt.toISOString(),
      paymentMethod: paymentForm.paymentMethod,
      paymentProofUrls: [],
      note: paymentForm.note
    })
    ElMessage.success('付款记录已保存')
    paymentDialogVisible.value = false
    await loadBills()
  } finally {
    submittingPayment.value = false
  }
}

onMounted(() => {
  loadBills()
})
</script>

<style scoped lang="scss">
.finance-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  h2 {
    margin: 0 0 6px;
  }

  p {
    margin: 0;
    color: #909399;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>

<template>
  <view class="page">
    <!-- 月份切换：默认本月，可回看最近三个月（起账月之前没有账，不列） -->
    <view class="month-row">
      <text class="month-title">{{ monthTitle }}</text>
      <text class="month-hint">{{ isCurrentMonth ? '本月' : '历史月份' }}</text>
    </view>

    <view class="month-chips">
      <view
        v-for="chip in monthChips"
        :key="chip.key"
        class="chip"
        :class="{ 'chip--on': activeMonth === chip.key }"
        @tap="selectMonth(chip.key)"
      >
        {{ chip.label }}
      </view>
    </view>

    <!-- 本月待付 -->
    <view class="card">
      <view class="card-head">
        <view class="card-head-main">
          <text class="card-title">{{ billSectionTitle }}</text>
          <text v-if="bills.length > 0" class="card-sub">
            {{ bills.length }} 笔 · 待付 ¥{{ formatMoney(pendingTotal) }}
          </text>
        </view>
        <text class="card-action" @tap="generateBills">{{ generateLabel }}</text>
      </view>

      <view v-if="billsLoading && bills.length === 0" class="skeleton">
        <view v-for="n in 3" :key="n" class="sk-row"></view>
      </view>

      <view v-else-if="billsError && bills.length === 0" class="state">
        <text class="state-title">账单加载失败</text>
        <text class="state-hint">{{ billsError }}</text>
        <button class="state-retry" @tap="loadBills">重试</button>
      </view>

      <StaffEmptyState
        v-else-if="bills.length === 0"
        icon="🗓️"
        :title="billsEmptyTitle"
        :hint="billsEmptyHint"
        :action-text="templates.length === 0 ? '新建固定费用' : generateLabel"
        @action="onBillsEmptyAction"
      />

      <view v-else class="list">
        <view v-for="bill in bills" :key="bill.id" class="bill-row">
          <view class="bill-main">
            <text class="bill-title">{{ bill.title }}</text>
            <text class="bill-meta">
              {{ categoryLabel(bill.category) }} · ¥{{ formatMoney(bill.amount) }} ·
              {{ dayLabel(bill.dueAt) }} · {{ payerLabel(bill.payerType) }}
            </text>
            <text v-if="partialText(bill)" class="bill-partial">
              {{ partialText(bill) }}
            </text>
          </view>
          <view class="bill-side">
            <StaffStatusBadge
              :label="statusLabel(bill.status)"
              :tone="statusTone(bill.status)"
              size="sm"
            />
            <button
              v-if="bill.status !== 'PAID'"
              class="row-btn"
              @tap="openPay(bill)"
            >
              标记已付
            </button>
            <text v-else class="row-done">已付清</text>
          </view>
        </view>
      </view>

      <text v-if="billsError && bills.length > 0" class="stale-hint">
        刷新失败，当前显示的是上次的数据
      </text>
    </view>

    <!-- 我设的固定项目 -->
    <view class="card">
      <view class="card-head">
        <view class="card-head-main">
          <text class="card-title">我设的固定项目</text>
          <text v-if="templates.length > 0" class="card-sub">
            共 {{ templates.length }} 个
          </text>
        </view>
      </view>

      <view v-if="templatesLoading && templates.length === 0" class="skeleton">
        <view v-for="n in 2" :key="n" class="sk-row"></view>
      </view>

      <view v-else-if="templatesError && templates.length === 0" class="state">
        <text class="state-title">固定项目加载失败</text>
        <text class="state-hint">{{ templatesError }}</text>
        <button class="state-retry" @tap="loadTemplates">重试</button>
      </view>

      <StaffEmptyState
        v-else-if="templates.length === 0"
        icon="📌"
        title="还没有固定费用"
        hint="房租、工资、社保这类每月都要付的，建一次就会按月出账单"
        action-text="新建固定费用"
        @action="openCreate"
      />

      <template v-else>
        <view
          v-for="template in sortedTemplates"
          :key="template.id"
          class="template-row"
          @tap="openEdit(template)"
        >
          <view class="template-main">
            <view class="template-head">
              <text class="template-name">{{ template.name }}</text>
              <text
                class="template-state"
                :class="{ 'template-state--off': !template.isActive }"
              >
                {{ template.isActive ? '启用' : '已停用' }}
              </text>
            </view>
            <text class="template-meta">
              {{ categoryLabel(template.category) }} · {{ intervalLabel(template.interval) }} ·
              {{ dayLabel(template.dayOfMonth) }} · {{ payerLabel(template.payerType) }}
            </text>
          </view>
          <view class="template-side">
            <text class="template-amount">¥{{ formatMoney(template.defaultAmount) }}</text>
            <text class="template-chevron">›</text>
          </view>
        </view>
        <text class="list-hint">
          点一项可以改名称、类别、金额、周期、几号和付款方；停用只影响以后，不改历史账单
        </text>
      </template>

      <text v-if="templatesError && templates.length > 0" class="stale-hint">
        刷新失败，当前显示的是上次的数据
      </text>
    </view>
  </view>

  <StaffBottomBar>
    <button class="primary-btn" @tap="openCreate">＋ 新建固定费用</button>
  </StaffBottomBar>

  <!-- 标记已付：默认剩余应付，可改本次实付与付款方 -->
  <view v-if="payTarget" class="mask" @tap="closePay">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <text class="sheet-title">标记已付</text>
        <text class="sheet-close" @tap="closePay">关闭</text>
      </view>
      <text class="sheet-name">{{ payTarget.title }}</text>
      <text class="sheet-meta">
        剩余应付 ¥{{ formatMoney(payRemaining) }} · {{ dayLabel(payTarget.dueAt) }}
      </text>

      <view class="sheet-body">
        <view class="field">
          <text class="field-label">本次实付金额</text>
          <view class="amount-row">
            <text class="amount-currency">¥</text>
            <input
              class="amount-input"
              type="digit"
              :value="payAmountText"
              placeholder="0.00"
              placeholder-class="amount-placeholder"
              @input="onPayAmountInput"
            />
          </view>
          <text class="field-hint">
            默认是剩余应付；水电这类实付和模板不一样时直接改
          </text>
        </view>

        <view class="field">
          <text class="field-label">付款方</text>
          <view class="chips">
            <view
              v-for="option in PAYER_OPTIONS"
              :key="option.value"
              class="chip"
              :class="{ 'chip--on': payPayerType === option.value }"
              @tap="selectPayPayer(option.value)"
            >
              {{ option.label }}
            </view>
          </view>
        </view>
      </view>

      <button class="primary-btn" :disabled="paying" @tap="confirmPay">
        {{ paying ? '保存中…' : '确认已付' }}
      </button>
    </view>
  </view>

  <!-- 新建 / 编辑固定费用 -->
  <view v-if="formOpen" class="mask" @tap="closeForm">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <text class="sheet-title">{{ formTitle }}</text>
        <text class="sheet-close" @tap="closeForm">关闭</text>
      </view>

      <view class="sheet-body">
        <view class="field">
          <text class="field-label">名称</text>
          <input
            class="text-input"
            :value="formName"
            maxlength="100"
            placeholder="例：房租、宽带、工资"
            placeholder-class="text-placeholder"
            @input="onNameInput"
          />
        </view>

        <view class="field">
          <text class="field-label">类别</text>
          <view class="chips">
            <view
              v-for="option in CATEGORY_OPTIONS"
              :key="option.value"
              class="chip"
              :class="{ 'chip--on': formCategory === option.value }"
              @tap="selectCategory(option.value)"
            >
              {{ option.label }}
            </view>
          </view>
        </view>

        <view class="field">
          <text class="field-label">金额</text>
          <view class="amount-row amount-row--card">
            <text class="amount-currency">¥</text>
            <input
              class="amount-input"
              type="digit"
              :value="formAmountText"
              placeholder="0.00"
              placeholder-class="amount-placeholder"
              @input="onFormAmountInput"
            />
          </view>
        </view>

        <view class="field">
          <text class="field-label">周期</text>
          <view class="chips">
            <view
              v-for="option in INTERVAL_OPTIONS"
              :key="option.value"
              class="chip"
              :class="{ 'chip--on': formInterval === option.value }"
              @tap="selectInterval(option.value)"
            >
              {{ option.label }}
            </view>
          </view>
          <text v-if="formInterval === 'YEARLY'" class="field-hint">
            {{ yearlyHint }}
          </text>
        </view>

        <view class="field">
          <text class="field-label">几号</text>
          <picker
            mode="selector"
            :range="DAY_LABELS"
            :value="formDayIndex"
            @change="onPickDay"
          >
            <view class="picker-value">
              <text class="picker-text">{{ formDayIndex + 1 }} 号</text>
              <text class="picker-chevron">›</text>
            </view>
          </picker>
          <text class="field-hint">到期日按这个日子生成；月份没有这一天时按月末算</text>
        </view>

        <view class="field">
          <text class="field-label">服务期月数</text>
          <input
            class="text-input"
            type="number"
            :value="formServiceMonthsText"
            maxlength="3"
            @input="onServiceMonthsInput"
          />
          <text class="field-hint">
            默认 1；年付宽带这类一次付一年的填 12，账单按月分摊
          </text>
        </view>

        <view class="field">
          <text class="field-label">付款方</text>
          <view class="chips">
            <view
              v-for="option in PAYER_OPTIONS"
              :key="option.value"
              class="chip"
              :class="{ 'chip--on': formPayerType === option.value }"
              @tap="selectFormPayer(option.value)"
            >
              {{ option.label }}
            </view>
          </view>
        </view>

        <view v-if="editingTemplate" class="field">
          <text class="field-label">停用</text>
          <text class="field-hint">
            停用只影响以后：不再生成新账单，已经生成的账单和历史记录都不变。
          </text>
          <button
            v-if="editingTemplate.isActive"
            class="deactivate-btn"
            @tap="deactivateEditing"
          >
            停用
          </button>
          <text v-else class="field-hint">这个固定项目已停用。</text>
        </view>
      </view>

      <button class="primary-btn" :disabled="formSubmitting" @tap="saveTemplate">
        {{ formSubmitting ? '保存中…' : '保存' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import StaffBottomBar from '../../components/staff/StaffBottomBar.vue'
import StaffEmptyState from '../../components/staff/StaffEmptyState.vue'
import StaffStatusBadge from '../../components/staff/StaffStatusBadge.vue'
import {
  staffFinanceApi,
  type CreateExpenseTemplatePayload,
  type FinanceExpenseBill,
  type FinanceExpenseBillStatus,
  type FinanceExpenseCategory,
  type FinanceExpenseInterval,
  type FinanceExpensePayerType,
  type FinanceExpenseTemplate,
} from '../../api/staff-finance'
import { getStoredUser } from '../../utils/account'

/** 起账月：之前的月份没有账，月份切换不列出来（也就不会误生成） */
const FINANCE_START_MONTH = '2026-11'

/** 与后端 `FINANCE_EXPENSE_CATEGORY_LABELS` 一一对应（值是真源，中文照抄） */
const CATEGORY_LABELS: Record<FinanceExpenseCategory, string> = {
  RAW_MATERIAL: '原料采购',
  PACKAGING_SUPPLIES: '包材耗材',
  PAYROLL: '工资',
  RENT: '房租',
  UTILITIES: '水电燃气',
  NETWORK_COMMUNICATION: '宽带通信',
  TECHNICAL_SERVICES: '服务器/域名/证书/备案',
  LOGISTICS_DELIVERY: '物流配送费',
  ADMINISTRATIVE: '行政费用',
  AFTERSALE_LOSS: '售后退款/经营损失',
  OTHER: '其他杂项',
  SUPPLEMENT: '补剂采购',
  TAX: '税费',
  SOCIAL_INSURANCE: '社保',
  EQUIPMENT: '设备工具',
  PAYMENT_FEE: '支付手续费',
}

/** 固定费用常用的几类；其余类别只用于展示老模板，不在新建表单里出现 */
const FIXED_FEE_CATEGORIES: readonly FinanceExpenseCategory[] = [
  'RENT',
  'UTILITIES',
  'NETWORK_COMMUNICATION',
  'PAYROLL',
  'SOCIAL_INSURANCE',
  'TAX',
  'TECHNICAL_SERVICES',
  'ADMINISTRATIVE',
  'LOGISTICS_DELIVERY',
  'OTHER',
]

const CATEGORY_OPTIONS = FIXED_FEE_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}))

const INTERVAL_LABELS: Record<FinanceExpenseInterval, string> = {
  MONTHLY: '每月',
  QUARTERLY: '每季',
  YEARLY: '每年',
}

const INTERVAL_OPTIONS: Array<{
  value: FinanceExpenseInterval
  label: string
}> = [
  { value: 'MONTHLY', label: INTERVAL_LABELS.MONTHLY },
  { value: 'QUARTERLY', label: INTERVAL_LABELS.QUARTERLY },
  { value: 'YEARLY', label: INTERVAL_LABELS.YEARLY },
]

const PAYER_OPTIONS: Array<{
  value: FinanceExpensePayerType
  label: string
}> = [
  { value: 'PERSONAL', label: '我个人垫的' },
  { value: 'COMPANY', label: '公司账户' },
]

/** 几号：1-31，月份没有这一天时后端按月末算 */
const DAY_LABELS = Array.from({ length: 31 }, (_, index) => `${index + 1} 号`)

type StaffBadgeTone = 'pending' | 'done' | 'danger' | 'neutral'

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 按上海时区取当前年月，设备时区不是 +08:00 时月初也不会串月 */
function shanghaiYearMonth(): string {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** 统一金额格式：千分位，整数不带 .00，有分则保留两位 */
function formatMoney(value: number | string | null | undefined): string {
  const amount = Math.abs(Number(value) || 0)
  const [integer, decimal] = amount.toFixed(2).split('.')
  const grouped = integer.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
  return decimal === '00' ? grouped : `${grouped}.${decimal}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string } | null)?.errMsg
  return typeof errMsg === 'string' && errMsg ? errMsg : '请稍后重试'
}

function toast(title: string, icon: 'none' | 'success' = 'none') {
  uni.showToast({ title, icon, duration: icon === 'none' ? 2500 : 1500 })
}

/** 金额校验：空、非数字、非正数、超过两位小数都拦下（与后端口径一致） */
function parseAmountText(raw: string): { value: number } | { error: string } {
  const text = raw.trim()
  if (!text) return { error: '请输入金额' }
  if (!/^\d*\.?\d*$/.test(text)) return { error: '请输入正确的金额' }
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return { error: '金额必须大于 0' }
  const cents = Math.round(value * 100)
  if (Math.abs(cents - value * 100) > 1e-6) {
    return { error: '金额最多两位小数' }
  }
  return { value: cents / 100 }
}

/** 账单上的「几号」：优先取日期字符串的日部分，模板直接给数字 */
function dayLabel(value: string | number | null | undefined): string {
  const day =
    typeof value === 'string' ? Number(value.slice(8, 10)) : Number(value)
  if (!Number.isFinite(day) || day < 1) return '1 号'
  return `${Math.min(Math.floor(day), 31)} 号`
}

function categoryLabel(value: string): string {
  return (
    CATEGORY_LABELS[value as FinanceExpenseCategory] || CATEGORY_LABELS.OTHER
  )
}

function intervalLabel(value: string): string {
  return (
    INTERVAL_LABELS[value as FinanceExpenseInterval] ||
    INTERVAL_LABELS.MONTHLY
  )
}

function payerLabel(value: string | null | undefined): string {
  return value === 'COMPANY' ? '公司账户' : '我个人垫的'
}

function statusLabel(status: FinanceExpenseBillStatus): string {
  if (status === 'PAID') return '已付'
  if (status === 'PARTIALLY_PAID') return '部分付'
  if (status === 'CANCELLED') return '已取消'
  return '待付'
}

function statusTone(status: FinanceExpenseBillStatus): StaffBadgeTone {
  if (status === 'PAID') return 'done'
  if (status === 'CANCELLED') return 'neutral'
  return 'pending'
}

const currentMonth = ref(shanghaiYearMonth())
const activeMonth = ref(currentMonth.value)

/** 最近三个月：本月 + 前两个月；起账月之前没有账，不列 */
const monthChips = computed<Array<{ key: string; label: string }>>(() => {
  const [year, month] = currentMonth.value.split('-').map(Number)
  const chips: Array<{ key: string; label: string }> = []
  for (let offset = 0; offset < 3; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1))
    const key = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
    if (key < FINANCE_START_MONTH) continue
    chips.push({ key, label: `${Number(key.slice(5, 7))} 月` })
  }
  return chips
})

const isCurrentMonth = computed(() => activeMonth.value === currentMonth.value)

const monthTitle = computed(() => {
  const [year, month] = activeMonth.value.split('-')
  return `${year} 年 ${Number(month)} 月`
})

const billSectionTitle = computed(() =>
  isCurrentMonth.value ? '本月待付' : '该月待付',
)

const generateLabel = computed(() =>
  isCurrentMonth.value ? '补生成本月' : '补生成该月',
)

const billsEmptyTitle = computed(() =>
  isCurrentMonth.value
    ? '本月还没有固定费用，先设几个固定项目'
    : '该月还没有固定费用',
)

const billsEmptyHint = computed(() =>
  templates.value.length === 0
    ? '先建几个每月都要付的项目，回来自动按月出账单'
    : '点「补生成」把该月的账单补出来；已经生成过不会重复',
)

const bills = ref<FinanceExpenseBill[]>([])
const templates = ref<FinanceExpenseTemplate[]>([])
const billsLoading = ref(true)
const templatesLoading = ref(true)
const billsError = ref('')
const templatesError = ref('')
const generating = ref(false)

/** 请求序号：切月份时丢弃旧响应，避免旧月份的账单盖上来 */
let billsSeq = 0

const sortedTemplates = computed(() =>
  [...templates.value].sort(
    (left, right) => Number(right.isActive) - Number(left.isActive),
  ),
)

function paidTotalOf(bill: FinanceExpenseBill): number {
  return roundMoney(
    (bill.payments || []).reduce(
      (sum, payment) => sum + (Number(payment.paidAmount) || 0),
      0,
    ),
  )
}

/** 剩余应付 = 账单金额 − 累计实付；付满后后端会改写金额，这里仍兜底为 0 */
function remainingOf(bill: FinanceExpenseBill): number {
  return Math.max(0, roundMoney(Number(bill.amount) - paidTotalOf(bill)))
}

function partialText(bill: FinanceExpenseBill): string {
  if (bill.status === 'PAID') return ''
  const paid = paidTotalOf(bill)
  return paid > 0 ? `已付 ¥${formatMoney(paid)}` : ''
}

const pendingTotal = computed(() =>
  roundMoney(
    bills.value.reduce(
      (sum, bill) =>
        bill.status === 'PAID' ? sum : sum + remainingOf(bill),
      0,
    ),
  ),
)

/**
 * 跨月后仍停在「本月」视图时，跟着切到新的本月；
 * 正在看历史月份则保持不动。
 */
function syncCurrentMonth() {
  const month = shanghaiYearMonth()
  if (month === currentMonth.value) return
  if (activeMonth.value === currentMonth.value) activeMonth.value = month
  currentMonth.value = month
}

async function loadTemplates() {
  templatesLoading.value = true
  templatesError.value = ''
  try {
    const rows = await staffFinanceApi.listTemplates()
    templates.value = Array.isArray(rows) ? rows : []
  } catch (error) {
    templatesError.value = errorMessage(error)
  } finally {
    templatesLoading.value = false
  }
}

async function loadBills() {
  const seq = ++billsSeq
  billsLoading.value = true
  billsError.value = ''
  try {
    const rows = await staffFinanceApi.listBills(activeMonth.value)
    if (seq !== billsSeq) return
    bills.value = Array.isArray(rows) ? rows : []
  } catch (error) {
    if (seq !== billsSeq) return
    billsError.value = errorMessage(error)
  } finally {
    if (seq === billsSeq) billsLoading.value = false
  }
}

function selectMonth(month: string) {
  if (activeMonth.value === month) return
  activeMonth.value = month
  loadBills()
}

/** 补生成：0 笔说明当月都已生成，不重复写库 */
async function generateBills() {
  if (generating.value) return
  generating.value = true
  try {
    const result = await staffFinanceApi.generateBills(activeMonth.value)
    const created = Number(result?.created) || 0
    if (created > 0) {
      toast(`已生成 ${created} 笔`, 'success')
    } else {
      toast(isCurrentMonth.value ? '本月都已生成' : '该月都已生成')
    }
    await loadBills()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    generating.value = false
  }
}

function onBillsEmptyAction() {
  if (templates.value.length === 0) {
    openCreate()
    return
  }
  generateBills()
}

// ---------------------------------------------------------------------------
// 标记已付
// ---------------------------------------------------------------------------

const payTarget = ref<FinanceExpenseBill | null>(null)
const payAmountText = ref('')
const payPayerType = ref<FinanceExpensePayerType>('PERSONAL')
const paying = ref(false)

const payRemaining = computed(() =>
  payTarget.value ? remainingOf(payTarget.value) : 0,
)

/** 默认填剩余应付；付款方继承账单（账单又从模板继承） */
function openPay(bill: FinanceExpenseBill) {
  if (bill.status === 'PAID') return
  payTarget.value = bill
  payAmountText.value = remainingOf(bill).toFixed(2)
  payPayerType.value =
    bill.payerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL'
}

function closePay() {
  if (paying.value) return
  payTarget.value = null
}

function onPayAmountInput(event: any) {
  payAmountText.value = String(event?.detail?.value ?? '')
}

function selectPayPayer(value: FinanceExpensePayerType) {
  payPayerType.value = value
}

async function confirmPay() {
  const bill = payTarget.value
  if (!bill || paying.value) return

  const amount = parseAmountText(payAmountText.value)
  if ('error' in amount) {
    toast(amount.error)
    return
  }
  const alreadyPaid = paidTotalOf(bill)
  // 首笔允许按实际金额覆盖模板金额（水电这类实付可能不一样）；
  // 已经部分付过的，本次不能超过剩余应付（后端也这样校验）。
  if (alreadyPaid > 0 && amount.value > remainingOf(bill)) {
    toast(`本次实付不能超过剩余应付 ¥${formatMoney(remainingOf(bill))}`)
    return
  }

  paying.value = true
  try {
    await staffFinanceApi.payBill(bill.id, {
      paidAmount: amount.value,
      payerType: payPayerType.value,
    })
    payTarget.value = null
    toast('已标记已付', 'success')
    await loadBills()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    paying.value = false
  }
}

// ---------------------------------------------------------------------------
// 新建 / 编辑 / 停用固定项目
// ---------------------------------------------------------------------------

const formOpen = ref(false)
const editingTemplate = ref<FinanceExpenseTemplate | null>(null)
const formName = ref('')
const formCategory = ref<FinanceExpenseCategory>('RENT')
const formAmountText = ref('')
const formInterval = ref<FinanceExpenseInterval>('MONTHLY')
const formDayIndex = ref(0)
const formServiceMonthsText = ref('1')
const formPayerType = ref<FinanceExpensePayerType>('PERSONAL')
const formSubmitting = ref(false)

const formTitle = computed(() =>
  editingTemplate.value ? '编辑固定费用' : '新建固定费用',
)

/** 年付的月份：老模板沿用原值，新建时用当前选中月份 */
const yearlyMonth = computed(() => {
  const saved = Number(editingTemplate.value?.monthOfYear)
  if (Number.isInteger(saved) && saved >= 1 && saved <= 12) return saved
  return Number(activeMonth.value.slice(5, 7))
})

const yearlyHint = computed(
  () => `年付：每年 ${yearlyMonth.value} 月生成一张，几号是到期日`,
)

function openCreate() {
  editingTemplate.value = null
  formName.value = ''
  formCategory.value = 'RENT'
  formAmountText.value = ''
  formInterval.value = 'MONTHLY'
  formDayIndex.value = 0
  formServiceMonthsText.value = '1'
  formPayerType.value = 'PERSONAL'
  formOpen.value = true
}

function openEdit(template: FinanceExpenseTemplate) {
  editingTemplate.value = template
  formName.value = template.name
  formCategory.value = template.category
  formAmountText.value = String(
    roundMoney(Number(template.defaultAmount) || 0) || '',
  )
  formInterval.value = template.interval
  const day = Number(template.dayOfMonth)
  formDayIndex.value = (Number.isFinite(day) ? Math.min(31, Math.max(1, day)) : 1) - 1
  formServiceMonthsText.value = String(
    Number(template.servicePeriodMonths) || 1,
  )
  formPayerType.value =
    template.payerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL'
  formOpen.value = true
}

function closeForm() {
  if (formSubmitting.value) return
  formOpen.value = false
}

function onNameInput(event: any) {
  formName.value = String(event?.detail?.value ?? '')
}

function onFormAmountInput(event: any) {
  formAmountText.value = String(event?.detail?.value ?? '')
}

function onServiceMonthsInput(event: any) {
  formServiceMonthsText.value = String(event?.detail?.value ?? '')
}

function selectCategory(value: FinanceExpenseCategory) {
  formCategory.value = value
}

function selectFormPayer(value: FinanceExpensePayerType) {
  formPayerType.value = value
}

function selectInterval(value: FinanceExpenseInterval) {
  formInterval.value = value
  // 年付通常是宽带/域名这类一次付一年：默认服务期从 1 换成 12，用户还能改
  if (value === 'YEARLY' && formServiceMonthsText.value.trim() === '1') {
    formServiceMonthsText.value = '12'
  }
}

function onPickDay(event: any) {
  const index = Number(event?.detail?.value)
  if (!Number.isInteger(index) || index < 0 || index >= DAY_LABELS.length) return
  formDayIndex.value = index
}

/**
 * 组装入参：后端 `titleTemplate` / `payeeName` 必填，但表单不采集——
 * 新建时标题模板用「名称 + 年月」，收款方与名称一致；
 * 编辑时名称没改就沿用原标题，收款方保留后台填的值，不覆盖。
 */
function buildTemplatePayload(
  name: string,
  amount: number,
  serviceMonths: number,
): CreateExpenseTemplatePayload {
  const editing = editingTemplate.value
  const payload: CreateExpenseTemplatePayload = {
    name,
    titleTemplate:
      editing && editing.name === name
        ? editing.titleTemplate
        : `${name} {{year}}年{{month}}月`,
    category: formCategory.value,
    payeeName: editing?.payeeName || name,
    defaultAmount: amount,
    interval: formInterval.value,
    dayOfMonth: formDayIndex.value + 1,
    servicePeriodMonths: serviceMonths,
    payerType: formPayerType.value,
  }
  if (formInterval.value === 'YEARLY') payload.monthOfYear = yearlyMonth.value
  return payload
}

async function saveTemplate() {
  if (formSubmitting.value) return

  const name = formName.value.trim()
  if (!name) {
    toast('请填写名称')
    return
  }
  const amount = parseAmountText(formAmountText.value)
  if ('error' in amount) {
    toast(amount.error)
    return
  }
  const monthsText = formServiceMonthsText.value.trim()
  if (!/^\d+$/.test(monthsText)) {
    toast('服务期月数填整数，最多 120')
    return
  }
  const serviceMonths = Number(monthsText)
  if (serviceMonths < 1 || serviceMonths > 120) {
    toast('服务期月数填 1-120')
    return
  }

  const payload = buildTemplatePayload(name, amount.value, serviceMonths)
  formSubmitting.value = true
  try {
    if (editingTemplate.value) {
      await staffFinanceApi.updateTemplate(editingTemplate.value.id, payload)
      toast('已保存', 'success')
    } else {
      await staffFinanceApi.createTemplate(payload)
      toast('已新建，可补生成账单', 'success')
    }
    formOpen.value = false
    await Promise.all([loadTemplates(), loadBills()])
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    formSubmitting.value = false
  }
}

/** 停用前二次确认，文案说清只影响以后 */
function deactivateEditing() {
  const template = editingTemplate.value
  if (!template || formSubmitting.value) return
  uni.showModal({
    title: '停用固定费用',
    content: '停用只影响以后：不再生成新账单，已经生成的账单和历史记录都不变。',
    confirmText: '停用',
    confirmColor: '#1E3A2F',
    success: async (res) => {
      if (!res.confirm) return
      formSubmitting.value = true
      try {
        await staffFinanceApi.deactivateTemplate(template.id)
        formOpen.value = false
        toast('已停用', 'success')
        await Promise.all([loadTemplates(), loadBills()])
      } catch (error) {
        toast(errorMessage(error))
      } finally {
        formSubmitting.value = false
      }
    },
  })
}

onShow(() => {
  // 员工直接输地址进来时先拦下，连请求都不发（后端也会 403）
  if (getStoredUser()?.role !== 'ADMIN') {
    uni.showToast({ title: '权限不足', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack({
        fail: () => {
          uni.reLaunch({ url: '/pages/staff-workbench/index' })
        },
      })
    }, 600)
    return
  }
  syncCurrentMonth()
  loadTemplates()
  loadBills()
})
</script>

<style scoped lang="scss">
@import '../../styles/staff-tokens.scss';

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx $staff-gutter calc(200rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
}

.month-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4rpx 4rpx 0;
}

.month-title {
  font-size: $staff-font-h1;
  font-weight: 700;
  color: $staff-ink;
}

.month-hint {
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.month-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 88rpx;
  padding: 0 24rpx;
  font-size: $staff-font-sub;
  color: $staff-ink;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-pill;
}

.chip--on {
  font-weight: 600;
  color: $staff-cream;
  background: $staff-brand;
  border-color: $staff-brand;
}

.card {
  margin-top: 16rpx;
  padding: $staff-card-padding;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
  box-shadow: $staff-shadow-card;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.card-head-main {
  display: flex;
  flex-direction: column;
}

.card-title {
  font-size: $staff-font-h2;
  font-weight: 700;
  color: $staff-ink;
}

.card-sub {
  margin-top: 4rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
  font-variant-numeric: tabular-nums;
}

/* 文字动作：88rpx 高保证触控，右侧不留白靠负 margin 对齐卡片边 */
.card-action {
  flex: none;
  min-height: 88rpx;
  margin: -18rpx -8rpx -18rpx 16rpx;
  padding: 0 8rpx;
  font-size: $staff-font-sub;
  font-weight: 600;
  line-height: 88rpx;
  color: $staff-brand;
  text-align: right;
}

.list {
  margin-top: 4rpx;
}

.bill-row,
.template-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid $staff-line;
}

.bill-row:last-child,
.template-row:last-child {
  border-bottom: none;
}

.bill-main,
.template-main {
  flex: 1;
  min-width: 0;
  padding-right: 16rpx;
}

.bill-title,
.template-name {
  display: block;
  font-size: $staff-font-body;
  font-weight: 600;
  color: $staff-ink;
  @include staff-ellipsis;
}

.bill-meta,
.template-meta {
  display: block;
  margin-top: 6rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-ink-2;
  font-variant-numeric: tabular-nums;
}

.bill-partial {
  display: block;
  margin-top: 4rpx;
  font-size: $staff-font-caption;
  color: $staff-gold-ink;
  font-variant-numeric: tabular-nums;
}

.bill-side {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 10rpx;
}

/* 行内按钮：金额区的小动作，保留 72rpx 触控高度 */
.row-btn {
  min-height: 72rpx;
  margin: 0;
  padding: 0 24rpx;
  font-size: $staff-font-caption;
  font-weight: 600;
  line-height: 72rpx;
  color: $staff-brand;
  background: $staff-brand-soft;
  border-radius: $staff-radius-pill;
}

.row-btn::after {
  border: none;
}

.row-done {
  font-size: $staff-font-caption;
  color: $staff-ink-3;
}

.template-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.template-state {
  flex: none;
  padding: 4rpx 12rpx;
  font-size: $staff-font-caption;
  font-weight: 600;
  color: $staff-brand;
  background: $staff-brand-soft;
  border-radius: $staff-radius-pill;
}

.template-state--off {
  color: $staff-ink-2;
  background: $staff-line;
}

.template-side {
  display: flex;
  flex: none;
  align-items: center;
}

.template-amount {
  font-size: $staff-font-body;
  font-weight: 600;
  color: $staff-ink;
  font-variant-numeric: tabular-nums;
}

.template-chevron {
  margin-left: 10rpx;
  font-size: $staff-font-body;
  color: $staff-ink-3;
}

.list-hint {
  display: block;
  padding-top: 16rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-ink-2;
}

.stale-hint {
  display: block;
  padding-top: 12rpx;
  font-size: $staff-font-caption;
  color: $staff-gold-ink;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 72rpx 24rpx;
}

.state-title {
  font-size: $staff-font-h2;
  font-weight: 700;
  color: $staff-ink;
}

.state-hint {
  margin-top: 12rpx;
  font-size: $staff-font-sub;
  line-height: 1.5;
  text-align: center;
  color: $staff-ink-2;
}

.state-retry {
  min-width: 200rpx;
  min-height: 88rpx;
  margin-top: 32rpx;
  padding: 0 48rpx;
  font-size: $staff-font-body;
  line-height: 88rpx;
  color: $staff-cream;
  background: $staff-brand;
  border-radius: $staff-radius-control;
}

.state-retry::after {
  border: none;
}

.skeleton {
  padding-top: 16rpx;
}

.sk-row {
  height: 96rpx;
  margin-bottom: 16rpx;
  background: $staff-line;
  border-radius: $staff-radius-control;
}

.primary-btn {
  flex: 1;
  min-height: 88rpx;
  margin: 0;
  font-size: $staff-font-body;
  font-weight: 600;
  line-height: 88rpx;
  color: $staff-cream;
  background: $staff-brand;
  border-radius: $staff-radius-control;
}

.primary-btn::after {
  border: none;
}

.primary-btn[disabled] {
  color: $staff-cream;
  background: $staff-ink-3;
}

/* 弹层：底部抽屉，遮罩盖住固定底栏 */
.mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  background: rgba(20, 30, 24, 0.45);
}

.sheet {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 88vh;
  padding: 24rpx $staff-gutter calc(24rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
  border-radius: 28rpx 28rpx 0 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8rpx;
}

.sheet-title {
  font-size: $staff-font-h2;
  font-weight: 700;
  color: $staff-ink;
}

.sheet-close {
  min-height: 88rpx;
  padding: 0 8rpx;
  font-size: $staff-font-sub;
  line-height: 88rpx;
  color: $staff-ink-2;
}

.sheet-name {
  display: block;
  margin-top: 4rpx;
  font-size: $staff-font-body;
  font-weight: 600;
  color: $staff-ink;
}

.sheet-meta {
  display: block;
  margin-top: 4rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
  font-variant-numeric: tabular-nums;
}

.sheet-body {
  max-height: 56vh;
  margin: 8rpx 0 16rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.field {
  padding: 18rpx 0;
}

.field-label {
  display: block;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.field-hint {
  display: block;
  margin-top: 10rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-ink-2;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.amount-row {
  display: flex;
  align-items: baseline;
  min-height: 88rpx;
  margin-top: 8rpx;
  border-bottom: 1rpx solid $staff-line-strong;
}

.amount-row--card {
  padding: 0 20rpx;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-control;
}

.amount-currency {
  margin-right: 8rpx;
  font-size: $staff-font-h1;
  font-weight: 600;
  color: $staff-ink-2;
}

.amount-input {
  flex: 1;
  height: 88rpx;
  font-size: $staff-font-metric;
  font-weight: 700;
  line-height: 88rpx;
  color: $staff-ink;
  font-variant-numeric: tabular-nums;
}

.amount-placeholder {
  font-size: $staff-font-metric;
  font-weight: 700;
  color: $staff-ink-3;
}

.text-input {
  box-sizing: border-box;
  height: 88rpx;
  margin-top: 12rpx;
  padding: 0 20rpx;
  font-size: $staff-font-body;
  color: $staff-ink;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-control;
}

.text-placeholder {
  color: $staff-ink-3;
}

.picker-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
  margin-top: 4rpx;
  padding: 0 20rpx;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-control;
}

.picker-text {
  font-size: $staff-font-body;
  font-weight: 600;
  color: $staff-ink;
  font-variant-numeric: tabular-nums;
}

.picker-chevron {
  font-size: $staff-font-body;
  color: $staff-ink-3;
}

/* 停用：中性次要动作，红色不用于此类设置（UI 规范 §1） */
.deactivate-btn {
  min-height: 88rpx;
  margin: 16rpx 0 0;
  font-size: $staff-font-body;
  font-weight: 600;
  line-height: 88rpx;
  color: $staff-ink-2;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-control;
}

.deactivate-btn::after {
  border: none;
}
</style>

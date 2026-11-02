<template>
  <view class="page">
    <!-- 没有草稿：从订单页返回、收藏/转发进来都会走到这里，必须给出口 -->
    <view v-if="!draft" class="empty-state">
      <text class="empty-title">没有待购买的补剂</text>
      <text class="empty-desc">补剂是从 DIY 制作单带过来的。先在「我的制作单」里打开一份，再点「购买预分装补剂」。</text>
      <button class="empty-action" @tap="goToDiySheetList">去我的制作单</button>
    </view>

    <!-- 商城关闭：整页提示，别让顾客填完最后一步才被拒 -->
    <view v-else-if="!enabled" class="empty-state">
      <text class="empty-title">补剂商城暂未开放</text>
      <text class="empty-desc">可以先回制作单看看，开放后再来买。</text>
      <button class="empty-action" @tap="goToDiySheetList">返回我的制作单</button>
    </view>

    <!-- 首次报价期间：明确的加载态，避免页面看起来是空的/坏了 -->
    <view v-else-if="initializing" class="empty-state">
      <text class="empty-title">正在核对补剂</text>
      <text class="empty-desc">正在按制作单上的配比算价格，请稍候…</text>
    </view>

    <!-- 这张制作单上的补剂一条都买不了：逐条说清原因，并给出口 -->
    <view v-else-if="allUnavailable" class="empty-state">
      <text class="empty-title">这些补剂暂时无法购买</text>
      <text class="empty-desc">制作单上的补剂目前都不能买，原因如下：</text>
      <view class="unavailable-list">
        <text
          v-for="item in unavailable"
          :key="item.ingredientId"
          class="unavailable-line"
        >
          · {{ item.name }}：{{ item.reason }}
        </text>
      </view>
      <button class="empty-action" @tap="goToDiySheetList">返回我的制作单</button>
      <CustomerServiceInlineButton
        class="empty-service"
        source-type="PRODUCT"
        :product-id="draft.recipeId"
        :product-name="draft.recipeName"
        title="补剂下单咨询"
        path="/pages/supplement-order/index"
      />
    </view>

    <template v-else>
      <!-- 预分装说明图：页面最顶部，常显 -->
      <view class="section prepack-card">
        <image class="prepack-image" src="/static/mall/prepack-explainer.jpg" mode="widthFix" />
      </view>

      <!-- 来源制作单 -->
      <view class="section source-card">
        <view class="source-main">
          <text class="source-title">{{ draft.recipeName || 'DIY 制作单' }}</text>
          <text class="source-sub">
            <text v-if="draft.dogName">{{ draft.dogName }}</text>
            <text v-else>按当前制作单配比</text>
          </text>
        </view>
      </view>

      <!-- 快速改分装：直接改这张制作单的分装，不用跳回配置页 -->
      <view class="section plan-section">
        <view class="section-title">
          <text class="title-text">快速选择备餐天数</text>
          <text v-if="replanning" class="plan-pending">更新中…</text>
        </view>
        <QuickCyclePackagePlan
          v-if="canQuickAdjust"
          :cycle-days="selectedCycleDays"
          :package-plan="planRows"
          :is-custom="isCustomPackagePlan"
          :editor-open="showPackageEditor"
          :summary-text="inlineSummaryText"
          :warnings="planWarnings"
          :daily-intake-g="sheet?.dailyIntakeG || 0"
          :meals-per-day="resolveMealsPerDay()"
          @select-cycle="onSelectCycle"
          @toggle-custom="togglePackageEditor"
          @add-row="addPackagePlanRow"
          @update-row="updatePackagePlanRow"
          @remove-row="removePackagePlanRow"
        />
        <text v-else class="plan-unavailable">
          这张制作单缺少饭量信息，暂时不能在这里改分装，请回制作单里修改。
        </text>
      </view>

      <!-- 补剂清单 -->
      <view class="section">
        <view class="section-title">
          <text class="title-text">本制作单需要的补剂</text>
          <text
            v-if="selectableLines.length > 1"
            class="title-action"
            @tap="toggleAll"
          >
            {{ allSelectableSelected ? '全不选' : '全选' }}
          </text>
        </view>
        <view
          v-for="line in lines"
          :key="line.ingredientId"
          class="line-row"
          :class="{ 'line-row-disabled': !!line.unavailableReason }"
          @tap="toggleLine(line.ingredientId)"
        >
          <view class="line-check">
            <view
              class="checkbox"
              :class="{
                'checkbox-checked': selectedIds.includes(line.ingredientId),
                'checkbox-disabled': !!line.unavailableReason
              }"
            >
              <text v-if="selectedIds.includes(line.ingredientId)" class="checkbox-tick">✓</text>
            </view>
          </view>

          <view class="line-main">
            <text class="line-name">{{ line.name }}</text>
            <text v-if="line.specText" class="line-extra">{{ line.specText }}</text>
            <text v-if="line.unavailableReason" class="line-warn">
              暂不可购买：{{ line.unavailableReason }}
            </text>
          </view>

          <text
            v-if="!line.unavailableReason"
            class="line-packed"
          >
            <text v-if="portionMultiplier === 1">{{ lineAmount(line) }}</text>
            <text v-else>{{ lineAmount(line) }} × {{ portionMultiplier }} 袋</text>
          </text>
          <text v-else class="line-packed line-packed-disabled">—</text>
        </view>

        <!-- 袋数：贴在清单下方，只保留 1/2/3 -->
        <view v-if="selectableLines.length > 0" class="portion-block">
          <text class="portion-title">袋数</text>
          <view class="portion-options">
            <view
              v-for="opt in portionOptionCards"
              :key="opt.multiplier"
              class="portion-option"
              :class="{ 'portion-option-active': opt.multiplier === portionMultiplier }"
              @tap="selectPortion(opt.multiplier)"
            >
              <text v-if="opt.freeShipping" class="portion-badge">已包邮</text>
              <text class="portion-option-num">{{ opt.multiplier }} 袋</text>
              <text class="portion-option-price">{{ opt.priceLabel }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 收货地址 -->
      <view class="section">
        <view class="section-title">
          <text class="title-text">收货地址</text>
        </view>
        <view v-if="selectedAddress" class="address-card" @tap="chooseAddress">
          <view class="address-main">
            <text class="address-name">{{ selectedAddress.recipientName }} {{ selectedAddress.phone }}</text>
            <text class="address-detail">{{ formatRegion(selectedAddress.region) }}{{ selectedAddress.detail }}</text>
          </view>
          <text class="address-action">更换</text>
        </view>
        <view v-else class="address-card address-empty" @tap="chooseAddress">
          <text class="address-placeholder">
            {{ addressInvalid ? '地址已失效，请重新选择' : '请选择收货地址' }}
          </text>
          <text class="address-action">去选择</text>
        </view>
      </view>

      <!-- 报价失败：行内横幅 + 重试，不再弹 toast -->
      <view v-if="status === 'failed'" class="section error-banner">
        <text class="error-banner-text">价格没拿到：{{ quoteError }}</text>
        <text class="error-banner-retry" @tap="onRetryQuote">重试</text>
      </view>

      <!-- 费用明细 -->
      <view v-if="summary && summary.goodsSubtotal > 0" class="section fee-card">
        <view class="section-title">
          <text class="title-text">费用明细</text>
        </view>

        <view class="fee-row">
          <text class="fee-label">补剂商品金额</text>
          <text class="fee-value">¥{{ money(summary.goodsSubtotal) }}</text>
        </view>

        <view class="fee-row">
          <text class="fee-label">分装服务费</text>
          <text v-if="summary.serviceFeeWaived" class="fee-value fee-value-free">已免</text>
          <text v-else class="fee-value">¥{{ money(summary.serviceFee) }}</text>
        </view>

        <view v-if="summary.packagingFee > 0" class="fee-row">
          <text class="fee-label">包材费</text>
          <text class="fee-value">¥{{ money(summary.packagingFee) }}</text>
        </view>

        <view class="fee-row">
          <text class="fee-label">运费</text>
          <text v-if="summary.freeShipping" class="fee-value fee-value-free">包邮</text>
          <text v-else class="fee-value">¥{{ money(summary.shippingFee) }}</text>
        </view>

        <view class="fee-row fee-row-total">
          <text class="fee-label">合计</text>
          <text class="fee-value fee-value-total">¥{{ money(summary.total) }}</text>
        </view>

        <view class="delivery-row">
          <text class="fee-label">预计发货</text>
          <text class="delivery-value">
            {{ estimatedPackingDate || (autoScheduleEnabled ? '待排期' : '待管理员排期') }}
          </text>
        </view>

        <text v-if="bulkWarning" class="fee-note fee-note-warn">
          本单分装量较大（约 {{ bagCount }} 袋），实际发货会顺延，我们会联系你确认。
        </text>
      </view>

      <!-- 未达最低起送：先说明，别等提交时才被拒 -->
      <view v-if="belowMinOrder" class="section error-banner">
        <text class="error-banner-text">
          商品金额 ¥{{ money(summary?.goodsSubtotal) }}，未达最低起送 ¥{{ money(minOrderAmount) }}
        </text>
      </view>

      <!-- 提交失败：行内展示服务端给的真实原因 -->
      <view v-if="submitError" class="section error-banner">
        <text class="error-banner-text">{{ submitError }}</text>
      </view>

      <view v-if="!summary && selectableLines.length > 0" class="section empty-hint">
        <text class="empty-hint-text">请至少选择 1 种补剂</text>
      </view>

      <view class="footer-space"></view>

      <view class="footer">
        <CustomerServiceInlineButton
          class="customer-service-bottom-action"
          source-type="PRODUCT"
          :product-id="draft.recipeId"
          :product-name="draft.recipeName"
          title="补剂下单咨询"
          path="/pages/supplement-order/index"
        />
        <view class="footer-main">
          <view class="footer-total">
            <text v-if="!isAmountReady" class="footer-amount footer-amount-pending">更新中</text>
            <text v-else class="footer-amount">¥{{ money(summary?.total) }}</text>
          </view>
          <button
            class="footer-btn"
            :class="{ 'footer-btn-disabled': !canSubmit || submitting }"
            :disabled="!canSubmit || submitting"
            @tap="openConfirmSheet"
          >
            <text class="footer-btn-text">{{ submitting ? '处理中…' : '提交订单' }}</text>
          </button>
        </view>
      </view>
    </template>

    <!-- 提交前确认 -->
    <view v-if="showConfirmSheet" class="sheet-mask" @tap="closeConfirmSheet">
      <view class="sheet sheet-tall" @tap.stop>
        <text class="sheet-title">确认订单</text>

        <view class="confirm-row">
          <text class="confirm-label">收货地址</text>
          <text class="confirm-value">{{ selectedAddress ? `${selectedAddress.recipientName} ${selectedAddress.phone}` : '' }}</text>
        </view>
        <view v-if="selectedAddress" class="confirm-address-detail">
          {{ formatRegion(selectedAddress.region) }}{{ selectedAddress.detail }}
        </view>

        <view class="confirm-row">
          <text class="confirm-label">补剂</text>
          <text class="confirm-value">{{ selectedLines.length }} 种 · 共 {{ bagCount }} 袋</text>
        </view>
        <view class="confirm-row">
          <text class="confirm-label">商品金额</text>
          <text class="confirm-value">¥{{ money(summary?.goodsSubtotal) }}</text>
        </view>
        <view class="confirm-row">
          <text class="confirm-label">分装服务费</text>
          <text class="confirm-value">{{ summary?.serviceFeeWaived ? '已免' : `¥${money(summary?.serviceFee)}` }}</text>
        </view>
        <view class="confirm-row">
          <text class="confirm-label">运费</text>
          <text class="confirm-value">{{ summary?.freeShipping ? '包邮' : `¥${money(summary?.shippingFee)}` }}</text>
        </view>
        <view class="confirm-row confirm-row-total">
          <text class="confirm-label">合计</text>
          <text class="confirm-value confirm-total">¥{{ money(summary?.total) }}</text>
        </view>
        <view class="confirm-row">
          <text class="confirm-label">预计发货</text>
          <text class="confirm-value">{{ estimatedPackingDate || '待排期' }}</text>
        </view>

        <text v-if="priceChanged" class="confirm-warn">价格有更新，请确认新金额后再提交。</text>
        <text class="confirm-note">补剂是定制分装，分装后不支持无理由退换；如分装有问题请在售后窗口内联系我们。</text>
        <text v-if="paymentTimeoutMinutes > 0" class="confirm-note">
          提交后 {{ paymentTimeoutMinutes }} 分钟内未付款，订单会自动取消。
        </text>
        <text v-if="submitError" class="confirm-warn">{{ submitError }}</text>

        <view class="sheet-actions">
          <view class="sheet-btn sheet-btn-ghost" @tap="closeConfirmSheet">再看看</view>
          <view
            class="sheet-btn sheet-btn-primary"
            :class="{ 'sheet-btn-disabled': submitting || confirmRefreshing || belowMinOrder }"
            @tap="submitOrder"
          >
            {{ confirmRefreshing ? '正在核对价格…' : submitting ? '处理中…' : '提交并支付' }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import {
  clearSupplementPurchaseDraft,
  createSupplementOrder,
  fetchSupplementOrderDetail,
  fetchSupplementPackingDate,
  prefetchSupplementSubscriptions,
  requestSupplementSubscriptions,
  quoteSupplements,
  readSupplementPurchaseDraft,
  saveSupplementPurchaseDraft,
  type SupplementOrder,
  type SupplementPurchaseDraft
} from '../../api/supplements'
import { runSupplementPayment } from '../../utils/supplement-payment'
import { fetchMyDiySheets, updateDiySheetPlan, type DIYSheetSummary } from '../../api/diy-sheets'
import { usePackagePlan } from '../../composables/usePackagePlan'
import { inferPackagePlanMode } from '../../utils/package-plan-mode'
import QuickCyclePackagePlan from '../../components/package-plan/QuickCyclePackagePlan.vue'
import { createRequestId, toCents } from '../../utils/supplement-order-submit'
import {
  useSupplementQuote,
  type QuoteFn,
  type QuoteLineState,
  type SeedLine
} from '../../composables/useSupplementQuote'
import CustomerServiceInlineButton from '../../components/CustomerServiceInlineButton.vue'

interface Address {
  id: string
  recipientName: string
  phone: string
  region: { province?: string; city?: string; district?: string }
  detail: string
  isDefault?: boolean
}

const draft = ref<SupplementPurchaseDraft | null>(null)
const addresses = ref<Address[]>([])
const selectedAddressId = ref('')
const initializing = ref(true)
const submitting = ref(false)
const submitError = ref('')
const estimatedPackingDate = ref('')
const autoScheduleEnabled = ref(true)
const sheet = ref<DIYSheetSummary | null>(null)
const replanning = ref(false)
let planTimer: ReturnType<typeof setTimeout> | null = null

const {
  selectedCycleDays,
  packagePlan: planRows,
  isCustomPackagePlan,
  showPackageEditor,
  normalizedPackagePlan,
  inlineSummaryText,
  validationMessage,
  rebuildPackagePlan,
  togglePackageEditor,
  addPackagePlanRow,
  updatePackagePlanRow,
  removePackagePlanRow
} = usePackagePlan({
  dailyIntakeG: () => sheet.value?.dailyIntakeG ?? 0,
  perMealG: () => sheet.value?.perMealG ?? 0,
  mealsPerDay: () => resolveMealsPerDay(),
  dogId: () => draft.value?.dogId,
  onPlanChanged: () => schedulePlanApply()
})

const canQuickAdjust = computed(
  () => !!draft.value?.diySheetId && Number(sheet.value?.dailyIntakeG) > 0
)

const planWarnings = computed(() => (validationMessage.value ? [validationMessage.value] : []))

const showConfirmSheet = ref(false)
const confirmRefreshing = ref(false)
const priceChanged = ref(false)
const submitRequestId = ref('')

/**
 * 算价状态机：报价、竞态、失败回滚、待确认全部在这里。
 * 页面只读它的状态、转发事件，不再自己管金额。
 */
const quoteState = useSupplementQuote({
  quote: quoteSupplements as unknown as QuoteFn,
  diySheetId: () => draft.value?.diySheetId
})

const {
  lines,
  selectedIds,
  selectableLines,
  selectedLines,
  allSelectableSelected,
  portionMultiplier,
  summary,
  unavailable,
  status,
  errorMessage: quoteError,
  enabled,
  minOrderAmount,
  paymentTimeoutMinutes,
  bulkBagThreshold,
  bagCount,
  isAmountReady,
  canSubmit: quoteCanSubmit,
  load,
  toggleLine,
  toggleAll,
  setPortion,
  retry
} = quoteState

const selectedAddress = computed(
  () => addresses.value.find((item) => item.id === selectedAddressId.value) || null
)

/** 选过地址但列表里找不到（比如已经删了）：要说清楚，并禁止提交 */
const addressInvalid = computed(
  () => !!selectedAddressId.value && !selectedAddress.value
)

const allUnavailable = computed(
  () => status.value === 'ready' && lines.value.length > 0 && selectableLines.value.length === 0
)

/** 未达最低起送：提交前就说明，别等最后一步被拒 */
const belowMinOrder = computed(
  () =>
    minOrderAmount.value > 0 &&
    Number(summary.value?.goodsSubtotal ?? 0) < minOrderAmount.value
)

const canSubmit = computed(
  () =>
    quoteCanSubmit.value &&
    !!selectedAddress.value &&
    !belowMinOrder.value &&
    !submitting.value &&
    !replanning.value
)


/** 三张卡的金额来自服务端 portionOptions；接口没给时留空，不猜价格 */
const portionOptionCards = computed(() => {
  const list = summary.value?.portionOptions ?? []
  if (list.length === 0) {
    return [1, 2, 3].map((multiplier) => ({
      multiplier,
      priceLabel: '',
      freeShipping: false
    }))
  }
  return list.map((opt) => ({
    multiplier: opt.multiplier,
    priceLabel: `¥${Number(opt.total).toFixed(2)}`,
    freeShipping: opt.freeShipping
  }))
})

const bulkWarning = computed(
  () => bulkBagThreshold.value > 0 && bagCount.value > bulkBagThreshold.value
)

onLoad(() => {
  draft.value = readSupplementPurchaseDraft()
  uni.$on('address-selected', onAddressSelected)

  if (!draft.value) {
    initializing.value = false
    return
  }

  /**
   * 幂等键一次进页面只生成一次：关掉确认弹层再提交、或建单响应丢了重试，
   * 都复用它 —— 否则"响应丢了"这种情况会变成两笔订单。
   */
  submitRequestId.value = createRequestId()

  if (Number(draft.value.portionMultiplier) > 1) {
    portionMultiplier.value = Math.floor(Number(draft.value.portionMultiplier))
  }

  void initialize()
})

onShow(() => {
  // 每次回到这一页都重拉地址：新增的地址只有重新拉才能显示出来
  if (draft.value) void loadAddresses()
})

onUnload(() => {
  uni.$off('address-selected', onAddressSelected)
  if (planTimer) {
    clearTimeout(planTimer)
    planTimer = null
  }
})

async function initialize() {
  initializing.value = true
  const sideTasks = Promise.all([
    loadAddresses(),
    loadPackingDate(),
    loadCurrentSheet(),
    prefetchSupplementSubscriptions()
  ])
  try {
    await load(buildSeedLines())
  } finally {
    initializing.value = false
  }
  await sideTasks
}

function buildSeedLines(): SeedLine[] {
  return (draft.value?.lines ?? []).map((line) => ({
    ingredientId: line.ingredientId,
    recipeItemId: line.recipeItemId,
    amount: line.amount,
    name: line.name,
    unit: line.unit,
    specText: line.specText
  }))
}

async function loadPackingDate() {
  try {
    const res = await fetchSupplementPackingDate()
    if (res.code === 0) {
      estimatedPackingDate.value = res.data?.packingDate || ''
      autoScheduleEnabled.value = res.data?.autoScheduleEnabled !== false
    }
  } catch (error) {
    console.warn('[SupplementOrder] 加载预计发货日失败:', error)
  }
}

/** 读出这张制作单当前的分装，作为控件的初始值 */
async function loadCurrentSheet() {
  if (!draft.value?.diySheetId) return
  try {
    const res = await fetchMyDiySheets()
    if (res.code !== 0) return
    const found = (res.data || []).find((item) => item.id === draft.value?.diySheetId)
    if (!found) return
    sheet.value = found
    planRows.value = (found.packagePlan || []).map((row) => ({
      packageSpecG: Math.floor(Number(row.packageSpecG)) || 0,
      packageCount: Math.max(1, Math.floor(Number(row.packageCount)) || 1)
    }))
    // 优先用 DIY 配置页带过来的选择；老草稿没有这个信息，就从分装反推
    const draftCustom = draft.value?.packagePlanIsCustom
    if (typeof draftCustom === 'boolean') {
      isCustomPackagePlan.value = draftCustom
      selectedCycleDays.value = draftCustom
        ? null
        : Number(draft.value?.packageCycleDays) || null
    } else {
      const mode = inferPackagePlanMode(planRows.value, {
        dailyIntakeG: found.dailyIntakeG,
        mealsPerDay: resolveMealsPerDay()
      })
      isCustomPackagePlan.value = mode.isCustom
      selectedCycleDays.value = mode.cycleDays
    }
    showPackageEditor.value = false
  } catch (error) {
    console.warn('[SupplementOrder] 读取制作单分装失败:', error)
  }
}

/**
 * 制作单存的是"每天吃多少克"和"每餐多少克"，餐次由这两个除出来。
 * 用它（而不是写死 2）才能把 DIY 页的默认分装原样重建出来。
 */
function resolveMealsPerDay(): number {
  const intake = Number(sheet.value?.dailyIntakeG)
  const perMeal = Number(sheet.value?.perMealG)
  if (!Number.isFinite(intake) || intake <= 0) return 2
  if (!Number.isFinite(perMeal) || perMeal <= 0) return 2
  return Math.max(1, Math.round(intake / perMeal))
}

function onSelectCycle(days: number) {
  if (isCustomPackagePlan.value) return
  selectedCycleDays.value = days
  rebuildPackagePlan()
}

/** 改分装要落库，但输入框会连续触发，所以防抖 */
function schedulePlanApply() {
  if (!canQuickAdjust.value || !draft.value?.diySheetId) return
  if (validationMessage.value) return
  if (planTimer) clearTimeout(planTimer)
  planTimer = setTimeout(() => {
    planTimer = null
    void applyPlan()
  }, 700)
}

async function applyPlan() {
  if (!draft.value?.diySheetId) return
  const rows = normalizedPackagePlan.value
  if (rows.length === 0 || validationMessage.value) return

  replanning.value = true
  try {
    const res = await updateDiySheetPlan(draft.value.diySheetId, rows)
    if (res.code !== 0) {
      uni.showToast({ title: res.message || '分装没更新成功', icon: 'none' })
      return
    }
    // 已冻结的制作单会新建一张 —— 必须换成新 id，否则报价还按旧单算
    if (res.data?.id && res.data.id !== draft.value.diySheetId) {
      draft.value.diySheetId = res.data.id
      saveSupplementPurchaseDraft(draft.value)
    }
    if (res.data) sheet.value = res.data
    await retry()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error && error.message ? error.message : '分装没更新成功',
      icon: 'none'
    })
  } finally {
    replanning.value = false
  }
}

async function loadAddresses() {
  try {
    const res: any = await request({ url: '/addresses', method: 'GET', quiet: true } as any)
    if (res.code === 0 && Array.isArray(res.data)) {
      addresses.value = res.data
      if (!selectedAddressId.value) {
        const preferred = res.data.find((item: Address) => item.isDefault) || res.data[0]
        if (preferred) selectedAddressId.value = preferred.id
      }
    }
  } catch (error) {
    console.warn('[SupplementOrder] 加载地址失败:', error)
  }
}

async function onAddressSelected(payload: { addressId?: string } | string) {
  // address-edit 发的是一段字符串 id，address-list 发的是对象 —— 两种都要认
  const addressId = typeof payload === 'string' ? payload : payload?.addressId
  if (!addressId) return
  selectedAddressId.value = addressId
  if (!addresses.value.some((item) => item.id === addressId)) {
    await loadAddresses()
  }
}

function chooseAddress() {
  uni.navigateTo({ url: '/pages/address-list/index?mode=select&from=supplement-order' })
}

function goToDiySheetList() {
  uni.navigateTo({ url: '/pages/diy-sheet-list/index' })
}

function selectPortion(next: number) {
  void setPortion(next)
}

async function onRetryQuote() {
  await retry()
}

function lineAmount(line: QuoteLineState): string {
  return `${formatAmount(line.packedAmount)}${line.unit || ''}`
}

function money(value?: number | null): string {
  return Number(value ?? 0).toFixed(2)
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatRegion(region?: { province?: string; city?: string; district?: string }): string {
  if (!region) return ''
  return [region.province, region.city, region.district].filter(Boolean).join(' ')
}

/** 打开确认弹层：先重新取一次价，确保顾客看到的就是最终金额 */
async function openConfirmSheet() {
  if (submitting.value || !quoteCanSubmit.value) return
  if (!selectedAddress.value) {
    uni.showToast({ title: '请先选择收货地址', icon: 'none' })
    return
  }

  const before = Number(summary.value?.total ?? 0)
  confirmRefreshing.value = true
  await retry()
  confirmRefreshing.value = false

  if (status.value !== 'ready' || !summary.value) return

  priceChanged.value = Math.abs(Number(summary.value.total ?? 0) - before) > 0.004
  submitError.value = ''
  showConfirmSheet.value = true
}

function closeConfirmSheet() {
  if (submitting.value) return
  showConfirmSheet.value = false
}

async function submitOrder() {
  if (submitting.value || !draft.value || !summary.value || !selectedAddress.value) return
  if (belowMinOrder.value) return

  submitting.value = true
  submitError.value = ''

  // ---- 只负责建单 ----
  let order: SupplementOrder | null = null
  try {
    await requestSupplementSubscriptions()
    const res = await createSupplementOrder({
      addressId: selectedAddress.value.id,
      lines: selectedLines.value.map((line) =>
        line.recipeItemId
          ? { ingredientId: line.ingredientId, recipeItemId: line.recipeItemId }
          : { ingredientId: line.ingredientId, amount: line.amount }
      ),
      recipeId: draft.value.recipeId,
      recipeName: draft.value.recipeName,
      dogId: draft.value.dogId,
      dogName: draft.value.dogName,
      diySheetId: draft.value.diySheetId,
      portionMultiplier: portionMultiplier.value,
      reorderFromOrderNo: draft.value.reorderFromOrderNo,
      expectedTotal: toCents(summary.value.total),
      clientRequestId: submitRequestId.value || createRequestId()
    })

    order = res.data as SupplementOrder
    clearSupplementPurchaseDraft()
  } catch (error) {
    submitError.value = readErrorMessage(error)
  } finally {
    submitting.value = false
  }

  if (!order) {
    // 没建成单：金额可能已经过期（例如后台刚调过价），顺手刷新一次
    await retry()
    return
  }

  // ---- 订单已经成立，支付失败也不能说"提交失败" ----
  showConfirmSheet.value = false
  await settlePayment(order)
}

/** 提交后的支付处理：能支付就支付，不能支付就降级为待人工确认收款 */
async function settlePayment(order: SupplementOrder) {
  const outcome = await runSupplementPayment(order.id)

  if (outcome === 'PAID') {
    let latest = order
    try {
      const detail = await fetchSupplementOrderDetail(order.id)
      if (detail.code === 0) latest = detail.data
    } catch {
      // 拿不到最新排期就用下单时对象兜底
    }
    showPaidModal(latest)
    return
  }

  if (outcome === 'CANCELLED') {
    showCancelledModal(order)
    return
  }
  showManualConfirmModal(order)
}

function goSupplementOrderDetail(order: SupplementOrder) {
  uni.redirectTo({ url: `/pages/supplement-order-detail/index?orderId=${encodeURIComponent(order.id)}` })
}

function showPaidModal(order: SupplementOrder) {
  uni.showModal({
    title: '支付成功',
    content: `订单号 ${order.orderNo}\n合计 ¥${order.amountTotal.toFixed(2)}\n预计发货 ${order.packingDate || '待管理员排期'}\n\n我们会尽快分装发货。`,
    showCancel: false,
    confirmText: '查看订单',
    success: () => goSupplementOrderDetail(order)
  })
}

/** 支付被顾客取消：订单还在，可以稍后继续付；弹窗必须能关掉 */
function showCancelledModal(order: SupplementOrder) {
  uni.showModal({
    title: '支付未完成',
    content: `订单号 ${order.orderNo}\n合计 ¥${order.amountTotal.toFixed(2)}\n\n订单已为你保留，可以稍后在订单详情里继续支付。`,
    showCancel: true,
    cancelText: '关闭',
    confirmText: '查看订单',
    success: (res) => {
      if (res.confirm) goSupplementOrderDetail(order)
    }
  })
}

/** 支付通道不可用：订单成立，等待人工确认到账 */
function showManualConfirmModal(order: SupplementOrder) {
  uni.showModal({
    title: '订单已提交',
    content: `订单号 ${order.orderNo}\n合计 ¥${order.amountTotal.toFixed(2)}\n\n我们会尽快与你确认收款。`,
    showCancel: true,
    cancelText: '关闭',
    confirmText: '查看订单',
    success: (res) => {
      if (res.confirm) goSupplementOrderDetail(order)
    }
  })
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '提交没有成功，请稍后重试'
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding: 24rpx 24rpx 0;
  box-sizing: border-box;
}

/* ---- 空态 ---- */
.empty-state {
  padding: 160rpx 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  font-size: 32rpx;
  color: #303133;
  font-weight: 600;
}

.empty-desc {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #909399;
  text-align: center;
  line-height: 1.6;
}

.empty-action {
  margin-top: 40rpx;
  padding: 0 56rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
  background-color: #1e3a2f;
  border-radius: 12rpx;
}

.empty-action::after {
  border: none;
}

.empty-service {
  margin-top: 24rpx;
}

.unavailable-list {
  margin-top: 24rpx;
  width: 100%;
}

.unavailable-line {
  display: block;
  font-size: 24rpx;
  color: #b07d2b;
  line-height: 1.9;
}

.empty-hint {
  text-align: center;
}

.empty-hint-text {
  font-size: 26rpx;
  color: #909399;
}

/* ---- 通用卡片 ---- */
.section {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.title-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}

.title-action {
  font-size: 24rpx;
  font-weight: 600;
  color: #1e3a2f;
  padding: 12rpx 16rpx;
  margin: -12rpx -16rpx;
}

.section-subtip {
  display: block;
  margin-bottom: 14rpx;
  font-size: 22rpx;
  color: #9aa0a6;
  line-height: 1.5;
}

/* ---- 来源卡 ---- */
.source-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.source-main {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.source-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #303133;
}

.source-sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #909399;
}

.source-action {
  flex-shrink: 0;
  margin-left: 16rpx;
  padding: 16rpx 24rpx;
  font-size: 24rpx;
  color: #a97c33;
  border: 2rpx solid #e8dcc0;
  border-radius: 999rpx;
}

/* ---- 预分装说明 ---- */
.prepack-card {
  padding: 0;
  overflow: hidden;
}

.prepack-image {
  display: block;
  width: 100%;
}





/* ---- 快速改分装 ---- */
.plan-section .package-plan {
  margin-top: 8rpx;
}

.plan-pending {
  font-size: 22rpx;
  color: #a97c33;
}

.plan-unavailable {
  display: block;
  font-size: 24rpx;
  color: #909399;
  line-height: 1.6;
}

/* ---- 补剂清单 ---- */
.line-row {
  display: flex;
  align-items: flex-start;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #f2f3f5;
}

.line-row:last-child {
  border-bottom: none;
}

.line-row-disabled {
  opacity: 0.55;
}

.line-check {
  width: 60rpx;
  padding-top: 4rpx;
}

.checkbox {
  width: 36rpx;
  height: 36rpx;
  border-radius: 6rpx;
  border: 2rpx solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-checked {
  background-color: #1e3a2f;
  border-color: #1e3a2f;
}

.checkbox-disabled {
  background-color: #f2f3f5;
  border-color: #e4e7ed;
}

.checkbox-tick {
  color: #ffffff;
  font-size: 24rpx;
  line-height: 1;
}

.line-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.line-name {
  font-size: 28rpx;
  color: #303133;
  font-weight: 500;
}

.line-extra {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #909399;
}

.line-warn {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #e6a23c;
}

.line-packed {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 26rpx;
  color: #303133;
  font-weight: 600;
  padding-top: 2rpx;
}

.line-packed-disabled {
  color: #c0c4cc;
}




/* ---- 袋数 ---- */
.portion-block {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #f2f3f5;
}

.portion-title {
  display: block;
  font-size: 26rpx;
  color: #26261f;
  font-weight: 600;
}

.portion-options {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
}

.portion-option {
  flex: 1;
  padding: 18rpx 6rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  border: 2rpx solid #e5e0d0;
  background-color: #fbfcf7;
  position: relative;
  overflow: hidden;
  min-height: 96rpx;
}

.portion-option-num {
  font-size: 26rpx;
  color: #26261f;
}

.portion-option-price {
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}

.portion-option-active {
  border-color: #1e3a2f;
  background-color: #1e3a2f;
}

.portion-option-active .portion-option-num,
.portion-option-active .portion-option-price {
  color: #fbfcf7;
  font-weight: 600;
}

/* 包邮角标：贴在卡片右上角，不占正文位置 */
.portion-badge {
  position: absolute;
  top: 0;
  right: 0;
  padding: 0 8rpx;
  font-size: 17rpx;
  line-height: 1.5;
  color: #fbfcf7;
  background-color: #b08d4f;
  border-top-right-radius: 12rpx;
  border-bottom-left-radius: 8rpx;
}

/* ---- 地址 ---- */
.address-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
}

.address-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.address-name {
  font-size: 28rpx;
  color: #303133;
}

.address-detail {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #909399;
}

.address-placeholder {
  font-size: 28rpx;
  color: #909399;
}

.address-action {
  font-size: 26rpx;
  color: #a97c33;
  padding: 16rpx 8rpx 16rpx 24rpx;
}

/* ---- 套数 ---- */


.portion-options {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}

.portion-option {
  flex: 1;
  padding: 18rpx 6rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  border: 2rpx solid #e5e0d0;
  background-color: #fbfcf7;
  position: relative;
  overflow: hidden;
  min-height: 108rpx;
}

.portion-option-num {
  font-size: 26rpx;
  color: #26261f;
}

.portion-option-price {
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}



.portion-option-active {
  border-color: #1e3a2f;
  background-color: #1e3a2f;
}

.portion-option-active .portion-option-num,
.portion-option-active .portion-option-price {
  color: #fbfcf7;
  font-weight: 600;
}

/* ---- 费用 ---- */
.fee-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 14rpx 0;
}

.fee-label {
  font-size: 26rpx;
  color: #968f6d;
}

.fee-value {
  font-size: 26rpx;
  color: #26261f;
}

.fee-value-free {
  color: #2b5040;
}

.fee-row-total {
  margin-top: 12rpx;
  padding-top: 18rpx;
  border-top: 2rpx solid #e5e0d0;
}

.fee-row-total .fee-label {
  color: #26261f;
  font-weight: 600;
}

.fee-value-total {
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.fee-note {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #9aa0a6;
  line-height: 1.6;
}

.fee-note-warn {
  color: #b07d2b;
}

.delivery-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid #eee;
  font-size: 25rpx;
}

.delivery-value {
  color: #1e3a2f;
  font-weight: 600;
}

/* ---- 行内错误 ---- */
.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fdf6ec;
  border: 1rpx solid #f3dbb5;
}

.error-banner-text {
  flex: 1;
  font-size: 24rpx;
  color: #b07d2b;
  line-height: 1.6;
}

.error-banner-retry {
  flex-shrink: 0;
  margin-left: 16rpx;
  padding: 16rpx 24rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #1e3a2f;
}

/* ---- 底部 ---- */
.footer-space {
  height: 200rpx;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ffffff;
  border-top: 1rpx solid #f2f3f5;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 24rpx calc(14rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(14rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.customer-service-bottom-action {
  flex: 0 0 auto;
}

.footer-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20rpx;
}

.footer-total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.footer-amount {
  font-size: 36rpx;
  color: #e6641e;
  font-weight: 700;
  line-height: 1.1;
}

.footer-amount-pending {
  font-size: 26rpx;
  color: #9aa0a6;
  font-weight: 500;
}

.footer-btn {
  width: 240rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background-color: #1e3a2f;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  flex: none;
}

.footer-btn::after {
  border: none;
}

.footer-btn-disabled {
  background-color: #c0c4cc;
}

.footer-btn-text {
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 500;
}

/* ---- 弹层 ---- */
.sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 100;
}

.sheet {
  width: 100%;
  background-color: #ffffff;
  border-top-left-radius: 24rpx;
  border-top-right-radius: 24rpx;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.sheet-tall {
  max-height: 84vh;
  overflow-y: auto;
}

.sheet-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #26261f;
  text-align: center;
}

.sheet-subtip {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #9aa0a6;
  text-align: center;
  line-height: 1.6;
}




.sheet-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 32rpx;
}

.sheet-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: 600;
}

.sheet-btn-ghost {
  background-color: #f5f3ea;
  color: #6b6b5c;
}

.sheet-btn-primary {
  background-color: #1e3a2f;
  color: #ffffff;
}

.sheet-btn-disabled {
  background-color: #c0c4cc;
}

.confirm-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 20rpx;
}

.confirm-label {
  font-size: 26rpx;
  color: #968f6d;
}

.confirm-value {
  font-size: 26rpx;
  color: #26261f;
  text-align: right;
  max-width: 70%;
}

.confirm-address-detail {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #909399;
  text-align: right;
}

.confirm-row-total {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 2rpx solid #e5e0d0;
}

.confirm-total {
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.confirm-warn {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #b07d2b;
  line-height: 1.6;
}

.confirm-note {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #9aa0a6;
  line-height: 1.6;
}
</style>

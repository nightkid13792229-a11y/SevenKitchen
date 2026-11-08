<template>
  <view class="page">
    <view class="hero">
      <text class="title">确认订单</text>
      <text class="sub">{{ recipeName }} · 线下收款</text>
    </view>

    <view v-if="portionLoading" class="state">正在按体重算饭量…</view>
    <view v-else-if="portionError" class="state error">{{ portionError }}</view>

    <template v-else>
      <view class="section">
        <view class="section-head">
          <text class="section-title">饭量与分装</text>
          <text class="section-hint" v-if="portion">
            按 {{ portion.dailyIntakeG }}g/天、每天 {{ portion.mealsPerDay }} 餐算
          </text>
        </view>

        <view v-if="daysRaised" class="notice">
          这只狗按 7 天算不够 {{ minOrderG }}g，已自动改成 {{ selectedCycleDays }} 天。
        </view>

        <QuickCyclePackagePlan
          ref="packagePlanSection"
          :cycle-days="selectedCycleDays"
          :package-plan="packagePlan"
          :is-custom="isCustomPackagePlan"
          :editor-open="showPackageEditor"
          :summary-text="inlineSummaryText"
          :warnings="packagePlanWarnings"
          @select-cycle="selectCycle"
          @toggle-custom="togglePackageEditor"
          @add-row="addPackagePlanRow"
          @update-row="updatePackagePlanRow"
          @remove-row="removePackagePlanRow"
        />

        <view v-if="validationMessage" class="validation">{{ validationMessage }}</view>

        <view class="field-group">
          <text class="field-label">目标制作日期（可留空）</text>
          <picker mode="date" :value="targetProductionDate" :start="today" @change="onDateChange">
            <view class="picker-box">{{ targetProductionDate || '不指定' }}</view>
          </picker>
        </view>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">收货地址</text>
          <text class="section-link" @tap="goAddAddress">＋ 新增地址</text>
        </view>
        <view v-if="addresses.length === 0" class="notice warn">
          这位顾客还没有收货地址，鲜食必须填地址才能下单。
        </view>
        <view
          v-for="address in addresses"
          :key="address.id"
          class="address-row"
          :class="{ on: selectedAddressId === address.id }"
          @tap="selectAddress(address.id)"
        >
          <view class="address-main">
            <text class="address-name">
              {{ address.recipientName }} {{ address.phone }}
              <text v-if="address.isDefault" class="default-tag">默认</text>
            </text>
            <text class="address-detail">{{ address.regionText }} {{ address.detail }}</text>
          </view>
          <text v-if="selectedAddressId === address.id" class="check">✓</text>
        </view>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">金额</text>
          <text class="section-hint" v-if="pricingLoading">正在算价…</text>
        </view>
        <view class="amount-row">
          <text class="amount-label">系统报价</text>
          <text class="amount-value">{{ pricing ? `¥${money(pricing.amountTotal)}` : '—' }}</text>
        </view>
        <view class="field-group">
          <text class="field-label">实收金额</text>
          <input class="field-input" type="digit" v-model="actualAmount" placeholder="实际收到的钱" />
        </view>
        <view v-if="adjustNeeded" class="field-group">
          <text class="field-label">差额原因（必填）</text>
          <input class="field-input" v-model="adjustReason" placeholder="例如：老客户抹零 / 补上次的差价" />
        </view>
        <view class="field-group">
          <text class="field-label">内部备注（可留空）</text>
          <input class="field-input" v-model="remark" placeholder="例如：客户微信确认，线下已收款" />
        </view>
      </view>

      <view class="notice info">
        无账号顾客没有小程序账号，这单不会给顾客发微信通知；物流和发货时间需要人工告知。
      </view>

      <button class="primary-btn" :disabled="submitting || !canSubmit" @tap="submit">
        {{ submitting ? '创建中…' : `创建订单（¥${pricing ? money(pricing.amountTotal) : '—'}）` }}
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import QuickCyclePackagePlan from '../../components/package-plan/QuickCyclePackagePlan.vue'
import { usePackagePlan } from '../../composables/usePackagePlan'
import {
  listStaffCustomerAddresses,
  type StaffCustomerAddressOption,
} from '../../api/orders'
import {
  createAssistedOrder,
  previewAssistedPricing,
  previewPortion,
  type AssistedPricing,
  type PortionPreview,
} from '../../api/staffAssistedOrder'
import {
  MIN_ASSISTED_ORDER_G,
  needsAmountAdjustReason,
  resolveDaysForMinOrder,
} from '../../utils/assistedOrder'

const customerId = ref('')
const dogId = ref('')
const recipeId = ref('')
const recipeName = ref('')
const ownershipKind = ref('')

const portion = ref<PortionPreview | null>(null)
const portionLoading = ref(false)
const portionError = ref('')
const daysRaised = ref(false)
const minOrderG = MIN_ASSISTED_ORDER_G

const addresses = ref<StaffCustomerAddressOption[]>([])
const selectedAddressId = ref('')

const pricing = ref<AssistedPricing | null>(null)
const pricingLoading = ref(false)
const actualAmount = ref('')
const adjustReason = ref('')
const remark = ref('')
const targetProductionDate = ref('')
const submitting = ref(false)
const packagePlanSection = ref<{ commitAll: () => void } | null>(null)

let pricingTimer: any = null

const {
  selectedCycleDays,
  packagePlan,
  showPackageEditor,
  isCustomPackagePlan,
  totalGrams,
  totalPackages,
  normalizedPackagePlan,
  inlineSummaryText,
  validationMessage,
  rebuildPackagePlan,
  togglePackageEditor,
  addPackagePlanRow,
  updatePackagePlanRow,
  removePackagePlanRow,
  getPrimaryPackageSpecG,
} = usePackagePlan({
  dailyIntakeG: () => portion.value?.dailyIntakeG ?? 0,
  mealsPerDay: () => portion.value?.mealsPerDay ?? 2,
  dogId: () => dogId.value,
  perMealG: () => portion.value?.perMealIntakeG ?? 0,
  onPlanChanged: () => schedulePricing(),
})

const packagePlanWarnings = computed(() =>
  validationMessage.value ? [validationMessage.value] : [],
)

const today = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})

const adjustNeeded = computed(() => {
  if (!pricing.value) return false
  const actual = Number(actualAmount.value)
  if (!Number.isFinite(actual) || actualAmount.value === '') return false
  return needsAmountAdjustReason(pricing.value.amountTotal, actual)
})

const canSubmit = computed(
  () => Boolean(pricing.value) && Boolean(selectedAddressId.value) && !validationMessage.value,
)

onLoad((options: any) => {
  customerId.value = String(options?.customerId || '')
  dogId.value = String(options?.dogId || '')
  recipeId.value = String(options?.recipeId || '')
  recipeName.value = decodeURIComponent(String(options?.recipeName || '食谱'))
  ownershipKind.value = String(options?.ownership || '')
  if (!customerId.value || !dogId.value || !recipeId.value) {
    portionError.value = '缺少顾客、狗狗或食谱信息，请返回重选。'
    return
  }
  void loadPortion()
})

onShow(() => {
  if (customerId.value) void loadAddresses()
})

function money(value: unknown) {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num.toFixed(2) : '0.00'
}

async function loadPortion() {
  portionLoading.value = true
  portionError.value = ''
  try {
    const response = await previewPortion(dogId.value, recipeId.value, 7)
    portion.value = (response.data as any) || null
    if (!portion.value) {
      portionError.value = '算不出这只狗的饭量，请检查档案里的体重。'
      return
    }
    const resolved = resolveDaysForMinOrder(portion.value.dailyIntakeG, 7)
    daysRaised.value = resolved.raised
    selectedCycleDays.value = resolved.days
    rebuildPackagePlan()
    void loadAddresses()
    schedulePricing(0)
  } catch (error: any) {
    portionError.value = error?.message || '饭量计算失败'
  } finally {
    portionLoading.value = false
  }
}

async function loadAddresses() {
  try {
    const response = await listStaffCustomerAddresses(customerId.value)
    addresses.value = Array.isArray(response.data) ? response.data : []
    if (!selectedAddressId.value) {
      const preferred =
        addresses.value.find((item) => item.isDefault) || addresses.value[0]
      selectedAddressId.value = preferred?.id || ''
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '地址加载失败', icon: 'none' })
  }
}

function selectAddress(addressId: string) {
  selectedAddressId.value = addressId
}

function onDateChange(event: any) {
  targetProductionDate.value = String(event?.detail?.value || '')
}

function selectCycle(days: number) {
  if (isCustomPackagePlan.value) return
  selectedCycleDays.value = days
  rebuildPackagePlan()
}

function buildItems() {
  const quantityG = Math.round(Number(totalGrams.value) || 0)
  const packageCount = Math.max(1, Number(totalPackages.value) || 1)
  const packageSpecG = Number(getPrimaryPackageSpecG()) || 0
  return [
    {
      recipeId: recipeId.value,
      quantityG,
      packageCount,
      packageSpecG,
      packagePlan: normalizedPackagePlan.value,
      cycleDays: selectedCycleDays.value,
      dailyIntakeG: portion.value?.dailyIntakeG,
    },
  ]
}

function schedulePricing(delay = 300) {
  if (pricingTimer) clearTimeout(pricingTimer)
  pricingTimer = setTimeout(() => {
    void runPricing()
  }, delay)
}

async function runPricing() {
  if (!customerId.value || !dogId.value || !portion.value) return
  if (validationMessage.value) return
  pricingLoading.value = true
  try {
    const response = await previewAssistedPricing({
      customerId: customerId.value,
      dogId: dogId.value,
      addressId: selectedAddressId.value || undefined,
      items: buildItems(),
    })
    pricing.value = (response.data as any) || null
    if (pricing.value && actualAmount.value === '') {
      actualAmount.value = money(pricing.value.amountTotal)
    }
  } catch (error: any) {
    pricing.value = null
    uni.showToast({ title: error?.message || '算价失败', icon: 'none' })
  } finally {
    pricingLoading.value = false
  }
}

function goAddAddress() {
  uni.navigateTo({
    url: `/pages/staff-assisted-order/address?customerId=${encodeURIComponent(customerId.value)}`,
  })
}

async function submit() {
  if (submitting.value) return
  packagePlanSection.value?.commitAll?.()

  if (!selectedAddressId.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' })
    return
  }
  if (validationMessage.value) {
    uni.showToast({ title: validationMessage.value, icon: 'none' })
    return
  }
  const actual = Number(actualAmount.value)
  if (!Number.isFinite(actual) || actual < 0) {
    uni.showToast({ title: '请填正确的实收金额', icon: 'none' })
    return
  }
  if (adjustNeeded.value && !adjustReason.value.trim()) {
    uni.showToast({ title: '实收与报价不一致，请填差额原因', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const response = await createAssistedOrder({
      customerId: customerId.value,
      dogId: dogId.value,
      addressId: selectedAddressId.value,
      targetProductionDate: targetProductionDate.value || null,
      actualAmount: actual,
      amountAdjustReason: adjustReason.value.trim() || undefined,
      remark: remark.value.trim() || undefined,
      recipeSource: ownershipKind.value || undefined,
      items: buildItems(),
    })
    const orderId = (response.data as any)?.id
    uni.showToast({ title: '订单已创建', icon: 'success' })
    if (orderId) {
      setTimeout(() => {
        uni.redirectTo({ url: `/pages/staff-orders/detail?id=${encodeURIComponent(orderId)}` })
      }, 600)
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '创建失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #eef2e4; padding: 24rpx 24rpx 220rpx; box-sizing: border-box; color: #26261f; }
.hero { padding: 8rpx 4rpx 20rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; color: #1e3a2f; }
.sub { display: block; margin-top: 8rpx; font-size: 23rpx; color: #6b6653; }
.state { padding: 80rpx 24rpx; text-align: center; color: #6b6653; font-size: 26rpx; }
.state.error { color: #b4553f; }

.section { background: #fff; border: 1rpx solid #e5e8d4; border-radius: 12rpx; padding: 24rpx; margin-bottom: 18rpx; }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; margin-bottom: 14rpx; }
.section-title { font-size: 30rpx; font-weight: 800; color: #1e3a2f; }
.section-hint { font-size: 22rpx; color: #6b6653; }
.section-link { font-size: 24rpx; color: #2b5040; font-weight: 700; }

.notice { padding: 14rpx 16rpx; border-radius: 8rpx; font-size: 22rpx; line-height: 1.6; margin-bottom: 14rpx; background: #fff8e8; border: 1rpx solid #f0e0bb; color: #8a6a2f; }
.notice.warn { background: #fdf2ef; border-color: #f2d3c9; color: #b4553f; }
.notice.info { margin-top: 6rpx; background: #eef3fa; border-color: #d6e2f2; color: #2f5f9e; }
.validation { margin-top: 10rpx; font-size: 22rpx; color: #b4553f; }

.field-group { margin-top: 16rpx; }
.field-label { display: block; margin-bottom: 8rpx; font-size: 24rpx; font-weight: 700; }
.field-input, .picker-box { width: 100%; height: 84rpx; padding: 0 20rpx; border: 1rpx solid #e5e8d4; border-radius: 8rpx; background: #fbfcf7; box-sizing: border-box; font-size: 28rpx; }
.picker-box { line-height: 84rpx; }

.address-row { display: flex; align-items: center; gap: 14rpx; padding: 18rpx; margin-top: 12rpx; border: 1rpx solid #eef1e2; border-radius: 10rpx; background: #fbfcf7; }
.address-row.on { border-color: #1e3a2f; background: #f2f7f3; }
.address-main { flex: 1; min-width: 0; }
.address-name { display: block; font-size: 27rpx; font-weight: 700; }
.default-tag { margin-left: 10rpx; padding: 2rpx 10rpx; border-radius: 6rpx; background: #eef2e4; color: #1e3a2f; font-size: 20rpx; }
.address-detail { display: block; margin-top: 6rpx; font-size: 22rpx; color: #6b6653; line-height: 1.5; }
.check { flex: none; color: #1e3a2f; font-size: 28rpx; font-weight: 800; }

.amount-row { display: flex; align-items: baseline; justify-content: space-between; padding: 12rpx 0; }
.amount-label { font-size: 26rpx; color: #6b6653; }
.amount-value { font-size: 40rpx; font-weight: 800; color: #1e3a2f; }

.primary-btn { position: fixed; left: 0; right: 0; bottom: 0; margin: 0; height: 100rpx; line-height: 100rpx; border-radius: 0; background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%); color: #f3eddd; font-size: 30rpx; font-weight: 800; }
</style>

<template>
  <view class="assisted-order-page">
    <view class="top-panel">
      <text class="eyebrow">线下收款</text>
      <text class="title">代客下单</text>
      <text class="subtitle">{{ customerName }} · {{ dogName }}</text>
    </view>

    <view class="section">
      <text class="section-title">选择成品食谱</text>
      <view v-if="selectorLoading" class="selector-state">加载中...</view>
      <view v-else-if="recipeOptions.length === 0" class="selector-state">暂无可下单成品食谱</view>
      <picker
        v-else
        :range="recipePickerLabels"
        :value="selectedRecipeIndex"
        @change="onRecipeChange"
      >
        <view class="selector-box">
          <view class="selector-main">
            <text class="selector-title">{{ selectedRecipe?.name || '选择成品食谱' }}</text>
            <text class="selector-meta">
              {{ selectedRecipe?.sourceLabel || '成品食谱' }}
              <template v-if="selectedRecipe?.version"> · v{{ selectedRecipe.version }}</template>
            </text>
          </view>
          <text class="selector-arrow">›</text>
        </view>
      </picker>
    </view>

    <view class="section">
      <text class="section-title">选择收货地址</text>
      <view v-if="selectorLoading" class="selector-state">加载中...</view>
      <view v-else-if="addressOptions.length === 0" class="selector-state">该客户暂无地址</view>
      <picker
        v-else
        :range="addressPickerLabels"
        :value="selectedAddressIndex"
        @change="onAddressChange"
      >
        <view class="selector-box">
          <view class="selector-main">
            <view class="address-line">
              <text class="selector-title">{{ selectedAddress?.recipientName || '选择收货地址' }}</text>
              <text v-if="selectedAddress?.isDefault" class="default-tag">默认</text>
            </view>
            <text class="selector-meta">{{ formatAddress(selectedAddress) }}</text>
          </view>
          <text class="selector-arrow">›</text>
        </view>
      </picker>
    </view>

    <view class="section">
      <text class="section-title">成品订单信息</text>
      <view class="field-row">
        <view class="field-group half">
          <text class="field-label">订购天数</text>
          <input class="field-input" type="number" v-model="form.cycleDays" @blur="syncPackageCount" />
        </view>
        <view class="field-group half">
          <text class="field-label">总克数</text>
          <input class="field-input" type="digit" v-model="form.quantityG" @blur="syncPackageCount" />
        </view>
      </view>
      <view class="field-row">
        <view class="field-group half">
          <text class="field-label">每包克数</text>
          <input class="field-input" type="number" v-model="form.packageSpecG" @blur="syncPackageCount" />
        </view>
        <view class="field-group half">
          <text class="field-label">包数</text>
          <input class="field-input" type="number" v-model="form.packageCount" />
        </view>
      </view>
      <view class="field-group">
        <text class="field-label">原料方案</text>
        <picker :range="sourcePlanLabels" :value="sourcePlanIndex" @change="onSourcePlanChange">
          <view class="picker-box">{{ sourcePlanLabels[sourcePlanIndex] }}</view>
        </picker>
      </view>
      <view class="field-group">
        <text class="field-label">目标制作日期</text>
        <picker mode="date" :value="form.targetProductionDate" @change="onDateChange">
          <view class="picker-box">{{ form.targetProductionDate || '不指定' }}</view>
        </picker>
      </view>
    </view>

    <view class="section">
      <text class="section-title">线下收款</text>
      <view class="field-group">
        <text class="field-label">实际收款金额</text>
        <input class="field-input" type="digit" v-model="form.actualAmount" placeholder="填写实际收款金额" />
      </view>
      <view class="field-group">
        <text class="field-label">内部备注</text>
        <textarea class="field-textarea" v-model="form.remark" placeholder="例如：客户微信确认，线下已收款" />
      </view>
    </view>

    <button class="submit-btn" :disabled="submitting || selectorLoading" @tap="submitAssistedOrder">
      {{ submitting ? '提交中...' : '创建线下收款订单' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  createStaffAssistedOrder,
  listStaffCustomerAddresses,
  listStaffDogFinishedFoodRecipeOptions,
  type StaffCustomerAddressOption,
  type StaffFinishedFoodRecipeOption,
} from '../../api/orders'

const customerId = ref('')
const dogId = ref('')
const dogName = ref('狗狗')
const customerName = ref('客户')
const submitting = ref(false)
const selectorLoading = ref(false)

const addressOptions = ref<StaffCustomerAddressOption[]>([])
const recipeOptions = ref<StaffFinishedFoodRecipeOption[]>([])
const selectedAddressId = ref('')
const selectedRecipeId = ref('')

const sourcePlanOptions = ['MARKET_PREMIUM', 'ORGANIC', 'WHOLESALE']
const sourcePlanLabels = ['菜场优选', '有机优选', '批发采购']
const sourcePlanIndex = ref(0)

const form = reactive({
  cycleDays: '7',
  quantityG: '1400',
  packageSpecG: '100',
  packageCount: '14',
  targetProductionDate: '',
  actualAmount: '',
  remark: '',
})

const selectedRecipe = computed(() =>
  recipeOptions.value.find((item) => item.id === selectedRecipeId.value),
)

const selectedAddress = computed(() =>
  addressOptions.value.find((item) => item.id === selectedAddressId.value),
)

const selectedRecipeIndex = computed(() =>
  Math.max(0, recipeOptions.value.findIndex((item) => item.id === selectedRecipeId.value)),
)

const selectedAddressIndex = computed(() =>
  Math.max(0, addressOptions.value.findIndex((item) => item.id === selectedAddressId.value)),
)

const recipePickerLabels = computed(() =>
  recipeOptions.value.map((item) => `${item.name} · ${item.sourceLabel || '成品食谱'} · v${item.version}`),
)

const addressPickerLabels = computed(() =>
  addressOptions.value.map((item) => {
    const defaultText = item.isDefault ? '默认 · ' : ''
    return `${defaultText}${item.recipientName} ${item.phone} ${formatAddress(item)}`
  }),
)

onLoad((options: any) => {
  customerId.value = String(options?.customerId || '')
  dogId.value = String(options?.dogId || '')
  dogName.value = decodeURIComponent(String(options?.dogName || '狗狗'))
  customerName.value = decodeURIComponent(String(options?.customerName || '客户'))
  void loadSelectorOptions()
})

async function loadSelectorOptions() {
  if (!customerId.value || !dogId.value) return
  selectorLoading.value = true
  try {
    const [addressResponse, recipeResponse] = await Promise.all([
      listStaffCustomerAddresses(customerId.value),
      listStaffDogFinishedFoodRecipeOptions(dogId.value, customerId.value),
    ])
    addressOptions.value = addressResponse.data || []
    recipeOptions.value = sortRecipeOptions(recipeResponse.data || [])

    const defaultAddress = addressOptions.value.find((item) => item.isDefault) || addressOptions.value[0]
    selectedAddressId.value = defaultAddress?.id || ''
    selectedRecipeId.value = recipeOptions.value[0]?.id || ''
  } catch (error: any) {
    uni.showToast({ title: error?.message || '选项加载失败', icon: 'none' })
  } finally {
    selectorLoading.value = false
  }
}

function sortRecipeOptions(options: StaffFinishedFoodRecipeOption[]) {
  return [...options].sort((left, right) => {
    const leftPrivate = left.status === 'PRIVATE_CUSTOM' ? 0 : 1
    const rightPrivate = right.status === 'PRIVATE_CUSTOM' ? 0 : 1
    if (leftPrivate !== rightPrivate) return leftPrivate - rightPrivate
    return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN')
  })
}

function onRecipeChange(event: any) {
  const index = Number(event?.detail?.value || 0)
  selectedRecipeId.value = recipeOptions.value[index]?.id || ''
}

function onAddressChange(event: any) {
  const index = Number(event?.detail?.value || 0)
  selectedAddressId.value = addressOptions.value[index]?.id || ''
}

function onSourcePlanChange(event: any) {
  sourcePlanIndex.value = Number(event?.detail?.value || 0)
}

function onDateChange(event: any) {
  form.targetProductionDate = String(event?.detail?.value || '')
}

function formatAddress(address?: StaffCustomerAddressOption) {
  if (!address) return ''
  return [address.regionText, address.detail].filter(Boolean).join(' ')
}

function syncPackageCount() {
  const quantityG = Number(form.quantityG)
  const packageSpecG = Number(form.packageSpecG)
  if (!Number.isFinite(quantityG) || quantityG <= 0 || !Number.isFinite(packageSpecG) || packageSpecG <= 0) return
  form.packageCount = String(Math.max(1, Math.ceil(quantityG / packageSpecG)))
}

async function submitAssistedOrder() {
  if (submitting.value) return
  if (!customerId.value || !dogId.value) {
    uni.showToast({ title: '缺少客户或狗狗信息', icon: 'none' })
    return
  }
  if (!selectedRecipeId.value || !selectedAddressId.value) {
    uni.showToast({ title: '请选择成品食谱和收货地址', icon: 'none' })
    return
  }

  const quantityG = Number(form.quantityG)
  const packageSpecG = Number(form.packageSpecG)
  const packageCount = Number(form.packageCount)
  const cycleDays = Number(form.cycleDays)
  const actualAmount = form.actualAmount ? Number(form.actualAmount) : undefined

  if (!Number.isFinite(quantityG) || quantityG <= 0 || !Number.isFinite(packageSpecG) || packageSpecG <= 0 || !Number.isFinite(packageCount) || packageCount <= 0) {
    uni.showToast({ title: '请填写正确克数和包数', icon: 'none' })
    return
  }
  if (actualAmount !== undefined && (!Number.isFinite(actualAmount) || actualAmount < 0)) {
    uni.showToast({ title: '请填写正确收款金额', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const response = await createStaffAssistedOrder({
      customerId: customerId.value,
      dogId: dogId.value,
      addressId: selectedAddressId.value,
      type: 'FRESH_FOOD',
      ingredientSourcePlan: sourcePlanOptions[sourcePlanIndex.value],
      targetProductionDate: form.targetProductionDate || null,
      actualAmount,
      remark: form.remark,
      items: [
        {
          recipeId: selectedRecipeId.value,
          quantityG,
          packageSpecG,
          packageCount,
          cycleDays: Number.isFinite(cycleDays) && cycleDays > 0 ? cycleDays : packageCount,
          packagePlan: [{ packageSpecG, packageCount }],
          customRequirements: form.remark,
        },
      ],
    })
    const orderId = (response.data as any)?.id
    uni.showToast({ title: '订单已创建', icon: 'success' })
    if (orderId) {
      uni.redirectTo({ url: `/pages/staff-orders/detail?id=${orderId}` })
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '创建失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.assisted-order-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f4f6f8;
  box-sizing: border-box;
  color: #1f2933;
}

.top-panel,
.section {
  background: #ffffff;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  box-sizing: border-box;
}

.top-panel {
  padding: 28rpx;
  margin-bottom: 20rpx;
}

.eyebrow {
  display: block;
  color: #157347;
  font-size: 24rpx;
  font-weight: 800;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: #111827;
  font-size: 38rpx;
  font-weight: 800;
}

.subtitle {
  display: block;
  margin-top: 8rpx;
  color: #6b7280;
  font-size: 24rpx;
}

.section {
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: block;
  color: #111827;
  font-size: 30rpx;
  font-weight: 800;
  margin-bottom: 18rpx;
}

.selector-state {
  padding: 26rpx 20rpx;
  border: 1rpx solid #d1d5db;
  border-radius: 8rpx;
  color: #6b7280;
  font-size: 26rpx;
  background: #f9fafb;
}

.selector-box {
  min-height: 96rpx;
  padding: 18rpx 20rpx;
  border: 1rpx solid #d1d5db;
  border-radius: 8rpx;
  background: #fff;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.selector-main {
  min-width: 0;
  flex: 1;
}

.selector-title {
  display: block;
  color: #111827;
  font-size: 28rpx;
  font-weight: 800;
  line-height: 1.35;
}

.selector-meta {
  display: block;
  margin-top: 6rpx;
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.35;
}

.selector-arrow {
  color: #9ca3af;
  font-size: 40rpx;
  line-height: 1;
}

.address-line {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}

.default-tag {
  flex: 0 0 auto;
  padding: 4rpx 10rpx;
  border-radius: 6rpx;
  color: #166534;
  background: #dcfce7;
  font-size: 20rpx;
  font-weight: 800;
}

.field-row {
  display: flex;
  gap: 16rpx;
}

.field-group {
  margin-bottom: 18rpx;
}

.field-group.half {
  flex: 1;
}

.field-label {
  display: block;
  margin-bottom: 8rpx;
  color: #374151;
  font-size: 24rpx;
  font-weight: 700;
}

.field-input,
.picker-box,
.field-textarea {
  width: 100%;
  min-height: 76rpx;
  padding: 0 20rpx;
  border: 1rpx solid #d1d5db;
  border-radius: 8rpx;
  background: #fff;
  box-sizing: border-box;
  font-size: 28rpx;
}

.picker-box {
  line-height: 76rpx;
}

.field-textarea {
  height: 140rpx;
  padding-top: 18rpx;
}

.submit-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 8rpx;
  background: #1677ff;
  color: #fff;
  font-size: 30rpx;
  font-weight: 800;
}

.submit-btn[disabled] {
  background: #9ca3af;
}
</style>

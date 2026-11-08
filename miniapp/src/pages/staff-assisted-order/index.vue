<template>
  <view class="page">
    <view class="hero">
      <text class="title">代客下单</text>
      <text class="sub">成品鲜食 · 线下收款 · 只有管理员能用</text>
    </view>

    <view class="search-bar">
      <view class="search-input-wrap">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          v-model="keyword"
          placeholder="手机号 / 昵称 / 狗狗名 / 订单号"
          confirm-type="search"
          @confirm="doSearch"
        />
      </view>
      <text class="search-btn" @tap="doSearch">搜索</text>
    </view>

    <!-- 电话打来、还没有小程序账号的顾客：手机号搜不到就直接建 -->
    <view v-if="adminMode" class="guest-entry" @tap="openGuestForm">
      <view class="guest-entry-main">
        <text class="guest-entry-title">＋ 新建无账号顾客</text>
        <text class="guest-entry-sub">顾客还没有小程序账号，只留了电话</text>
      </view>
      <text class="guest-entry-arrow">›</text>
    </view>

    <view v-if="loading" class="state">搜索中…</view>
    <view v-else-if="searched && customers.length === 0" class="state">
      没找到匹配的顾客。可以用手机号后四位、狗狗名或订单号再试。
    </view>

    <view v-for="customer in customers" :key="customer.id" class="customer-card">
      <view class="customer-head">
        <view class="customer-head-main">
          <view class="customer-name-row">
            <text class="customer-name">{{ customerDisplayName(customer) }}</text>
            <text v-if="customer.isGuest" class="tag-guest">无账号</text>
          </view>
          <text class="customer-meta">{{ customerMeta(customer) }}</text>
        </view>
        <text class="dog-count">{{ customer.dogs.length }} 只狗狗</text>
      </view>

      <view
        v-for="dog in customer.dogs"
        :key="dog.id"
        class="dog-row"
        :class="{ on: selectedDogId === dog.id }"
        @tap="selectDog(customer, dog)"
      >
        <view class="dog-main">
          <text class="dog-name">{{ dog.name }}</text>
          <text class="dog-meta">
            {{ dog.breedName || '未填写品种' }} · {{ formatWeight(dog.currentWeightKg) }}
          </text>
        </view>
        <text v-if="selectedDogId === dog.id" class="dog-check">✓ 选中</text>
      </view>

      <view
        v-if="customer.dogs.length === 0 && customer.isGuest && adminMode"
        class="dog-empty"
        @tap="goCreateDog(customer)"
      >
        ＋ 给 {{ customerDisplayName(customer) }} 新建狗狗
      </view>
    </view>

    <view v-if="selectedDogId" class="bottom-bar">
      <button class="primary-btn" @tap="goRecipe">下一步：选食谱</button>
    </view>

    <!-- 新建无账号顾客 -->
    <view v-if="guestFormVisible" class="modal-mask" @tap="closeGuestForm">
      <view class="modal-panel" @tap.stop>
        <view class="modal-head">
          <text class="modal-title">新建无账号顾客</text>
          <text class="modal-close" @tap="closeGuestForm">关闭</text>
        </view>
        <view class="field-group">
          <text class="field-label">顾客称呼</text>
          <input class="field-input" v-model="guestForm.name" placeholder="例如：王女士" />
        </view>
        <view class="field-group">
          <text class="field-label">联系电话</text>
          <input class="field-input" type="number" v-model="guestForm.phone" placeholder="手机号" />
        </view>
        <view class="field-group">
          <text class="field-label">微信（可留空）</text>
          <input class="field-input" v-model="guestForm.wechat" placeholder="微信号，方便后续联系" />
        </view>
        <text class="field-hint">
          这类顾客没有小程序账号，收不到发货通知，后续需要人工告知。
        </text>
        <button class="primary-btn" :disabled="guestSubmitting" @tap="submitGuestCustomer">
          {{ guestSubmitting ? '创建中…' : '创建并继续' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  createGuestCustomer,
  searchCustomersForAssist,
} from '../../api/staffAssistedOrder'
import { getStoredUser } from '../../utils/account'

const adminMode = getStoredUser()?.role === 'ADMIN'

const keyword = ref('')
const loading = ref(false)
const searched = ref(false)
const customers = ref<any[]>([])
const selectedCustomerId = ref('')
const selectedDogId = ref('')
const selectedDogName = ref('')

const guestFormVisible = ref(false)
const guestSubmitting = ref(false)
const guestForm = reactive({ name: '', phone: '', wechat: '' })

const selectedCustomer = computed(() =>
  customers.value.find((item) => item.id === selectedCustomerId.value),
)

onLoad((options: any) => {
  const customerId = String(options?.customerId || '')
  const dogId = String(options?.dogId || '')
  if (customerId && dogId) {
    uni.redirectTo({
      url: `/pages/staff-assisted-order/recipe?customerId=${encodeURIComponent(customerId)}&dogId=${encodeURIComponent(dogId)}`,
    })
  }
})

function customerDisplayName(customer: any) {
  return (
    customer?.nickname ||
    customer?.guestContactName ||
    customer?.phone ||
    customer?.guestContactPhone ||
    '未命名顾客'
  )
}

function customerMeta(customer: any) {
  if (customer?.isGuest) {
    return `无账号顾客 · ${customer?.guestContactPhone || '未留电话'}`
  }
  return customer?.phone || '未绑定手机号'
}

function formatWeight(value?: number | null) {
  const num = Number(value || 0)
  return num > 0 ? `${num.toFixed(1)}kg` : '未填写体重'
}

async function doSearch() {
  const value = keyword.value.trim()
  if (!value) {
    uni.showToast({ title: '请输入搜索内容', icon: 'none' })
    return
  }
  loading.value = true
  searched.value = true
  try {
    const response = await searchCustomersForAssist(value)
    customers.value = Array.isArray(response.data) ? response.data : []
  } catch (error: any) {
    uni.showToast({ title: error?.message || '搜索失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function selectDog(customer: any, dog: any) {
  selectedCustomerId.value = customer.id
  selectedDogId.value = dog.id
  selectedDogName.value = dog.name
}

function goRecipe() {
  if (!selectedCustomerId.value || !selectedDogId.value) {
    uni.showToast({ title: '请先选一只狗狗', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: `/pages/staff-assisted-order/recipe?customerId=${encodeURIComponent(selectedCustomerId.value)}&dogId=${encodeURIComponent(selectedDogId.value)}`,
  })
}

function goCreateDog(customer: any) {
  uni.navigateTo({
    url: `/pages/staff-assisted-order/guest-dog?customerId=${encodeURIComponent(customer.id)}&customerName=${encodeURIComponent(customerDisplayName(customer))}`,
  })
}

function openGuestForm() {
  guestForm.name = ''
  guestForm.phone = ''
  guestForm.wechat = ''
  guestFormVisible.value = true
}

function closeGuestForm() {
  guestFormVisible.value = false
}

async function submitGuestCustomer() {
  const name = guestForm.name.trim()
  const phone = guestForm.phone.trim()
  if (!name) {
    uni.showToast({ title: '请填顾客称呼', icon: 'none' })
    return
  }
  if (!phone) {
    uni.showToast({ title: '请填联系电话', icon: 'none' })
    return
  }
  if (guestSubmitting.value) return
  guestSubmitting.value = true
  try {
    const response = await createGuestCustomer({
      name,
      phone,
      wechat: guestForm.wechat.trim() || undefined,
    })
    const customerId = (response.data as any)?.customerId
    guestFormVisible.value = false
    uni.showToast({ title: '顾客已创建', icon: 'success' })
    keyword.value = phone
    await doSearch()
    if (customerId) {
      selectedCustomerId.value = customerId
      uni.navigateTo({
        url: `/pages/staff-assisted-order/guest-dog?customerId=${encodeURIComponent(customerId)}&customerName=${encodeURIComponent(name)}`,
      })
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '创建失败', icon: 'none' })
  } finally {
    guestSubmitting.value = false
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #eef2e4; padding: 24rpx 24rpx 200rpx; box-sizing: border-box; color: #26261f; }
.hero { padding: 8rpx 4rpx 20rpx; }
.title { display: block; font-size: 42rpx; font-weight: 800; color: #1e3a2f; }
.sub { display: block; margin-top: 8rpx; font-size: 24rpx; color: #6b6653; }

.search-bar { display: flex; align-items: center; gap: 14rpx; margin-bottom: 16rpx; }
.search-input-wrap { flex: 1; display: flex; align-items: center; min-height: 84rpx; padding: 0 24rpx; background: #fff; border: 1rpx solid #e5e8d4; border-radius: 42rpx; box-sizing: border-box; }
.search-icon { margin-right: 10rpx; font-size: 24rpx; color: #968f6d; }
.search-input { flex: 1; min-width: 0; height: 84rpx; font-size: 26rpx; }
.search-btn { flex: none; padding: 0 30rpx; height: 84rpx; line-height: 84rpx; border-radius: 42rpx; background: #1e3a2f; color: #fff; font-size: 26rpx; font-weight: 700; }

.guest-entry { display: flex; align-items: center; gap: 16rpx; padding: 22rpx 24rpx; margin-bottom: 18rpx; background: #fbfcf7; border: 1rpx dashed #c9dccf; border-radius: 12rpx; }
.guest-entry-main { flex: 1; min-width: 0; }
.guest-entry-title { display: block; font-size: 28rpx; font-weight: 800; color: #1e3a2f; }
.guest-entry-sub { display: block; margin-top: 6rpx; font-size: 22rpx; color: #6b6653; }
.guest-entry-arrow { color: #968f6d; font-size: 36rpx; }

.state { padding: 80rpx 24rpx; text-align: center; color: #6b6653; font-size: 26rpx; line-height: 1.6; }

.customer-card { background: #fff; border-radius: 12rpx; padding: 22rpx; margin-bottom: 18rpx; border: 1rpx solid #e5e8d4; }
.customer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.customer-head-main { min-width: 0; flex: 1; }
.customer-name-row { display: flex; align-items: center; gap: 10rpx; }
.customer-name { font-size: 30rpx; font-weight: 800; color: #26261f; }
.tag-guest { padding: 2rpx 10rpx; border-radius: 6rpx; background: #f2f3f5; color: #8b8f86; font-size: 20rpx; }
.customer-meta { display: block; margin-top: 6rpx; font-size: 23rpx; color: #6b6653; }
.dog-count { flex: none; font-size: 23rpx; color: #1e3a2f; font-weight: 700; }

.dog-row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 18rpx; margin-top: 14rpx; border: 1rpx solid #eef1e2; border-radius: 10rpx; background: #fbfcf7; }
.dog-row.on { border-color: #1e3a2f; background: #f2f7f3; }
.dog-main { min-width: 0; flex: 1; }
.dog-name { display: block; font-size: 28rpx; font-weight: 700; }
.dog-meta { display: block; margin-top: 4rpx; font-size: 22rpx; color: #6b6653; }
.dog-check { flex: none; font-size: 24rpx; font-weight: 700; color: #1e3a2f; }
.dog-empty { margin-top: 14rpx; padding: 18rpx; text-align: center; border: 1rpx dashed #c9dccf; border-radius: 10rpx; color: #2b5040; font-size: 24rpx; }

.bottom-bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #e5e8d4; }
.primary-btn { width: 100%; height: 88rpx; line-height: 88rpx; border-radius: 10rpx; background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%); color: #f3eddd; font-size: 30rpx; font-weight: 800; }

.modal-mask { position: fixed; inset: 0; z-index: 99; display: flex; align-items: flex-end; background: rgba(30, 58, 47, 0.45); }
.modal-panel { width: 100%; max-height: 82vh; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); background: #fff; border-radius: 20rpx 20rpx 0 0; box-sizing: border-box; overflow: auto; }
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.modal-title { font-size: 32rpx; font-weight: 800; }
.modal-close { color: #b08d4f; font-size: 26rpx; }
.field-group { margin-bottom: 18rpx; }
.field-label { display: block; margin-bottom: 8rpx; font-size: 24rpx; font-weight: 700; }
.field-input { width: 100%; height: 84rpx; padding: 0 20rpx; border: 1rpx solid #e5e8d4; border-radius: 8rpx; background: #fbfcf7; box-sizing: border-box; font-size: 28rpx; }
.field-hint { display: block; margin: 8rpx 0 20rpx; font-size: 22rpx; color: #8a6a2f; line-height: 1.6; }
</style>

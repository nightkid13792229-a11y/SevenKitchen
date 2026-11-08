<template>
  <view class="page">
    <view class="hero">
      <text class="title">新增收货地址</text>
      <text class="sub">这条地址会写进顾客的地址簿，下次还能直接选</text>
    </view>

    <view class="section">
      <view class="field-group">
        <text class="field-label">收货人</text>
        <input class="field-input" v-model="form.recipientName" placeholder="收件人姓名" />
      </view>
      <view class="field-group">
        <text class="field-label">手机号</text>
        <input class="field-input" type="number" v-model="form.phone" placeholder="收件人手机号" />
      </view>
      <view class="field-group">
        <text class="field-label">省市区</text>
        <picker mode="region" :value="regionValue" @change="onRegionChange">
          <view class="picker-box">{{ regionText || '请选择省 / 市 / 区' }}</view>
        </picker>
      </view>
      <view class="field-group">
        <text class="field-label">详细地址</text>
        <textarea class="field-textarea" v-model="form.detail" placeholder="街道、门牌号、楼栋房号" />
      </view>
      <view class="field-group switch-row">
        <text class="field-label">设为默认地址</text>
        <switch :checked="form.isDefault" color="#1e3a2f" @change="onDefaultChange" />
      </view>
    </view>

    <button class="primary-btn" :disabled="submitting" @tap="submit">
      {{ submitting ? '保存中…' : '保存地址' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { createCustomerAddress } from '../../api/staffAssistedOrder'

const customerId = ref('')
const submitting = ref(false)
const regionValue = ref<string[]>([])
const regionText = ref('')

const form = reactive({
  recipientName: '',
  phone: '',
  detail: '',
  isDefault: true,
})

onLoad((options: any) => {
  customerId.value = String(options?.customerId || '')
  if (!customerId.value) {
    uni.showToast({ title: '缺少顾客信息', icon: 'none' })
  }
})

function onRegionChange(event: any) {
  const value = Array.isArray(event?.detail?.value) ? event.detail.value : []
  regionValue.value = value
  regionText.value = value.join(' ')
}

function onDefaultChange(event: any) {
  form.isDefault = Boolean(event?.detail?.value)
}

async function submit() {
  if (submitting.value) return
  const recipientName = form.recipientName.trim()
  const phone = form.phone.trim()
  const detail = form.detail.trim()
  if (!recipientName) {
    uni.showToast({ title: '请填收货人', icon: 'none' })
    return
  }
  if (!/^1\d{10}$/.test(phone)) {
    uni.showToast({ title: '请填 11 位手机号', icon: 'none' })
    return
  }
  if (regionValue.value.length < 2) {
    uni.showToast({ title: '请选择省市区', icon: 'none' })
    return
  }
  if (!detail) {
    uni.showToast({ title: '请填详细地址', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const response = await createCustomerAddress(customerId.value, {
      recipientName,
      phone,
      region: {
        province: regionValue.value[0] || '',
        city: regionValue.value[1] || '',
        district: regionValue.value[2] || '',
      },
      detail,
      isDefault: form.isDefault,
    })
    // 地址建好后直接返回；确认页在 onShow 里重新拉一次地址列表，
    // 比在页面之间传对象更稳（返回时列表已经刷新）。
    void response
    uni.showToast({ title: '地址已保存', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 400)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #eef2e4; padding: 24rpx; box-sizing: border-box; color: #26261f; }
.hero { padding: 8rpx 4rpx 20rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; color: #1e3a2f; }
.sub { display: block; margin-top: 8rpx; font-size: 23rpx; color: #6b6653; }
.section { background: #fff; border: 1rpx solid #e5e8d4; border-radius: 12rpx; padding: 24rpx; }
.field-group { margin-bottom: 20rpx; }
.field-label { display: block; margin-bottom: 8rpx; font-size: 24rpx; font-weight: 700; }
.field-input, .picker-box, .field-textarea { width: 100%; height: 84rpx; padding: 0 20rpx; border: 1rpx solid #e5e8d4; border-radius: 8rpx; background: #fbfcf7; box-sizing: border-box; font-size: 28rpx; }
.picker-box { line-height: 84rpx; }
.field-textarea { height: 140rpx; padding-top: 18rpx; }
.switch-row { display: flex; align-items: center; justify-content: space-between; }
.switch-row .field-label { margin-bottom: 0; }
.primary-btn { margin-top: 24rpx; width: 100%; height: 88rpx; line-height: 88rpx; border-radius: 10rpx; background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%); color: #f3eddd; font-size: 30rpx; font-weight: 800; }
</style>

<template>
  <view class="page">
    <view v-if="loading" class="state"><text>加载中…</text></view>
    <view v-else-if="!order" class="state"><text>订单不存在</text></view>
    <template v-else>
      <view class="card">
        <view class="row">
          <text class="label">订单</text>
          <text class="value">{{ order.orderNo }}</text>
        </view>
        <view class="row">
          <text class="label">实付</text>
          <text class="value">¥{{ money(order.amountTotal) }}</text>
        </view>
        <view v-if="order.status === 'PACKED'" class="notice">
          订单还没发货，只支持全额退款；退款成功后订单会取消，库存已消耗不释放。
        </view>
        <view v-if="policyText" class="notice policy">{{ policyText }}</view>
      </view>

      <view class="card">
        <text class="section-title">申请类型</text>
        <view class="type-row">
          <view
            v-for="item in types"
            :key="item.value"
            class="type"
            :class="{ active: requestType === item.value }"
            @tap="requestType = item.value"
          >
            <text class="type-icon">{{ item.icon }}</text>
            <text class="type-text">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <view class="card">
        <text class="section-title">原因</text>
        <textarea
          v-model="reason"
          class="textarea"
          maxlength="500"
          placeholder="请描述问题，例如：收到时瓶身破损 / 少发了一瓶 / 不想要了"
        />
        <text class="counter">{{ reason.length }}/500</text>
      </view>

      <view class="card">
        <text class="section-title">凭证图片（选填，最多 6 张）</text>
        <view class="photo-grid">
          <view v-for="(photo, index) in photos" :key="photo" class="photo-item">
            <image :src="photo" mode="aspectFill" class="photo" />
            <text class="photo-remove" @tap="removePhoto(index)">×</text>
          </view>
          <view v-if="photos.length < 6" class="photo-add" @tap="choosePhoto">＋</view>
        </view>
        <text class="hint">可拍瓶身、快递面单、破损处；提交后会随售后单一起给客服看。</text>
      </view>

      <view v-if="requestType === 'REFUND' && order.status !== 'PACKED'" class="card">
        <text class="section-title">退款金额</text>
        <input v-model="amountText" class="input" type="digit" placeholder="不填 = 全额退款" />
        <text class="hint">可部分退款；累计不能超过实付。</text>
      </view>

      <button class="submit" :disabled="submitting" @tap="submit">
        {{ submitting ? '提交中…' : '提交申请' }}
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getBaseUrl } from '../../utils/config'
import { getToken } from '../../utils/api'
import {
  createSupplementAftersale,
  prefetchSupplementSubscriptions,
  requestSupplementSubscriptions,
  fetchSupplementOrderDetail,
  type SupplementOrder,
} from '../../api/supplements'

const orderId = ref('')
const order = ref<SupplementOrder | null>(null)
const loading = ref(false)
const submitting = ref(false)
const requestType = ref<'REFUND' | 'RESHIP' | 'OTHER'>('REFUND')
const reason = ref('')
const amountText = ref('')
const policyText = ref('')
const photos = ref<string[]>([])

const types = computed(() => {
  const status = order.value?.status || ''
  const list: Array<{ value: 'REFUND' | 'RESHIP'; label: string; icon: string }> = [
    { value: 'REFUND', label: '退款', icon: '💰' },
  ]
  if (['SHIPPED', 'COMPLETED'].includes(status)) {
    list.push({ value: 'RESHIP', label: '免费补发', icon: '📦' })
  }
  list.push({ value: 'OTHER', label: '其他问题', icon: '💬' })
  return list
})

function money(value: number) {
  return Number(value || 0).toFixed(2)
}

async function load() {
  loading.value = true
  try {
    const [res, policy] = await Promise.all([
      fetchSupplementOrderDetail(orderId.value),
      fetchSupplementPolicy().catch(() => ({ code: 0, data: null } as any)),
      prefetchSupplementSubscriptions(),
    ])
    if (policy.code === 0 && policy.data?.aftersalePolicy) {
      policyText.value = `${policy.data.aftersalePolicy}（发货后 ${policy.data.aftersaleWindowDays} 天内可申请）`
    }
    if (res.code === 0) order.value = res.data
    else uni.showToast({ title: res.message || '加载失败', icon: 'none' })
  } catch (error) {
    console.error('[SupplementAftersale] load failed:', error)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function choosePhoto() {
  uni.chooseImage({
    count: 6 - photos.value.length,
    success: (res) => {
      photos.value.push(...(res.tempFilePaths || []))
    },
  })
}

function removePhoto(index: number) {
  photos.value.splice(index, 1)
}

function uploadPhoto(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const token = getToken()
    uni.uploadFile({
      url: `${getBaseUrl()}/supplement-orders/${encodeURIComponent(orderId.value)}/aftersale-photos`,
      filePath,
      name: 'files',
      header: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
        try {
          const body = JSON.parse(res.data)
          const url = body?.data?.photos?.[0]?.url
          if (res.statusCode === 200 && body.code === 0 && url) resolve(url)
          else reject(new Error(body?.message || '图片上传失败'))
        } catch {
          reject(new Error('图片上传失败'))
        }
      },
      fail: () => reject(new Error('图片上传失败')),
    })
  })
}

async function submit() {
  if (!order.value) return
  if (!reason.value.trim()) {
    uni.showToast({ title: '请填写原因', icon: 'none' })
    return
  }
  if (order.value.status === 'PACKED' && requestType.value !== 'REFUND') {
    uni.showToast({ title: '未发货只支持退款', icon: 'none' })
    return
  }

  const amount = amountText.value.trim() ? Number(amountText.value) : undefined
  if (requestType.value === 'REFUND' && amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    uni.showToast({ title: '退款金额不正确', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    await requestSupplementSubscriptions(['aftersale'])
    const uploadedPhotos: string[] = []
    for (const path of photos.value) {
      uploadedPhotos.push(await uploadPhoto(path))
    }
    const res = await createSupplementAftersale(order.value.id, {
      requestType: requestType.value,
      reason: reason.value.trim(),
      photos: uploadedPhotos,
      amount,
    })
    if (res.code === 0) {
      uni.showToast({ title: '已提交，等待处理', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } else {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' })
    }
  } catch (error: any) {
    console.error('[SupplementAftersale] submit failed:', error)
    uni.showToast({ title: error?.message || '提交失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

onLoad((options: any) => {
  orderId.value = options?.orderId || ''
  if (!orderId.value) {
    uni.showToast({ title: '缺少订单', icon: 'none' })
    return
  }
  load()
})
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 16rpx 24rpx 60rpx; box-sizing: border-box; }
.state { padding-top: 200rpx; text-align: center; color: #909399; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; }
.row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 28rpx; }
.label { color: #909399; }
.value { color: #303133; }
.notice { margin-top: 12rpx; padding: 14rpx; background: #fdf6ec; color: #b88230; border-radius: 8rpx; font-size: 24rpx; line-height: 1.6; }
.policy { background: #f4f4f5; color: #606266; }
.section-title { display: block; font-size: 28rpx; font-weight: 600; color: #303133; margin-bottom: 16rpx; }
.type-row { display: flex; gap: 16rpx; }
.type { flex: 1; border: 2rpx solid #e4e7ed; border-radius: 12rpx; padding: 18rpx 0; text-align: center; }
.type.active { border-color: #409eff; background: #ecf5ff; }
.type-icon { display: block; font-size: 34rpx; }
.type-text { display: block; margin-top: 6rpx; font-size: 26rpx; color: #303133; }
.textarea { width: 100%; min-height: 180rpx; font-size: 28rpx; line-height: 1.6; }
.counter { display: block; text-align: right; color: #c0c4cc; font-size: 22rpx; }
.input { height: 72rpx; border: 2rpx solid #e4e7ed; border-radius: 8rpx; padding: 0 16rpx; font-size: 28rpx; }
.hint { display: block; margin-top: 10rpx; color: #909399; font-size: 23rpx; }
.photo-grid { display: flex; flex-wrap: wrap; gap: 14rpx; }
.photo-item { position: relative; width: 150rpx; height: 150rpx; border-radius: 10rpx; overflow: hidden; }
.photo { width: 100%; height: 100%; }
.photo-remove { position: absolute; top: 0; right: 0; width: 40rpx; height: 40rpx; line-height: 36rpx; text-align: center; background: rgba(0,0,0,0.55); color: #fff; font-size: 30rpx; }
.photo-add { width: 150rpx; height: 150rpx; border: 2rpx dashed #c0c4cc; border-radius: 10rpx; display: flex; align-items: center; justify-content: center; color: #909399; font-size: 46rpx; }
.submit { margin-top: 30rpx; background: #409eff; color: #fff; border-radius: 44rpx; font-size: 30rpx; }
.submit[disabled] { opacity: 0.6; }
</style>

<template>
  <view class="container">
    <view class="form-section">
      <view class="form-item">
        <text class="label">收货人姓名 *</text>
        <input class="input" placeholder="请输入收货人姓名" v-model="formData.recipientName" />
      </view>

      <view class="form-item">
        <text class="label">手机号 *</text>
        <input class="input" type="number" placeholder="请输入手机号" v-model="formData.phone" />
      </view>

      <view class="form-item">
        <text class="label">省份 *</text>
        <input class="input" placeholder="请输入省份" v-model="formData.province" />
      </view>

      <view class="form-item">
        <text class="label">城市 *</text>
        <input class="input" placeholder="请输入城市" v-model="formData.city" />
      </view>

      <view class="form-item">
        <text class="label">区县 *</text>
        <input class="input" placeholder="请输入区县" v-model="formData.district" />
      </view>

      <view class="form-item">
        <text class="label">详细地址 *</text>
        <textarea class="textarea" placeholder="请输入详细地址" v-model="formData.detail" />
      </view>

      <view class="form-item">
        <text class="label">设为默认地址</text>
        <switch :checked="formData.isDefault" @change="onDefaultChange" />
      </view>

      <button class="btn" @tap="save">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request, getToken } from '../../utils/api'

interface FormData {
  recipientName: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  isDefault: boolean
}

const formData = ref<FormData>({
  recipientName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false
})

const addressId = ref<string | null>(null)

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  addressId.value = currentPage.options?.id || null
  
  if (addressId.value) {
    loadAddress()
  }
})

function loadAddress() {
  uni.showLoading({ title: '加载中...' })
  
  // Note: There's no GET /addresses/:id endpoint
  // Load from list and find the one
  request({
    url: '/addresses',
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      const address = res.data.find((addr: any) => addr.id === addressId.value)
      if (address) {
        formData.value = {
          recipientName: address.recipientName,
          phone: address.phone,
          province: address.region.province,
          city: address.region.city,
          district: address.region.district,
          detail: address.detail,
          isDefault: address.isDefault
        }
      }
    }
  }).catch((err: any) => {
    console.error('Load address error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

function onDefaultChange(e: any) {
  formData.value.isDefault = e.detail.value
}

function save() {
  const { recipientName, phone, province, city, district, detail } = formData.value

  if (!recipientName || !phone || !province || !city || !district || !detail) {
    uni.showToast({
      title: '请填写完整信息',
      icon: 'none'
    })
    return
  }

  uni.showLoading({ title: '保存中...' })

  const payload = {
    recipientName,
    phone,
    region: {
      province,
      city,
      district
    },
    detail,
    isDefault: formData.value.isDefault
  }

  const promise = addressId.value
    ? request({
        url: `/addresses/${addressId.value}`,
        method: 'PUT',
        data: payload
      })
    : request({
        url: '/addresses',
        method: 'POST',
        data: payload
      })

  promise.then((res: any) => {
    if (res.code === 0) {
      uni.showToast({
        title: '保存成功',
        icon: 'success'
      })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    }
  }).catch((err: any) => {
    console.error('Save address error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.form-section {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.form-item {
  margin-bottom: 30rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  margin-bottom: 10rpx;
  color: #333;
  font-weight: bold;
}

.input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 20rpx;
}
</style>



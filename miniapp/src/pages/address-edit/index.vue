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
        <text class="label">所在地区 *</text>
        <picker
          mode="region"
          :value="regionValue"
          @change="onRegionChange"
        >
          <view class="picker-input">
            <text v-if="regionText" class="selected-text">{{ regionText }}</text>
            <text v-else class="placeholder">请选择省/市/区</text>
            <text class="arrow">▼</text>
          </view>
        </picker>
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

// 省市区选择器相关
const regionValue = ref<string[]>([]) // picker的值数组 [省, 市, 区]
const regionText = ref('') // 显示文本 "省 市 区"

// 当picker选择变化时
function onRegionChange(e: any) {
  const value = e.detail.value
  regionValue.value = value

  // 更新formData
  formData.value.province = value[0] || ''
  formData.value.city = value[1] || ''
  formData.value.district = value[2] || ''

  // 更新显示文本
  updateRegionText()
}

// 更新地区显示文本
function updateRegionText() {
  const { province, city, district } = formData.value
  const parts = [province, city, district].filter(Boolean)
  regionText.value = parts.join(' ')
}

// 初始化regionValue和regionText（用于编辑已有地址时）
function initRegionValue() {
  const { province, city, district } = formData.value
  if (province || city || district) {
    regionValue.value = [province, city, district]
    updateRegionText()
  }
}

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
        // 初始化省市区选择器
        initRegionValue()
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

/* 省市区选择器样式 */
.picker-input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  background-color: #fff;
}

.selected-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.picker-input .placeholder {
  flex: 1;
  font-size: 28rpx;
  color: #999;
}

.arrow {
  font-size: 24rpx;
  color: #999;
  margin-left: 10rpx;
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



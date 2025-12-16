<template>
  <view class="container">
    <view class="address-list">
      <view 
        v-for="address in addresses" 
        :key="address.id"
        class="address-item"
        @tap="onAddressTap(address.id)"
      >
        <view class="address-content">
          <view class="address-header">
            <text class="recipient-name">{{ address.recipientName }}</text>
            <text class="phone">{{ address.phone }}</text>
            <text class="default-tag" v-if="address.isDefault">默认</text>
          </view>
          <view class="address-text">
            <text>{{ address.region.province }} {{ address.region.city }} {{ address.region.district }} {{ address.detail }}</text>
          </view>
        </view>
        <view class="address-actions" v-if="mode === 'manage'">
          <button 
            class="btn-small" 
            @tap.stop="setDefault(address.id)"
            :disabled="address.isDefault"
          >
            {{ address.isDefault ? '已默认' : '设默认' }}
          </button>
        </view>
      </view>
      <view v-if="addresses.length === 0" class="empty-state">
        <text>暂无地址</text>
      </view>
    </view>
    
    <view class="bottom-bar">
      <button class="btn-add" @tap="addAddress">新增地址</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'

interface Address {
  id: string
  recipientName: string
  phone: string
  region: {
    province: string
    city: string
    district: string
  }
  detail: string
  isDefault: boolean
}

const addresses = ref<Address[]>([])
const mode = ref('manage') // 'manage' or 'select'

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  mode.value = currentPage.options?.mode || 'manage'
  
  loadAddresses()
})

function loadAddresses() {
  uni.showLoading({ title: '加载中...' })
  
  request({
    url: '/addresses',
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      addresses.value = res.data
    }
  }).catch((err: any) => {
    console.error('Load addresses error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

function onAddressTap(addressId: string) {
  if (mode.value === 'select') {
    // Select mode: return to order-config with selected addressId
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.route === 'pages/order-config/index') {
      // Set addressId in previous page
      uni.$emit('address-selected', addressId)
      uni.navigateBack()
    }
  } else {
    // Manage mode: edit address
    uni.navigateTo({
      url: `/pages/address-edit/index?id=${addressId}`
    })
  }
}

function addAddress() {
  uni.navigateTo({
    url: '/pages/address-edit/index'
  })
}

function setDefault(addressId: string) {
  uni.showLoading({ title: '设置中...' })
  
  request({
    url: `/addresses/${addressId}/set-default`,
    method: 'POST'
  }).then((res: any) => {
    if (res.code === 0) {
      uni.showToast({
        title: '设置成功',
        icon: 'success'
      })
      loadAddresses()
    }
  }).catch((err: any) => {
    console.error('Set default error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-bottom: 120rpx;
}

.address-list {
  padding: 20rpx 0;
}

.address-item {
  background-color: #fff;
  padding: 30rpx;
  margin-bottom: 20rpx;
  border-radius: 8rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.address-content {
  flex: 1;
}

.address-header {
  display: flex;
  align-items: center;
  margin-bottom: 10rpx;
}

.recipient-name {
  font-size: 32rpx;
  font-weight: bold;
  margin-right: 20rpx;
}

.phone {
  font-size: 28rpx;
  color: #666;
  margin-right: 20rpx;
}

.default-tag {
  font-size: 24rpx;
  color: #07c160;
  background-color: #e6f7ff;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
}

.address-text {
  font-size: 28rpx;
  color: #666;
  line-height: 1.5;
}

.address-actions {
  margin-left: 20rpx;
}

.btn-small {
  font-size: 24rpx;
  padding: 10rpx 20rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 4rpx;
}

.empty-state {
  text-align: center;
  padding: 100rpx 0;
  color: #999;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 20rpx;
  border-top: 1px solid #eee;
}

.btn-add {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
}
</style>



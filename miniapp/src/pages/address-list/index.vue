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
          <view class="address-footer" v-if="mode === 'manage'">
            <view class="footer-left">
              <button
                class="btn-small btn-edit"
                @tap.stop="editAddress(address.id)"
              >
                编辑
              </button>
              <button
                v-if="!address.isDefault"
                class="btn-small btn-default"
                @tap.stop="setDefault(address.id)"
              >
                设为默认地址
              </button>
            </view>
            <button
              class="btn-small btn-delete"
              @tap.stop="deleteAddress(address.id)"
            >
              删除
            </button>
          </view>
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
import { onShow } from '@dcloudio/uni-app'
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
})

onShow(() => {
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
    // Select mode: return to previous page (order-config or checkout)
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage) {
      const prevPageRoute = prevPage.route
      console.log('[AddressList] Previous page:', prevPageRoute)

      // Send event to previous page
      uni.$emit('address-selected', { addressId, from: prevPageRoute })
      uni.navigateBack()
    } else {
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

function editAddress(addressId: string) {
  uni.navigateTo({
    url: `/pages/address-edit/index?id=${addressId}`
  })
}

function deleteAddress(addressId: string) {
  console.log('[Delete Address] Starting delete for address:', addressId)

  uni.showModal({
    title: '确认删除',
    content: '确定要删除这个地址吗？',
    success: (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '删除中...' })

        console.log('[Delete Address] Sending DELETE request to:', `/addresses/${addressId}`)

        request({
          url: `/addresses/${addressId}`,
          method: 'DELETE'
        }).then((result: any) => {
          console.log('[Delete Address] Delete success:', result)
          // DELETE 204 No Content 没有响应体，直接处理成功
          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
          loadAddresses()
        }).catch((err: any) => {
          console.error('[Delete Address] Delete failed:', err)
          console.error('[Delete Address] Error details:', {
            message: err?.message,
            stack: err?.stack,
            name: err?.name
          })
          uni.showToast({
            title: '删除失败',
            icon: 'none'
          })
        }).finally(() => {
          uni.hideLoading()
        })
      }
    }
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
}

.address-content {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
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

.address-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8rpx;
  border-top: 1rpx solid #f0f0f0;
}

.footer-left {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
}

.btn-small {
  font-size: 24rpx;
  border-radius: 4rpx;
  border: none;
  outline: none;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-sizing: border-box;
  overflow: visible;
}

.btn-small::after {
  border: none;
}

.btn-default {
  background-color: #1890ff;
  color: #fff;
  padding: 5rpx 10rpx;
}

.btn-edit {
  background-color: #faad14;
  color: #fff;
  padding: 5rpx 10rpx;
}

.btn-delete {
  color: #999;
  padding: 5rpx 0;
  background-color: transparent;
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
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
}
</style>



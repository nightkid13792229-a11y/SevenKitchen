<template>
  <view class="staff-workbench">
    <view v-if="!isStaff" class="no-permission">
      <text class="message">仅员工可访问此页面</text>
      <text class="hint">即将返回首页...</text>
    </view>

    <view v-else class="workbench-container">
      <view class="workbench-grid">
        <view
          v-for="module in workbenchModules"
          :key="module.key"
          class="workbench-tile"
          @tap="module.onTap"
        >
          <view class="module-icon-shell">
            <image class="module-icon" :src="module.icon" mode="aspectFit" />
          </view>
          <text class="module-title">{{ module.title }}</text>
          <text
            v-if="module.badgeKey && badgeCount(module.badgeKey) > 0"
            class="module-badge"
          >{{ formatBadge(badgeCount(module.badgeKey)) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { refreshCurrentTabBar } from '../../utils/tabbar'

const isStaff = ref(false)

type WorkbenchBadgeKey =
  | 'purchasing'
  | 'production'
  | 'orders'
  | 'reimbursement'
  | 'inventory'
type WorkbenchBadges = Record<WorkbenchBadgeKey, number>
type WorkbenchModule = {
  key: string
  title: string
  icon: string
  badgeKey?: WorkbenchBadgeKey
  onTap: () => void
}

interface WorkbenchSummary {
  badges?: Partial<WorkbenchBadges>
}

const todoCounts = ref<Partial<WorkbenchBadges>>({})

onMounted(() => {
  checkPermission()
})

onShow(() => {
  refreshCurrentTabBar()
  checkPermission()
})

const checkPermission = () => {
  let storedUser = uni.getStorageSync('user')
  if (!storedUser || storedUser === '{}' || storedUser === '') {
    storedUser = uni.getStorageSync('userInfo')
  }

  let userData = storedUser
  if (typeof storedUser === 'string') {
    try {
      userData = JSON.parse(storedUser)
    } catch (error) {
      console.error('[StaffWorkbench] Failed to parse user data:', error)
      userData = null
    }
  }

  if (
    !userData ||
    !userData.role ||
    (userData.role !== 'STAFF' && userData.role !== 'ADMIN')
  ) {
    const token = uni.getStorageSync('token')
    if (token && (!userData || !userData.role)) {
      loadUserInfoFromApi()
      return
    }

    isStaff.value = false
    uni.showToast({ title: '权限不足', icon: 'none' })
    setTimeout(() => {
      uni.switchTab({ url: '/pages/home/index' })
    }, 1500)
    return
  }

  isStaff.value = true
  loadStats()
}

const loadUserInfoFromApi = async () => {
  try {
    const res = await request({ url: '/users/me', method: 'GET' })
    if (res.code === 0 && res.data) {
      uni.setStorageSync('user', res.data)
      refreshCurrentTabBar()
      checkPermission()
    } else {
      throw new Error('Failed to load user info')
    }
  } catch (error) {
    console.error('[StaffWorkbench] Failed to load user info from API:', error)
    uni.showToast({ title: '加载用户信息失败', icon: 'none' })
    setTimeout(() => {
      uni.switchTab({ url: '/pages/home/index' })
    }, 1500)
  }
}

const loadStats = async () => {
  try {
    const response = await request<WorkbenchSummary>({
      url: '/staff/workbench/summary',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    })
    todoCounts.value = response.data?.badges || {}
  } catch (error) {
    console.error('[StaffWorkbench] Failed to load stats:', error)
  }
}

const badgeCount = (key: WorkbenchBadgeKey) => Number(todoCounts.value[key] || 0)
const formatBadge = (count: number) => (count > 99 ? '99+' : String(count))

function goToPurchasing() {
  uni.navigateTo({ url: '/pages/staff-purchasing/index' })
}

function goToProduction() {
  uni.navigateTo({ url: '/pages/staff-production/index' })
}

function viewTodayOrders() {
  uni.navigateTo({ url: '/pages/staff-orders/index' })
}

function goToCustomerDogs() {
  uni.navigateTo({ url: '/pages/staff-customer-service/customers' })
}

function goToInventory() {
  uni.navigateTo({ url: '/pages/staff-inventory/index' })
}

function goToStaffRecipes() {
  uni.navigateTo({ url: '/pages/staff-recipes/index' })
}

function goToReimbursement() {
  uni.navigateTo({ url: '/pages/staff-purchasing/reimbursement/list' })
}

function goToRecipeDesigner() {
  uni.navigateTo({ url: '/pages/recipe-designer/list' })
}

const workbenchModules = computed<WorkbenchModule[]>(() => [
  {
    key: 'purchasing',
    title: '采购管理',
    icon: '/static/ui-icons/purchasing.png',
    badgeKey: 'purchasing',
    onTap: goToPurchasing,
  },
  {
    key: 'production',
    title: '生产管理',
    icon: '/static/ui-icons/production.png',
    badgeKey: 'production',
    onTap: goToProduction,
  },
  {
    key: 'orders',
    title: '订单管理',
    icon: '/static/ui-icons/orders.png',
    badgeKey: 'orders',
    onTap: viewTodayOrders,
  },
  {
    key: 'customers',
    title: '客户与狗狗',
    icon: '/static/ui-icons/customers.png',
    onTap: goToCustomerDogs,
  },
  {
    key: 'inventory',
    title: '库存管理',
    icon: '/static/ui-icons/inventory.png',
    badgeKey: 'inventory',
    onTap: goToInventory,
  },
  {
    key: 'recipes',
    title: '食谱管理',
    icon: '/static/ui-icons/recipes.png',
    onTap: goToStaffRecipes,
  },
  {
    key: 'reimbursement',
    title: '报销管理',
    icon: '/static/ui-icons/reimbursement.png',
    badgeKey: 'reimbursement',
    onTap: goToReimbursement,
  },
  {
    key: 'recipe-designer',
    title: '食谱设计器',
    icon: '/static/ui-icons/recipe-designer.png',
    onTap: goToRecipeDesigner,
  },
])
</script>

<style scoped lang="scss">
.staff-workbench {
  min-height: 100vh;
  padding-bottom: 120rpx;
  background: #f0f3e9;
}

.no-permission {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 32rpx;

  .message {
    margin-bottom: 16rpx;
    font-size: 32rpx;
    color: #26261f;
  }

  .hint {
    font-size: 24rpx;
    color: #968f6d;
  }
}

.workbench-container {
  padding: 24rpx;
}

.workbench-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
}

.workbench-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 190rpx;
  padding: 20rpx 12rpx;
  background: #fbfcf7;
  border: 1rpx solid #e5e8d4;
  border-radius: 28rpx;
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);

  &:active {
    transform: scale(0.98);
  }
}

.module-icon-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  margin-bottom: 14rpx;
  background: linear-gradient(160deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: 28rpx;
  box-shadow: 0 10rpx 22rpx rgba(30, 58, 47, 0.22);
}

.module-icon {
  width: 48rpx;
  height: 48rpx;
}

.module-title {
  font-size: 26rpx;
  color: #26261f;
  text-align: center;
}

.module-badge {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 8rpx;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 32rpx;
  color: #fff;
  text-align: center;
  background: #b4553f;
  border-radius: 999rpx;
}
</style>

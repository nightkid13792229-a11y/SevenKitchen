<template>
  <view class="supplement-library-page">
    <view class="top-bar">
      <view class="title-block">
        <text class="page-title">补剂库</text>
        <text class="page-subtitle">搜索现有补剂，或拍照识别新增</text>
      </view>
      <button
        v-if="showImportEntry"
        class="primary-action"
        @tap="goToImport"
      >
        拍照识别新增
      </button>
    </view>

    <view class="search-row">
      <input
        v-model="searchKeyword"
        class="search-input"
        confirm-type="search"
        placeholder="搜索名称、品牌或型号"
      />
    </view>

    <view v-if="isLoading" class="state-panel">
      <text class="state-text">正在加载补剂库...</text>
    </view>

    <view v-else-if="filteredSupplements.length === 0" class="state-panel">
      <text class="state-title">暂无匹配补剂</text>
      <text class="state-text">可以调整关键词，或使用拍照识别新增。</text>
    </view>

    <view v-else class="supplement-list">
      <view
        v-for="item in filteredSupplements"
        :key="item.id || item.name"
        class="supplement-card"
      >
        <view class="card-header">
          <text class="supplement-name">{{ item.name || '未命名补剂' }}</text>
          <text v-if="formatUnit(item)" class="unit-badge">{{ formatUnit(item) }}</text>
        </view>
        <view class="meta-row">
          <text v-if="item.brand" class="meta-text">{{ item.brand }}</text>
          <text v-if="item.productModel" class="meta-text">{{ item.productModel }}</text>
        </view>
        <view v-if="formatAddTiming(item)" class="timing-row">
          <text class="timing-label">添加时机</text>
          <text class="timing-value">{{ formatAddTiming(item) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { request } from '../../utils/api'
import { canShowSupplementImportEntry } from '../../utils/supplement-import'

type SupplementIngredient = {
  id?: string
  name?: string
  brand?: string
  productModel?: string
  type?: string
  unitDisplayLabel?: string
  baseUnit?: string
  properties?: {
    add_timing?: string
    addTiming?: string
  } | null
}

const recipeId = ref('')
const searchKeyword = ref('')
const supplements = ref<SupplementIngredient[]>([])
const isLoading = ref(false)
const showImportEntry = computed(() => canShowSupplementImportEntry())

const filteredSupplements = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return supplements.value
  }

  return supplements.value.filter((item) => {
    return [
      item.name,
      item.brand,
      item.productModel,
      item.unitDisplayLabel,
      item.baseUnit,
      formatAddTiming(item),
    ].some((value) => String(value || '').toLowerCase().includes(keyword))
  })
})

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage?.options?.recipeId || ''

  if (!ensureAdminAccess()) {
    return
  }

  await loadSupplements()
})

function ensureAdminAccess(): boolean {
  if (canShowSupplementImportEntry()) {
    return true
  }

  uni.showToast({ title: '仅管理员可访问补剂库', icon: 'none' })
  setTimeout(() => {
    if (getCurrentPages().length > 1) {
      uni.navigateBack()
      return
    }

    uni.redirectTo({ url: '/pages/recipe-list/index' })
  }, 600)
  return false
}

async function loadSupplements() {
  isLoading.value = true
  try {
    const res: any = await request({
      url: '/admin/ingredients',
      method: 'GET',
    })
    supplements.value = normalizeIngredientList(res.data)
      .filter((item) => item.type === 'SUPPLEMENT')
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '加载补剂库失败',
      icon: 'none',
    })
  } finally {
    isLoading.value = false
  }
}

function normalizeIngredientList(data: any): SupplementIngredient[] {
  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.items)) {
    return data.items
  }

  if (Array.isArray(data?.list)) {
    return data.list
  }

  return []
}

function formatUnit(item: SupplementIngredient): string {
  return item.unitDisplayLabel || item.baseUnit || ''
}

function formatAddTiming(item: SupplementIngredient): string {
  return item.properties?.add_timing || item.properties?.addTiming || ''
}

function goToImport() {
  uni.navigateTo({
    url: `/pages/recipe-diy/supplement-import?recipeId=${encodeURIComponent(recipeId.value)}`,
  })
}
</script>

<style scoped>
.supplement-library-page {
  min-height: 100vh;
  padding: 32rpx 28rpx 48rpx;
  background: #f6f7fb;
  box-sizing: border-box;
}

.top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 24rpx;
}

.title-block {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.page-title {
  color: #20232a;
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.25;
}

.page-subtitle {
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.4;
}

.primary-action {
  flex-shrink: 0;
  min-width: 188rpx;
  height: 72rpx;
  padding: 0 22rpx;
  border-radius: 8rpx;
  background: #2f6fed;
  color: #fff;
  font-size: 26rpx;
  line-height: 72rpx;
}

.primary-action::after {
  border: 0;
}

.search-row {
  margin-bottom: 24rpx;
}

.search-input {
  height: 80rpx;
  padding: 0 26rpx;
  border: 2rpx solid #e0e5ef;
  border-radius: 8rpx;
  background: #fff;
  color: #20232a;
  font-size: 28rpx;
  box-sizing: border-box;
}

.supplement-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.supplement-card {
  padding: 24rpx;
  border: 2rpx solid #e8edf5;
  border-radius: 8rpx;
  background: #fff;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.supplement-name {
  flex: 1;
  min-width: 0;
  color: #1f2937;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
}

.unit-badge {
  flex-shrink: 0;
  padding: 6rpx 12rpx;
  border-radius: 6rpx;
  background: #edf4ff;
  color: #2563eb;
  font-size: 22rpx;
  line-height: 1.2;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.meta-text {
  color: #4b5563;
  font-size: 24rpx;
  line-height: 1.35;
}

.timing-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 16rpx;
}

.timing-label {
  color: #6b7280;
  font-size: 22rpx;
}

.timing-value {
  color: #111827;
  font-size: 24rpx;
}

.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300rpx;
  padding: 40rpx;
  border: 2rpx dashed #d7deea;
  border-radius: 8rpx;
  background: #fff;
  box-sizing: border-box;
}

.state-title {
  margin-bottom: 8rpx;
  color: #1f2937;
  font-size: 30rpx;
  font-weight: 700;
}

.state-text {
  color: #6b7280;
  font-size: 26rpx;
  line-height: 1.5;
  text-align: center;
}
</style>

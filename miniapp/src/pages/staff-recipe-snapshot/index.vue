<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>

    <view v-else-if="errorText" class="state">
      <text class="state-text">{{ errorText }}</text>
      <text class="state-retry" @tap="load">重新加载</text>
    </view>

    <block v-else>
      <!-- 顶部：这一单是哪一版 -->
      <view class="hero">
        <view class="hero-top">
          <text class="hero-name">{{ snapshotName }}</text>
          <text v-if="snapshotVersion" class="version-chip">v{{ snapshotVersion }}</text>
        </view>
        <view class="hero-badges">
          <text class="badge">下单快照 · 只读</text>
          <text v-if="data?.targetProductionDate" class="badge ghost">
            制作日 {{ data.targetProductionDate }}
          </text>
        </view>
        <text class="notice">
          这是 {{ formatTime(data?.createdAt) }} 下单时的那一版配方，属历史数据，不代表当前最新配方。
        </text>
      </view>

      <!-- 这一单是谁的 -->
      <view class="card">
        <view class="row">
          <text class="label">订单号</text>
          <text class="value mono">{{ data?.orderNo || '—' }}</text>
        </view>
        <view class="row">
          <text class="label">顾客</text>
          <text class="value">{{ data?.customerName || '—' }}</text>
        </view>
        <view class="row">
          <text class="label">狗狗</text>
          <text class="value">{{ data?.dog?.name || '—' }}</text>
        </view>
        <view class="row">
          <text class="label">下单时间</text>
          <text class="value">{{ formatTime(data?.createdAt) }}</text>
        </view>
      </view>

      <!-- 这一单做多少 -->
      <view class="card">
        <text class="card-title">本单份量</text>
        <view class="metric-grid">
          <view class="metric">
            <text class="metric-value">{{ formatNumber(data?.quantityG) }}<text class="metric-unit">g</text></text>
            <text class="metric-label">总克重</text>
          </view>
          <view class="metric">
            <text class="metric-value">{{ formatNumber(data?.dailyIntakeG) }}<text class="metric-unit">g</text></text>
            <text class="metric-label">每日建议</text>
          </view>
          <view class="metric">
            <text class="metric-value">{{ data?.packageCount || 0 }}<text class="metric-unit">袋</text></text>
            <text class="metric-label">共 {{ data?.packageSpecG || 0 }}g/袋</text>
          </view>
          <view class="metric">
            <text class="metric-value">{{ energyDensity }}<text class="metric-unit">kcal/kg</text></text>
            <text class="metric-label">能量密度</text>
          </view>
        </view>
      </view>

      <!-- 配料 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">配料（{{ ingredients.length }} 项）</text>
          <text v-if="nutritionStandard" class="card-note">{{ nutritionStandard }}</text>
        </view>

        <view v-if="ingredients.length === 0" class="empty">这一版快照里没有配料明细</view>

        <view v-for="(item, index) in ingredients" :key="index" class="ingredient">
          <text class="ingredient-index">{{ index + 1 }}</text>
          <view class="ingredient-main">
            <text class="ingredient-name">{{ item.name || '未命名原料' }}</text>
            <text v-if="item.methodLabel" class="ingredient-method">{{ item.methodLabel }}</text>
          </view>
          <text class="ingredient-ratio">{{ item.ratioLabel }}</text>
        </view>
      </view>

      <view class="foot">
        <text class="foot-text">员工只读视图 · 不能在这里修改任何配方</text>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

interface SnapshotData {
  itemId: string
  orderId: string
  orderNo: string | null
  customerName: string | null
  createdAt: string
  targetProductionDate: string | null
  dog: { id: string; name: string } | null
  quantityG: number | null
  packageCount: number | null
  packageSpecG: number | null
  dailyIntakeG: number | null
  snapshot: any
}

const itemId = ref('')
const loading = ref(true)
const errorText = ref('')
const data = ref<SnapshotData | null>(null)

const snapshot = computed(() => data.value?.snapshot || {})

const snapshotName = computed(() => String(snapshot.value.name || '食谱快照'))

const snapshotVersion = computed(() => {
  const version = snapshot.value.version
  return version ? String(version) : ''
})

const energyDensity = computed(() => {
  const value = snapshot.value.energy_density_kcal_per_kg
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return '—'
  return num.toFixed(0)
})

const nutritionStandard = computed(() =>
  String(snapshot.value.nutrition_standard || ''),
)

interface IngredientRow {
  name: string
  ratioLabel: string
  methodLabel: string
}

/**
 * 快照里的 `items` 是**下单那一刻**的原始 JSON（snake_case），
 * 和食谱详情页里那份驼峰数据不是一套，别混着读。
 */
const ingredients = computed<IngredientRow[]>(() => {
  const list = snapshot.value.items
  if (!Array.isArray(list)) return []
  return list.map((item: any) => {
    const ratio = Number(item?.ratio)
    const methods = item?.preparation_methods
    return {
      name: String(item?.name || item?.nutrition_food_name || ''),
      ratioLabel: Number.isFinite(ratio) && ratio > 0 ? `${formatNumber(ratio)}%` : '—',
      methodLabel: Array.isArray(methods) && methods.length ? methods.join(' / ') : '',
    }
  })
})

function formatNumber(value: any) {
  if (value === null || value === undefined || value === '') return '0'
  const num = Number(value)
  if (Number.isNaN(num)) return '0'
  return Number.isInteger(num) ? String(num) : num.toFixed(1)
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

async function load() {
  if (!itemId.value) {
    errorText.value = '缺少订单项，无法查看快照'
    loading.value = false
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const res = await request({
      url: `/admin/order-center/items/${encodeURIComponent(itemId.value)}/snapshot`,
      method: 'GET',
    })
    if (res.code === 0 && res.data) {
      data.value = res.data as SnapshotData
    } else {
      errorText.value = res.message || '这一单的食谱快照读不到'
    }
  } catch (error: any) {
    errorText.value = error?.message || '网络异常，请稍后重试'
  } finally {
    loading.value = false
  }
}

onLoad((options: any) => {
  itemId.value = Array.isArray(options?.itemId)
    ? options.itemId[0]
    : options?.itemId || ''
  load()
})
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx 24rpx 40rpx; box-sizing: border-box; }

.state { padding: 140rpx 0; text-align: center; }
.state-text { display: block; color: #909399; font-size: 26rpx; }
.state-retry { display: inline-block; margin-top: 24rpx; padding: 12rpx 32rpx; border-radius: 30rpx; background: #1e3a2f; color: #fff; font-size: 26rpx; }

.hero { background: #1e3a2f; border-radius: 20rpx; padding: 28rpx 26rpx; margin-bottom: 18rpx; }
.hero-top { display: flex; align-items: center; }
.hero-name { flex: 1; font-size: 36rpx; font-weight: 700; color: #fff; line-height: 1.3; }
.version-chip { margin-left: 16rpx; padding: 4rpx 14rpx; border-radius: 20rpx; background: rgba(255, 255, 255, 0.18); color: #fff; font-size: 22rpx; }
.hero-badges { display: flex; flex-wrap: wrap; margin-top: 18rpx; }
.badge { padding: 6rpx 16rpx; border-radius: 8rpx; background: #e8f1ec; color: #1e3a2f; font-size: 21rpx; margin-right: 12rpx; }
.badge.ghost { background: rgba(255, 255, 255, 0.16); color: #fff; }
.notice { display: block; margin-top: 18rpx; color: rgba(255, 255, 255, 0.72); font-size: 22rpx; line-height: 1.6; }

.card { background: #fff; border-radius: 18rpx; padding: 24rpx; margin-bottom: 18rpx; }
.card-head { display: flex; justify-content: space-between; align-items: baseline; }
.card-title { font-size: 27rpx; font-weight: 600; color: #1e3a2f; }
.card-note { color: #909399; font-size: 21rpx; }

.row { display: flex; justify-content: space-between; align-items: flex-start; padding: 12rpx 0; }
.row + .row { border-top: 1rpx solid #f2f3f5; }
.label { flex: none; color: #909399; font-size: 24rpx; }
.value { margin-left: 24rpx; color: #303133; font-size: 25rpx; text-align: right; word-break: break-all; }
.mono { font-family: Menlo, Consolas, monospace; font-size: 23rpx; }

.metric-grid { display: flex; flex-wrap: wrap; margin-top: 18rpx; }
.metric { width: 50%; padding: 10rpx 0; box-sizing: border-box; }
.metric-value { display: block; font-size: 34rpx; font-weight: 700; color: #1e3a2f; }
.metric-unit { margin-left: 4rpx; font-size: 21rpx; font-weight: 400; color: #909399; }
.metric-label { display: block; margin-top: 6rpx; color: #909399; font-size: 21rpx; }

.ingredient { display: flex; align-items: center; padding: 16rpx 0; border-top: 1rpx solid #f2f3f5; }
.ingredient:first-of-type { border-top: none; }
.ingredient-index { flex: none; width: 40rpx; color: #c0c4cc; font-size: 22rpx; }
.ingredient-main { flex: 1; min-width: 0; }
.ingredient-name { font-size: 26rpx; color: #303133; }
.ingredient-method { display: block; margin-top: 4rpx; color: #909399; font-size: 21rpx; }
.ingredient-ratio { flex: none; margin-left: 16rpx; color: #1e3a2f; font-size: 25rpx; font-weight: 600; }

.empty { padding: 40rpx 0; text-align: center; color: #909399; font-size: 24rpx; }
.foot { padding: 20rpx 0 0; text-align: center; }
.foot-text { color: #b8bcc4; font-size: 21rpx; }
</style>

<template>
  <view v-if="dogId" class="weight-section">
    <!-- 体重记录 -->
    <view class="section-card weight-record-card">
      <text class="section-card__title">体重记录</text>
      <text class="section-card__desc">记录每次称重，观察体重趋势，及时调整饭量。</text>

      <view class="input-card">
        <view class="input-item">
          <text class="input-label">记录日期</text>
          <picker mode="date" :value="formData.recordDate" @change="onDateChange">
            <view class="picker-button">
              {{ formData.recordDate || '请选择日期' }} ▼
            </view>
          </picker>
        </view>

        <view class="input-item">
          <text class="input-label">体重（kg）</text>
          <input
            class="input-field"
            type="digit"
            v-model="formData.weightKg"
            placeholder="请输入体重"
          />
        </view>

        <view class="input-item">
          <text class="input-label">备注（可选）</text>
          <input
            class="input-field"
            type="text"
            v-model="formData.note"
            placeholder="如：饭后测量、运动后等"
          />
        </view>
      </view>

      <view class="sync-option">
        <view class="sync-option__copy">
          <text class="sync-option__title">同时更新档案当前体重</text>
          <text class="sync-option__desc">{{ syncOptionDescription }}</text>
        </view>
        <switch
          class="sync-option__switch"
          color="#0d6b43"
          :checked="syncToProfile"
          @change="onSyncToggle"
        />
      </view>

      <button
        class="save-btn"
        :loading="isSavingRecord"
        :disabled="isSavingRecord"
        @tap="saveRecord"
      >
        {{ isSavingRecord ? '保存中...' : '保存记录' }}
      </button>
    </view>

    <!-- 体重趋势图 -->
    <view v-if="records.length > 0" class="section-card weight-chart-card">
      <text class="section-card__title">体重趋势（最近10次）</text>
      <view class="chart-container">
        <canvas
          canvas-id="weightChart"
          id="weightChart"
          class="chart-canvas"
          :style="{ width: '100%', height: '200px' }"
        ></canvas>
      </view>
    </view>

    <!-- 历史记录 -->
    <view v-if="records.length > 0" class="section-card weight-history-card">
      <text class="section-card__title">历史记录</text>

      <view class="record-list">
        <view
          v-for="(record, index) in records"
          :key="record.id"
          class="record-item"
        >
          <view class="record-main">
            <view class="record-date">{{ record.recordDate }}</view>
            <view class="record-weight">{{ record.weightKg }} kg</view>
            <view class="record-change" :class="getChangeClass(record, index)">
              {{ getChangeText(record, index) }}
            </view>
          </view>
          <view v-if="record.note" class="record-note">{{ record.note }}</view>
          <view class="record-actions">
            <text
              v-if="lastSyncedRecordId === record.id"
              class="sync-badge"
            >✓ 已同步到档案</text>
            <text
              class="delete-btn"
              @tap="deleteRecord(record.id)"
            >删除</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { request } from '../../utils/api'
import {
  formatWeightChangeText,
  formatWeightRecordDateTick,
  getWeightChartDateTickIndexes,
  getWeightSyncSignalKey,
  getWeightSyncValueKey,
  shouldDefaultSyncCurrentWeightRecord,
} from '../../utils/weight-management'

interface WeightRecord {
  id: string
  recordDate: string
  weightKg: number
  note?: string
  syncedToProfile: boolean
}

interface FormData {
  recordDate: string
  weightKg: string
  note: string
}

const props = defineProps<{
  dogId: string
  dogProfile?: {
    currentWeightKg?: number | null
  }
}>()

const records = ref<WeightRecord[]>([])
const isSavingRecord = ref(false)
const syncToProfile = ref(false)
const syncToProfileTouched = ref(false)

const formData = ref<FormData>({
  recordDate: new Date().toISOString().split('T')[0],
  weightKg: '',
  note: '',
})

// 找到最近同步的记录ID
const lastSyncedRecordId = computed(() => {
  const syncedRecords = records.value.filter((r) => r.syncedToProfile)
  if (syncedRecords.length === 0) return null

  // 记录按日期降序排列，所以第一个就是最新的
  return syncedRecords[0].id
})

const syncOptionDescription = computed(() => {
  const latestRecordDate = records.value[0]?.recordDate || ''
  if (latestRecordDate && formData.value.recordDate < latestRecordDate) {
    return '补录较早日期时，建议先只保存历史记录。'
  }

  return '开启后会把这次记录同步为档案里的当前体重。'
})

watch(
  () => props.dogId,
  (nextDogId, prevDogId) => {
    if (nextDogId && nextDogId !== prevDogId) {
      resetForDog()
      void loadRecords()
    }
  },
)

onMounted(() => {
  if (props.dogId) {
    void loadRecords()
  }
})

function resetForDog() {
  records.value = []
  formData.value.weightKg = ''
  formData.value.note = ''
  formData.value.recordDate = new Date().toISOString().split('T')[0]
  syncToProfileTouched.value = false
  syncToProfile.value = resolveDefaultSyncToProfile()
}

// 加载体重记录
async function loadRecords() {
  if (!props.dogId) return

  try {
    const res = await request({
      url: `/dogs/${props.dogId}/weight-records`,
      method: 'GET',
    })

    if (res.code === 0 && res.data) {
      records.value = res.data.records || []
      if (!syncToProfileTouched.value) {
        syncToProfile.value = resolveDefaultSyncToProfile()
      }

      // 绘制图表
      if (records.value.length > 0) {
        await nextTick()
        drawChart()
      }
    }
  } catch (err) {
    console.error('[WeightManagementSection] Failed to load records:', err)
  }
}

// 日期改变
function onDateChange(e: any) {
  formData.value.recordDate = e.detail.value
}

function onSyncToggle(e: any) {
  syncToProfileTouched.value = true
  syncToProfile.value = !!e.detail.value
}

function resolveDefaultSyncToProfile() {
  const currentWeight = props.dogProfile?.currentWeightKg ?? null
  const newWeight = parseFloat(formData.value.weightKg || '')
  const latestRecordDate = records.value[0]?.recordDate || null

  return shouldDefaultSyncCurrentWeightRecord({
    currentWeightKg: currentWeight,
    newWeightKg: newWeight,
    recordDate: formData.value.recordDate,
    latestRecordDate,
  })
}

// 保存记录
async function saveRecord() {
  if (!props.dogId) {
    uni.showToast({
      title: '请先选择狗狗',
      icon: 'none',
    })
    return
  }

  // 验证输入
  if (!formData.value.weightKg || parseFloat(formData.value.weightKg) <= 0) {
    uni.showToast({
      title: '请输入有效的体重',
      icon: 'none',
    })
    return
  }

  const newWeight = parseFloat(formData.value.weightKg)
  isSavingRecord.value = true
  try {
    // 创建体重记录
    const res = await request({
      url: `/dogs/${props.dogId}/weight-records`,
      method: 'POST',
      data: {
        recordDate: formData.value.recordDate,
        weightKg: newWeight,
        note: formData.value.note || undefined,
      },
    })

    if (res.code === 0) {
      const syncRequested = syncToProfile.value
      let syncedToProfile = false
      if (syncRequested) {
        syncedToProfile = await updateDogWeight(newWeight)
        if (syncedToProfile) {
          await markRecordAsSynced(res.data.id)
        }
      }

      await loadRecords()
      formData.value.weightKg = ''
      formData.value.note = ''
      formData.value.recordDate = new Date().toISOString().split('T')[0]
      syncToProfileTouched.value = false
      syncToProfile.value = resolveDefaultSyncToProfile()

      uni.showToast({
        title: syncRequested
          ? syncedToProfile
            ? '已保存并同步到档案'
            : '已保存记录，同步失败'
          : '已保存记录',
        icon: 'success',
      })
    }
  } catch (err) {
    console.error('[WeightManagementSection] Failed to save record:', err)
    uni.showToast({
      title: '保存失败',
      icon: 'none',
    })
  } finally {
    isSavingRecord.value = false
  }
}

// 更新狗狗档案体重
async function updateDogWeight(weightKg: number) {
  if (!props.dogId) return false

  try {
    await request({
      url: `/dogs/${props.dogId}`,
      method: 'PUT',
      data: {
        currentWeightKg: weightKg,
      },
    })

    uni.setStorageSync(getWeightSyncSignalKey(props.dogId), Date.now())
    uni.setStorageSync(getWeightSyncValueKey(props.dogId), weightKg)
    return true
  } catch (err) {
    console.error('[WeightManagementSection] Failed to update dog weight:', err)
    return false
  }
}

// 标记记录为已同步
async function markRecordAsSynced(recordId: string) {
  try {
    await request({
      url: `/dogs/weight-records/${recordId}/sync`,
      method: 'PUT',
      data: { synced: true },
    })
  } catch (err) {
    console.error('[WeightManagementSection] Failed to mark record as synced:', err)
  }
}

// 删除记录
async function deleteRecord(recordId: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条记录吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: `/dogs/weight-records/${recordId}`,
            method: 'DELETE',
          })

          await loadRecords()

          uni.showToast({
            title: '删除成功',
            icon: 'success',
          })
        } catch (err) {
          console.error('[WeightManagementSection] Failed to delete record:', err)
          uni.showToast({
            title: '删除失败',
            icon: 'none',
          })
        }
      }
    },
  })
}

// 获取体重变化文字
function getChangeText(record: WeightRecord, index: number): string {
  if (index === records.value.length - 1) {
    return ''
  }

  const prevRecord = records.value[index + 1]
  return formatWeightChangeText(record.weightKg, prevRecord.weightKg)
}

// 获取变化样式类
function getChangeClass(record: WeightRecord, index: number): string {
  if (index === records.value.length - 1) {
    return ''
  }

  const prevRecord = records.value[index + 1]
  const diff = record.weightKg - prevRecord.weightKg

  if (diff > 0) {
    return 'increase'
  } else if (diff < 0) {
    return 'decrease'
  } else {
    return 'stable'
  }
}

// 绘制图表
function drawChart() {
  const ctx = uni.createCanvasContext('weightChart')

  // 获取系统信息来计算正确的 canvas 尺寸
  // @ts-ignore - getWindowInfo may not exist in all platforms
  const windowInfo = uni.getWindowInfo?.() || uni.getSystemInfoSync?.()
  const screenWidth = windowInfo?.windowWidth || 375

  // 计算实际可用宽度（页面宽度 - padding 48rpx - section padding 60rpx）
  const canvasWidth = Math.floor(screenWidth * 0.86)
  const canvasHeight = 200 // 对应 CSS 的 400rpx (2rpx ≈ 1px)

  // 优化后的边距：让坐标轴贴近容器边缘
  const padding = {
    left: 20, // Y轴贴近左边
    right: 30, // 右边留更多空间（给数值标注，防止超出）
    top: 20, // 上边留白（给数值标注）
    bottom: 15, // X轴贴近下边
  }

  // 获取最近10条记录（反转顺序，从旧到新）
  const chartData = records.value.slice(0, 10).reverse()

  if (chartData.length === 0) return

  // 计算最大最小值
  const weights = chartData.map((r) => r.weightKg)
  const maxWeight = Math.max(...weights) + 1
  const minWeight = Math.min(...weights) - 1
  const weightRange = maxWeight - minWeight

  // 绘制坐标轴
  ctx.setStrokeStyle('#ddd')
  ctx.setLineWidth(1)

  // Y轴（贴近左边）
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top)
  ctx.lineTo(padding.left, canvasHeight - padding.bottom)
  ctx.stroke()

  // X轴（贴近下边）
  ctx.beginPath()
  ctx.moveTo(padding.left, canvasHeight - padding.bottom)
  ctx.lineTo(canvasWidth - padding.right, canvasHeight - padding.bottom)
  ctx.stroke()

  // 绘制数据点和连线
  ctx.setStrokeStyle('#0d6b43')
  ctx.setFillStyle('#0d6b43')
  ctx.setLineWidth(2)

  // 计算可用绘图区域
  const chartWidth = canvasWidth - padding.left - padding.right
  const chartHeight = canvasHeight - padding.top - padding.bottom

  const points = chartData.map((record, index) => {
    const x = padding.left + (index / (chartData.length - 1 || 1)) * chartWidth
    const y =
      canvasHeight -
      padding.bottom -
      ((record.weightKg - minWeight) / weightRange) * chartHeight
    return { x, y, weight: record.weightKg, recordDate: record.recordDate }
  })

  // 绘制连线
  ctx.beginPath()
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y)
    } else {
      ctx.lineTo(point.x, point.y)
    }
  })
  ctx.stroke()

  // 绘制数据点和数值
  points.forEach((point) => {
    // 点
    ctx.beginPath()
    ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI)
    ctx.fill()

    // 数值（智能调整位置，防止超出容器）
    ctx.setFontSize(11)
    const text = point.weight.toFixed(1)
    const textWidth = text.length * 6 // 估算文字宽度

    let textX = point.x - textWidth / 2
    // 确保文字不超出边界
    if (textX < padding.left) {
      textX = padding.left
    }
    if (textX + textWidth > canvasWidth - padding.right) {
      textX = canvasWidth - padding.right - textWidth
    }

    ctx.fillText(text, textX, point.y - 10)
  })

  ctx.setFillStyle('#8b97a8')
  ctx.setFontSize(10)
  const tickIndexes = new Set(getWeightChartDateTickIndexes(points.length))
  points.forEach((point, index) => {
    if (!tickIndexes.has(index)) {
      return
    }

    const text = formatWeightRecordDateTick(point.recordDate)
    const textWidth = text.length * 5
    let textX = point.x - textWidth / 2
    if (textX < padding.left) {
      textX = padding.left
    }
    if (textX + textWidth > canvasWidth - padding.right) {
      textX = canvasWidth - padding.right - textWidth
    }
    ctx.fillText(text, textX, canvasHeight - 2)
  })

  ctx.draw()
}
</script>

<style scoped>
.weight-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.section-card {
  padding: 30rpx;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 32rpx rgba(24, 40, 60, 0.08);
}

.section-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #17313f;
}

.section-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b7d86;
}

/* 输入卡片 */
.input-card {
  margin-top: 20rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
  border-radius: 22rpx;
  padding: 20rpx;
}

.input-item {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.input-item:last-child {
  margin-bottom: 0;
}

.input-label {
  font-size: 26rpx;
  color: #415b65;
  width: 200rpx;
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
}

.picker-button {
  flex: 1;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
}

.sync-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 20rpx;
}

.sync-option__copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.sync-option__title {
  font-size: 26rpx;
  color: #17313f;
  font-weight: 600;
}

.sync-option__desc {
  font-size: 22rpx;
  color: #7a8699;
  line-height: 1.5;
}

.sync-option__switch {
  transform: scale(0.9);
  transform-origin: right center;
}

/* 保存按钮 */
.save-btn {
  width: 100%;
  height: 88rpx;
  margin-top: 24rpx;
  background: linear-gradient(135deg, #0d6b43 0%, #0c8a55 100%);
  color: white;
  border: none;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: bold;
}

.save-btn::after {
  border: none;
}

.save-btn[disabled] {
  opacity: 0.6;
  color: white;
  background: linear-gradient(135deg, #0d6b43 0%, #0c8a55 100%);
}

/* 图表 */
.chart-container {
  margin-top: 20rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
  border-radius: 22rpx;
  padding: 20rpx;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
}

.chart-canvas {
  width: 100%;
  height: 400rpx;
  display: block;
}

/* 记录列表 */
.record-list {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.record-item {
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
  border-radius: 16rpx;
  padding: 20rpx;
}

.record-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.record-date {
  font-size: 26rpx;
  color: #6b7d86;
  flex: 1;
}

.record-weight {
  font-size: 32rpx;
  font-weight: bold;
  color: #17313f;
  margin-right: 20rpx;
}

.record-change {
  font-size: 24rpx;
  font-weight: bold;
  min-width: 80rpx;
  text-align: right;
}

.record-change.increase {
  color: #e74c3c;
}

.record-change.decrease {
  color: #27ae60;
}

.record-change.stable {
  color: #999;
}

.record-note {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.record-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1px solid #e0e0e0;
}

.sync-badge {
  font-size: 22rpx;
  color: #27ae60;
  background: #e8f5e9;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

.delete-btn {
  font-size: 24rpx;
  color: #e74c3c;
  margin-left: auto;
}
</style>

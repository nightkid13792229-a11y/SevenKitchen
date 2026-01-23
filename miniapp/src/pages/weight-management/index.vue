<template>
  <view class="container">
    <!-- 步骤1：选择狗狗 -->
    <view class="section">
      <view class="section-title">📌 步骤1：选择狗狗</view>

      <picker mode="selector" :range="dogs" range-key="name" :value="selectedDogIndex" @change="onDogPickerChange">
        <view class="dog-selector">
          <view class="selector-button">
            <text class="selector-text">
              {{ selectedDog ? selectedDog.name : '请选择狗狗' }}
            </text>
            <text class="selector-arrow">▼</text>
          </view>
        </view>
      </picker>

      <!-- 狗狗信息卡片 -->
      <view v-if="selectedDog" class="dog-info-card">
        <view class="dog-name-row">
          <text class="dog-name">{{ selectedDog.name }}</text>
          <text class="dog-gender" :class="selectedDog.gender === 'MALE' ? 'male' : 'female'">
            {{ selectedDog.gender === 'MALE' ? '♂' : '♀' }}
          </text>
        </view>
        <text class="dog-breed">{{ selectedDog.breedName || '未知品种' }}</text>
        <view class="dog-stats">
          <text class="stat-text">{{ selectedDog.currentWeightKg }}kg</text>
          <text class="stat-text">·</text>
          <text class="stat-text">{{ calculateAge(selectedDog.birthday) }}</text>
        </view>
        <view class="current-weight">
          <text class="weight-label">档案体重：</text>
          <text class="weight-value">{{ selectedDog.currentWeightKg }} kg</text>
        </view>
      </view>
    </view>

    <!-- 步骤2：添加体重记录 -->
    <view v-if="selectedDog" class="section">
      <view class="section-title">📌 步骤2：添加记录</view>

      <view class="input-group">
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
      </view>

      <button class="save-btn" @tap="saveRecord">保存记录</button>
    </view>

    <!-- 步骤3：体重趋势图 -->
    <view v-if="selectedDog && records.length > 0" class="section">
      <view class="section-title">📊 体重趋势（最近10次）</view>
      <view class="chart-container">
        <canvas
          canvas-id="weightChart"
          id="weightChart"
          class="chart-canvas"
          :style="{width: '100%', height: '200px'}"
        ></canvas>
      </view>
    </view>

    <!-- 步骤4：历史记录 -->
    <view v-if="selectedDog && records.length > 0" class="section">
      <view class="section-title">📝 历史记录</view>

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
import { ref, onMounted, nextTick, computed } from 'vue'
import { request, getToken } from '../../utils/api'

interface DogProfile {
  id: string
  name: string
  gender?: string
  breedName?: string
  birthday: string
  currentWeightKg?: number
}

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

// 找到最近同步的记录ID
const lastSyncedRecordId = computed(() => {
  const syncedRecords = records.value.filter(r => r.syncedToProfile)
  if (syncedRecords.length === 0) return null

  // 记录按日期降序排列，所以第一个就是最新的
  return syncedRecords[0].id
})

// 数据
const dogs = ref<DogProfile[]>([])
const selectedDog = ref<DogProfile | null>(null)
const selectedDogIndex = ref<number>(-1)
const records = ref<WeightRecord[]>([])

const formData = ref<FormData>({
  recordDate: new Date().toISOString().split('T')[0],
  weightKg: '',
  note: ''
})

// 页面加载
onMounted(async () => {
  // 检查登录状态
  const token = getToken()
  if (!token) {
    uni.showModal({
      title: '提示',
      content: '请先登录后使用体重管理功能',
      showCancel: false,
      success: () => {
        uni.navigateTo({
          url: '/pages/login/index'
        })
      }
    })
    return
  }

  await loadDogs()
})

// 加载狗狗列表
async function loadDogs() {
  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      dogs.value = Array.isArray(res.data) ? res.data : []
      console.info('[WeightManagement] Loaded dogs:', dogs.value.length)
    }
  } catch (err) {
    console.error('[WeightManagement] Failed to load dogs:', err)
    uni.showToast({
      title: '加载狗狗列表失败',
      icon: 'none'
    })
  }
}

// 狗狗选择器改变事件
function onDogPickerChange(e: any) {
  console.log('[WeightManagement] Dog picker changed, index:', e.detail.value)

  if (dogs.value.length === 0) {
    console.warn('[WeightManagement] No dogs available, showing prompt')
    uni.showModal({
      title: '提示',
      content: '您还没有创建狗狗档案，是否立即创建？',
      confirmText: '去创建',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          uni.navigateTo({
            url: '/pages/dog-create/index'
          })
        }
      }
    })
    return
  }

  const index = e.detail.value
  console.log('[WeightManagement] Dog selected at index:', index)
  selectDog(index)
}

// 选择狗狗
async function selectDog(index: number) {
  selectedDogIndex.value = index
  selectedDog.value = dogs.value[index]
  records.value = []
  formData.value.weightKg = ''

  console.log('[WeightManagement] Selected dog:', selectedDog.value?.name)

  // 加载体重记录
  await loadRecords()
}

// 加载体重记录
async function loadRecords() {
  if (!selectedDog.value) return

  try {
    const res = await request({
      url: `/dogs/${selectedDog.value.id}/weight-records`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      records.value = res.data.records || []
      console.info('[WeightManagement] Loaded records:', records.value.length)

      // 绘制图表
      if (records.value.length > 0) {
        await nextTick()
        drawChart()
      }
    }
  } catch (err) {
    console.error('[WeightManagement] Failed to load records:', err)
  }
}

// 日期改变
function onDateChange(e: any) {
  formData.value.recordDate = e.detail.value
}

// 保存记录
async function saveRecord() {
  if (!selectedDog.value) {
    uni.showToast({
      title: '请先选择狗狗',
      icon: 'none'
    })
    return
  }

  // 验证输入
  if (!formData.value.weightKg || parseFloat(formData.value.weightKg) <= 0) {
    uni.showToast({
      title: '请输入有效的体重',
      icon: 'none'
    })
    return
  }

  const newWeight = parseFloat(formData.value.weightKg)

  try {
    // 创建体重记录
    const res = await request({
      url: `/dogs/${selectedDog.value.id}/weight-records`,
      method: 'POST',
      data: {
        recordDate: formData.value.recordDate,
        weightKg: newWeight,
        note: formData.value.note || undefined
      }
    })

    if (res.code === 0) {
      console.info('[WeightManagement] Record created:', res.data)

      // 检查是否需要更新档案体重
      const currentWeight = selectedDog.value.currentWeightKg || 0

      // 检查记录日期是否是最新的（在历史记录中）
      const isNewestDate = records.value.length === 0 ||
        formData.value.recordDate >= records.value[0].recordDate

      if (newWeight !== currentWeight && isNewestDate) {
        // 只有体重不同且日期是最新的，才弹窗询问是否更新
        uni.showModal({
          title: '💡 提示',
          content: `已成功记录体重数据\n\n是否同时更新"爱犬信息"中的当前体重？\n\n当前体重：${currentWeight} kg\n本次记录：${newWeight} kg`,
          confirmText: '确定更新',
          cancelText: '取消',
          success: async (modalRes) => {
            if (modalRes.confirm) {
              await updateDogWeight(newWeight)
              await markRecordAsSynced(res.data.id)
            }

            // 重新加载记录
            await loadRecords()
            formData.value.weightKg = ''
            formData.value.note = ''
            formData.value.recordDate = new Date().toISOString().split('T')[0]

            uni.showToast({
              title: '保存成功',
              icon: 'success'
            })
          }
        })
      } else {
        // 体重相同或日期不是最新的，直接保存
        await loadRecords()
        formData.value.weightKg = ''
        formData.value.note = ''
        formData.value.recordDate = new Date().toISOString().split('T')[0]

        uni.showToast({
          title: '保存成功',
          icon: 'success'
        })
      }
    }
  } catch (err) {
    console.error('[WeightManagement] Failed to save record:', err)
    uni.showToast({
      title: '保存失败',
      icon: 'none'
    })
  }
}

// 更新狗狗档案体重
async function updateDogWeight(weightKg: number) {
  if (!selectedDog.value) return

  try {
    await request({
      url: `/dogs/${selectedDog.value.id}`,
      method: 'PUT',
      data: {
        currentWeightKg: weightKg
      }
    })

    console.info('[WeightManagement] Dog weight updated:', weightKg)

    // 更新本地数据
    selectedDog.value.currentWeightKg = weightKg
  } catch (err) {
    console.error('[WeightManagement] Failed to update dog weight:', err)
  }
}

// 标记记录为已同步
async function markRecordAsSynced(recordId: string) {
  try {
    await request({
      url: `/dogs/weight-records/${recordId}/sync`,
      method: 'PUT',
      data: { synced: true }
    })

    console.info('[WeightManagement] Record marked as synced:', recordId)
  } catch (err) {
    console.error('[WeightManagement] Failed to mark record as synced:', err)
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
            method: 'DELETE'
          })

          console.info('[WeightManagement] Record deleted:', recordId)

          await loadRecords()

          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
        } catch (err) {
          console.error('[WeightManagement] Failed to delete record:', err)
          uni.showToast({
            title: '删除失败',
            icon: 'none'
          })
        }
      }
    }
  })
}

// 获取体重变化文字
function getChangeText(record: WeightRecord, index: number): string {
  if (index === records.value.length - 1) {
    return ''
  }

  const prevRecord = records.value[index + 1]
  const diff = record.weightKg - prevRecord.weightKg

  if (diff > 0) {
    return `↑${diff.toFixed(1)}`
  } else if (diff < 0) {
    return `↓${Math.abs(diff).toFixed(1)}`
  } else {
    return '→'
  }
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

// 计算年龄
function calculateAge(birthday: string): string {
  const birth = new Date(birthday)
  const now = new Date()
  const months = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30))

  if (months < 12) {
    return `${months}个月`
  }
  const years = Math.floor(months / 12)
  return `${years}岁`
}

// 绘制图表
function drawChart() {
  const ctx = uni.createCanvasContext('weightChart')

  // 获取系统信息来计算正确的 canvas 尺寸（使用新API）
  // @ts-ignore - getWindowInfo may not exist in all platforms
  const windowInfo = uni.getWindowInfo?.() || uni.getSystemInfoSync?.()
  const screenWidth = windowInfo?.windowWidth || 375
  const dpr = windowInfo?.pixelRatio || 1

  // 计算实际可用宽度（页面宽度 - padding 40rpx - section padding 48rpx）
  // 750rpx = screenWidth px
  // canvasWidth ≈ screenWidth - 40rpx - 48rpx = screenWidth * (662/750) ≈ screenWidth * 0.88
  const canvasWidth = Math.floor(screenWidth * 0.88)
  const canvasHeight = 200 // 对应 CSS 的 400rpx (2rpx ≈ 1px)

  // 优化后的边距：让坐标轴贴近容器边缘
  const padding = {
    left: 20,    // Y轴贴近左边（增加一点空间）
    right: 30,   // 右边留更多空间（给数值标注，防止超出）
    top: 20,     // 上边留白（给数值标注）
    bottom: 15   // X轴贴近下边
  }

  // 获取最近10条记录（反转顺序，从旧到新）
  const chartData = records.value.slice(0, 10).reverse()

  if (chartData.length === 0) return

  // 计算最大最小值
  const weights = chartData.map(r => r.weightKg)
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
  ctx.setStrokeStyle('#667eea')
  ctx.setFillStyle('#667eea')
  ctx.setLineWidth(2)

  // 计算可用绘图区域
  const chartWidth = canvasWidth - padding.left - padding.right
  const chartHeight = canvasHeight - padding.top - padding.bottom

  const points = chartData.map((record, index) => {
    const x = padding.left + (index / (chartData.length - 1 || 1)) * chartWidth
    const y = canvasHeight - padding.bottom - ((record.weightKg - minWeight) / weightRange) * chartHeight
    return { x, y, weight: record.weightKg }
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
  points.forEach((point, index) => {
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

  ctx.draw()
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding: 20rpx;
  padding-bottom: 40rpx;
}

.section {
  background: white;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

/* 狗狗选择器 */
.dog-selector {
  margin-bottom: 20rpx;
}

.selector-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 8rpx;
  padding: 24rpx;
}

.selector-text {
  font-size: 28rpx;
  color: #333;
}

.selector-arrow {
  font-size: 24rpx;
  color: #999;
}

/* 狗狗信息卡片 */
.dog-info-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12rpx;
  padding: 24rpx;
  color: white;
}

.dog-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.dog-name {
  font-size: 32rpx;
  font-weight: bold;
}

.dog-gender {
  font-size: 28rpx;
  font-weight: bold;
}

.dog-gender.male {
  color: #a0d8ff;
}

.dog-gender.female {
  color: #ffb3ba;
}

.dog-breed {
  font-size: 26rpx;
  opacity: 0.9;
  margin-bottom: 12rpx;
  display: block;
}

.dog-stats {
  display: flex;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.stat-text {
  font-size: 24rpx;
  opacity: 0.9;
}

.current-weight {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
}

.weight-label {
  font-size: 24rpx;
  opacity: 0.9;
}

.weight-value {
  font-size: 32rpx;
  font-weight: bold;
}

/* 输入组 */
.input-group {
  margin-bottom: 20rpx;
}

.input-card {
  background: #f8f8f8;
  border-radius: 8rpx;
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
  color: #666;
  width: 200rpx;
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
}

.picker-button {
  flex: 1;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
}

/* 按钮 */
.save-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  margin-top: 20rpx;
}

.save-btn::after {
  border: none;
}

/* 图表 */
.chart-container {
  background: #f8f8f8;
  border-radius: 8rpx;
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
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.record-item {
  background: #f8f8f8;
  border-radius: 8rpx;
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
  color: #666;
  flex: 1;
}

.record-weight {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
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

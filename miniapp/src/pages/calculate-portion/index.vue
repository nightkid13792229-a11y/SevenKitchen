<template>
  <view class="container">
    <!-- 步骤1：选择狗狗 -->
    <view class="section">
      <view class="section-title">📌 步骤1：选择狗狗</view>

      <view class="dog-selector" @tap="showDogPicker">
        <view class="selector-button">
          <text class="selector-text">
            {{ selectedDog ? selectedDog.name : '请选择狗狗' }}
          </text>
          <text class="selector-arrow">▼</text>
        </view>
      </view>

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
          <text class="stat-text">·</text>
          <text class="stat-text">{{ selectedDog.isNeutered ? '已绝育' : '未绝育' }}</text>
        </view>
        <view class="daily-energy">
          <text class="energy-label">每日热量需求：</text>
          <text class="energy-value">{{ calculateDER() }} kcal</text>
        </view>
      </view>
    </view>

    <!-- 步骤2：输入狗粮信息 -->
    <view class="section">
      <view class="section-title">📌 步骤2：输入狗粮信息</view>

      <!-- 输入模式切换 -->
      <view class="mode-tabs">
        <view
          :class="['tab', { active: inputMode === 'direct' }]"
          @tap="switchMode('direct')"
        >
          直接输入热量密度
        </view>
        <view
          :class="['tab', { active: inputMode === 'atwater' }]"
          @tap="switchMode('atwater')"
        >
          通过营养成分计算
        </view>
      </view>

      <!-- 直接输入热量密度模式 -->
      <view v-if="inputMode === 'direct'" class="input-group">
        <view class="input-card">
          <view class="input-item">
            <text class="input-label">热量密度值</text>
            <input
              class="input-field"
              type="digit"
              v-model="foodInfo.energyDensity"
              placeholder="请输入热量密度值"
            />
          </view>

          <view class="input-item">
            <text class="input-label">单位</text>
            <picker
              :range="energyUnits"
              :value="energyUnitIndex"
              @change="onEnergyUnitChange"
            >
              <view class="picker-button">
                {{ energyUnits[energyUnitIndex] }} ▼
              </view>
            </picker>
          </view>
        </view>
      </view>

      <!-- 阿特沃特公式模式 -->
      <view v-if="inputMode === 'atwater'" class="input-group">
        <view class="input-card">
          <view class="input-item">
            <text class="input-label">蛋白质占比 (%)</text>
            <input
              class="input-field"
              type="digit"
              v-model="foodInfo.protein"
              placeholder="0"
              @input="calculateAtwater"
            />
          </view>

          <view class="input-item">
            <text class="input-label">脂肪占比 (%)</text>
            <input
              class="input-field"
              type="digit"
              v-model="foodInfo.fat"
              placeholder="0"
              @input="calculateAtwater"
            />
          </view>

          <view class="input-item">
            <text class="input-label">水分 (%)</text>
            <input
              class="input-field"
              type="digit"
              v-model="foodInfo.moisture"
              placeholder="0"
              @input="calculateAtwater"
            />
          </view>

          <view class="input-item">
            <text class="input-label">灰分 (%)</text>
            <input
              class="input-field"
              type="digit"
              v-model="foodInfo.ash"
              placeholder="0"
              @input="calculateAtwater"
            />
          </view>

          <view class="input-item">
            <text class="input-label">纤维 (%)</text>
            <input
              class="input-field"
              type="digit"
              v-model="foodInfo.fiber"
              placeholder="0"
              @input="calculateAtwater"
            />
          </view>

          <view class="input-item readonly">
            <text class="input-label">碳水化合物（自动计算）</text>
            <input
              class="input-field readonly"
              type="digit"
              :value="calculatedCarbs.toFixed(1)"
              disabled
            />
          </view>

          <view class="input-item readonly">
            <text class="input-label">热量密度（自动计算）</text>
            <input
              class="input-field readonly"
              type="digit"
              :value="calculatedEnergy.toFixed(0)"
              disabled
            />
            <text class="unit-text">kcal/100g</text>
          </view>
        </view>
      </view>

      <!-- 喂食设置 -->
      <view class="input-group">
        <view class="input-card">
          <view class="input-item">
            <text class="input-label">每天喂食次数</text>
            <input
              class="input-field"
              type="number"
              v-model="foodInfo.mealsPerDay"
              placeholder="默认2次"
            />
            <text class="unit-text">次/天</text>
          </view>
        </view>
      </view>

      <!-- 计算按钮 -->
      <button class="calculate-btn" @tap="calculate">开始计算</button>
    </view>

    <!-- 计算结果 -->
    <view v-if="result" class="section">
      <view class="section-title">📊 计算结果</view>

      <view class="result-card">
        <view class="result-item">
          <text class="result-label">每日热量需求</text>
          <text class="result-value">{{ result.dailyEnergyNeed }} kcal</text>
        </view>

        <view class="result-item">
          <text class="result-label">每日狗粮重量</text>
          <text class="result-value highlight">{{ result.dailyFoodWeight.toFixed(0) }} g</text>
        </view>

        <view class="result-item">
          <text class="result-label">每顿狗粮重量</text>
          <text class="result-value highlight">{{ result.perMealFoodWeight.toFixed(0) }} g</text>
        </view>

        <view class="result-subtext">
          每天 {{ foodInfo.mealsPerDay || 2 }} 顿
        </view>

        <view class="result-tip">
          💡 建议：可以使用电子秤准确称量
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request, getToken } from '../../utils/api'

interface DogProfile {
  id: string
  name: string
  gender?: string
  breedName?: string
  birthday: string
  currentWeightKg?: number
  isNeutered?: boolean
  der?: number // 每日热量需求
}

interface FoodInfo {
  inputMode: 'direct' | 'atwater'
  energyDensity?: number
  energyUnit?: string
  protein?: number
  fat?: number
  moisture?: number
  ash?: number
  fiber?: number
  mealsPerDay?: number
}

interface CalculationResult {
  dailyEnergyNeed: number
  dailyFoodWeight: number
  perMealFoodWeight: number
  foodCalories: number
}

// 数据
const dogs = ref<DogProfile[]>([])
const selectedDog = ref<DogProfile | null>(null)
const selectedDogIndex = ref<number>(-1)

const inputMode = ref<'direct' | 'atwater'>('direct')

const foodInfo = ref<FoodInfo>({
  inputMode: 'direct',
  energyDensity: undefined,
  energyUnit: 'kcal/100g',
  protein: undefined,
  fat: undefined,
  moisture: undefined,
  ash: undefined,
  fiber: undefined,
  mealsPerDay: 2
})

const energyUnits = [
  'kcal/100g',
  'kJ/100g',
  'kcal/kg',
  'kJ/kg',
  'kcal/cup'
]
const energyUnitIndex = ref<number>(0)

const result = ref<CalculationResult | null>(null)

// 计算值（阿特沃特模式）
const calculatedCarbs = ref<number>(0)
const calculatedEnergy = ref<number>(0)

// 页面加载
onMounted(async () => {
  // 检查登录状态
  const token = getToken()
  if (!token) {
    uni.showModal({
      title: '提示',
      content: '请先登录后使用饭量计算功能',
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
      console.info('[CalculatePortion] Loaded dogs:', dogs.value.length)
    }
  } catch (err) {
    console.error('[CalculatePortion] Failed to load dogs:', err)
    uni.showToast({
      title: '加载狗狗列表失败',
      icon: 'none'
    })
  }
}

// 显示狗狗选择器
function showDogPicker() {
  if (dogs.value.length === 0) {
    uni.showToast({
      title: '请先创建狗狗档案',
      icon: 'none'
    })
    return
  }

  const dogNames = dogs.value.map(d => d.name)

  uni.showActionSheet({
    itemList: dogNames,
    success: (res) => {
      selectDog(res.tapIndex)
    }
  })
}

// 选择狗狗
function selectDog(index: number) {
  selectedDogIndex.value = index
  selectedDog.value = dogs.value[index]
  result.value = null // 清空之前的计算结果

  console.log('[CalculatePortion] Selected dog:', selectedDog.value?.name)
}

// 切换输入模式
function switchMode(mode: 'direct' | 'atwater') {
  inputMode.value = mode
  foodInfo.value.inputMode = mode
  result.value = null // 清空之前的计算结果
}

// 热量单位改变
function onEnergyUnitChange(e: any) {
  energyUnitIndex.value = e.detail.value
  foodInfo.value.energyUnit = energyUnits[e.detail.value]
}

// 使用阿特沃特公式计算热量
function calculateAtwater() {
  // 确保数值类型（从字符串转换为数字）
  const protein = Number(foodInfo.value.protein) || 0
  const fat = Number(foodInfo.value.fat) || 0
  const moisture = Number(foodInfo.value.moisture) || 0
  const ash = Number(foodInfo.value.ash) || 0
  const fiber = Number(foodInfo.value.fiber) || 0

  // 计算碳水化合物
  calculatedCarbs.value = Math.max(0, 100 - protein - fat - moisture - ash - fiber)

  // 阿特沃特公式
  // 蛋白质：4 kcal/g
  // 脂肪：9 kcal/g
  // 碳水化合物：4 kcal/g
  // 纤维：0 kcal/g
  const energyPer100g =
    protein * 4 +
    fat * 9 +
    calculatedCarbs.value * 4 +
    fiber * 0

  calculatedEnergy.value = energyPer100g
}

// 单位换算：将不同单位统一为 kcal/100g
function normalizeEnergyDensity(value: number, unit: string): number {
  const conversions: Record<string, number> = {
    'kcal/100g': 1,           // 基准
    'kJ/100g': 1 / 4.184,     // 1 kcal = 4.184 kJ
    'kcal/kg': 1 / 10,        // 1 kg = 1000g
    'kJ/kg': 1 / 41.84,       // kJ/kg → kcal/100g
    'kcal/cup': 1 / 10        // 假设1杯≈100g
  }

  const factor = conversions[unit] || 1
  return value * factor
}

// 计算DER（每日能量需求）
function calculateDER(): number {
  if (!selectedDog.value) return 0

  // 如果后端已计算DER，直接使用
  if (selectedDog.value.der) {
    return selectedDog.value.der
  }

  // 否则使用简化公式（RER × 系数）
  // RER = 70 × (体重kg)^0.75
  const weight = selectedDog.value.currentWeightKg || 0
  if (weight <= 0) return 0

  const rer = 70 * Math.pow(weight, 0.75)

  // 根据情况选择系数（简化版）
  let multiplier = 1.6 // 默认成年已绝育

  if (!selectedDog.value.isNeutered) {
    multiplier = 1.8 // 成年未绝育
  }

  // 这里可以根据年龄、活动量等调整系数
  // 暂时使用固定值

  return Math.round(rer * multiplier)
}

// 计算年龄文本
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

// 执行计算
function calculate() {
  if (!selectedDog.value) {
    uni.showToast({
      title: '请先选择狗狗',
      icon: 'none'
    })
    return
  }

  // 验证输入
  if (inputMode.value === 'direct') {
    if (!foodInfo.value.energyDensity || foodInfo.value.energyDensity <= 0) {
      uni.showToast({
        title: '请输入有效的热量密度',
        icon: 'none'
      })
      return
    }
  } else {
    // 阿特沃特模式：先触发计算，更新calculatedEnergy
    calculateAtwater()

    // 确保数值类型（从字符串转换为数字）
    const protein = Number(foodInfo.value.protein) || 0
    const fat = Number(foodInfo.value.fat) || 0
    const moisture = Number(foodInfo.value.moisture) || 0
    const ash = Number(foodInfo.value.ash) || 0
    const fiber = Number(foodInfo.value.fiber) || 0

    // 验证营养成分总和
    const total = protein + fat + moisture + ash + fiber

    if (total > 100) {
      uni.showToast({
        title: '营养成分总和不能超过100%',
        icon: 'none'
      })
      return
    }

    // 验证是否填写了有效的营养成分
    const hasValidInput = protein > 0 || fat > 0 || moisture > 0 || ash > 0 || fiber > 0

    if (!hasValidInput) {
      uni.showToast({
        title: '请至少填写一项营养成分',
        icon: 'none'
      })
      return
    }

    // 验证计算出的热量是否有效
    if (calculatedEnergy.value <= 0) {
      uni.showToast({
        title: '营养成分数据无效，请检查输入',
        icon: 'none'
      })
      return
    }
  }

  // 获取每日热量需求
  const dailyEnergyNeed = calculateDER()

  // 计算狗粮热量密度
  let foodCalories: number

  if (inputMode.value === 'direct') {
    foodCalories = normalizeEnergyDensity(
      foodInfo.value.energyDensity!,
      foodInfo.value.energyUnit!
    )
  } else {
    foodCalories = calculatedEnergy.value
  }

  // 计算每日狗粮重量
  const dailyFoodWeight = (dailyEnergyNeed / foodCalories) * 100

  // 计算每顿狗粮重量
  const mealsPerDay = foodInfo.value.mealsPerDay || 2
  const perMealFoodWeight = dailyFoodWeight / mealsPerDay

  result.value = {
    dailyEnergyNeed,
    dailyFoodWeight,
    perMealFoodWeight,
    foodCalories
  }

  console.log('[CalculatePortion] Calculation result:', result.value)
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

.daily-energy {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
}

.energy-label {
  font-size: 24rpx;
  opacity: 0.9;
}

.energy-value {
  font-size: 32rpx;
  font-weight: bold;
}

/* 输入模式切换 */
.mode-tabs {
  display: flex;
  background: #f5f5f5;
  border-radius: 8rpx;
  padding: 4rpx;
  margin-bottom: 20rpx;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  font-size: 26rpx;
  color: #666;
  border-radius: 6rpx;
  transition: all 0.3s;
}

.tab.active {
  background: white;
  color: #667eea;
  font-weight: bold;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
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
  width: 240rpx;
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

.input-field.readonly {
  background: #f0f0f0;
  color: #999;
}

.picker-button {
  flex: 1;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
  display: flex;
  justify-content: space-between;
}

.unit-text {
  font-size: 24rpx;
  color: #999;
  margin-left: 12rpx;
}

/* 计算按钮 */
.calculate-btn {
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

.calculate-btn::after {
  border: none;
}

/* 结果卡片 */
.result-card {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  border-radius: 12rpx;
  padding: 32rpx;
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.result-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.result-label {
  font-size: 28rpx;
  color: #555;
}

.result-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.result-value.highlight {
  font-size: 40rpx;
  color: #e17055;
}

.result-subtext {
  font-size: 24rpx;
  color: #777;
  text-align: center;
  margin-top: -16rpx;
  margin-bottom: 20rpx;
}

.result-tip {
  font-size: 24rpx;
  color: #666;
  text-align: center;
  margin-top: 24rpx;
  padding: 16rpx;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8rpx;
}
</style>

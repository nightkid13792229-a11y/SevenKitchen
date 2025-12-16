<template>
  <view class="container">
    <view v-if="recipe" class="recipe-detail">
      <view class="recipe-header">
        <text class="recipe-name">{{ recipe.name }}</text>
        <text class="recipe-id">ID: {{ recipe.id }}</text>
        <text v-if="isDemo" class="demo-badge">DEMO</text>
      </view>
      
      <view class="recipe-info" v-if="recipe.energyDensityKcalPer100g || recipe.energyDensityKcalPerKg">
        <text>能量密度: {{ recipe.energyDensityKcalPer100g || recipe.energyDensityKcalPerKg }} {{ recipe.energyDensityKcalPer100g ? 'kcal/100g' : 'kcal/kg' }}</text>
      </view>
      
      <view v-if="recipe.description" class="recipe-description">
        <text>{{ recipe.description }}</text>
      </view>
      
      <view class="section">
        <button class="btn" @tap="generateDiySheet">
          {{ isDemo ? 'Generate DIY Sheet (Demo)' : '生成 DIY 流程单' }}
        </button>
        
        <view v-if="diySheet" class="diy-sheet">
          <view class="section-title">制作步骤</view>
          <view 
            v-for="step in diySheet.steps" 
            :key="step.stepNumber"
            class="step-item"
          >
            <text class="step-number">{{ step.stepNumber }}.</text>
            <text class="step-desc">{{ step.description }}</text>
          </view>
          <view v-if="diySheet.recommendedDailyIntakeG" class="intake-info">
            <text>推荐日摄入量: {{ diySheet.recommendedDailyIntakeG }}g</text>
          </view>
        </view>
      </view>
      
      <view class="section">
        <button class="btn btn-primary" @tap="goToOrder">订购此食谱</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'

interface Recipe {
  id: string
  name: string
  description?: string
  energyDensityKcalPerKg?: number
  energyDensityKcalPer100g?: number
  isDemo?: boolean
}

interface DiySheetStep {
  stepNumber: number
  description: string
}

interface DiySheet {
  steps: DiySheetStep[]
  recommendedDailyIntakeG?: number
}

const recipe = ref<Recipe | null>(null)
const diySheet = ref<DiySheet | null>(null)
const recipeId = ref('')
const dogId = ref<string | null>(null)
const isDemo = ref(false)

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage.options?.recipeId || ''
  const demoParam = currentPage.options?.demo
  
  dogId.value = uni.getStorageSync('dogId') || null
  
  if (demoParam === '1' || demoParam === 'true') {
    // Demo mode - use local demo recipe
    isDemo.value = true
    recipeId.value = 'demo-recipe'
    loadDemoRecipe()
    console.info('[RecipeDetail] demo mode enabled')
  } else if (recipeId.value) {
    // Normal mode - load from backend
    loadRecipeDetail()
  }
})

function loadDemoRecipe() {
  // Demo recipe object - no backend call
  recipe.value = {
    id: 'demo-recipe',
    name: 'Demo Chicken Pumpkin Bowl',
    description: 'MVP demo recipe for end-to-end testing',
    energyDensityKcalPer100g: 120,
    isDemo: true
  }
}

function loadRecipeDetail() {
  uni.showLoading({ title: '加载中...' })
  
  request({
    url: `/recipes/${recipeId.value}`,
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      recipe.value = res.data
    }
  }).catch((err: any) => {
    console.error('Load recipe error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

function generateDiySheet() {
  if (isDemo.value) {
    // Demo mode - render static steps without backend call
    diySheet.value = {
      steps: [
        { stepNumber: 1, description: 'Prepare fresh chicken breast (200g)' },
        { stepNumber: 2, description: 'Steam pumpkin until soft (150g)' },
        { stepNumber: 3, description: 'Mix chicken and pumpkin together' },
        { stepNumber: 4, description: 'Add recommended supplements and serve' }
      ],
      recommendedDailyIntakeG: 350
    }
    uni.showToast({
      title: 'Demo DIY sheet generated',
      icon: 'success'
    })
    return
  }
  
  // Normal mode - call backend
  uni.showLoading({ title: '生成中...' })
  
  const payload: any = {}
  if (dogId.value) {
    payload.dogId = dogId.value
  }
  
  request({
    url: `/recipes/${recipeId.value}/diy-sheet`,
    method: 'POST',
    data: payload
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      diySheet.value = res.data
      uni.showToast({
        title: '生成成功',
        icon: 'success'
      })
    }
  }).catch((err: any) => {
    console.error('Generate DIY sheet error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

function goToOrder() {
  const storedDogId = uni.getStorageSync('dogId')
  if (!storedDogId) {
    uni.showModal({
      title: '提示',
      content: '请先创建狗狗档案',
      success: (res) => {
        if (res.confirm) {
          uni.navigateTo({
            url: `/pages/dog-create/index?redirect=order&recipeId=${recipeId.value}`
          })
        }
      }
    })
    return
  }
  
  // Build navigation URL with demo flag and recipe info
  let url = `/pages/order-config/index?recipeId=${recipeId.value}&dogId=${storedDogId}`
  if (isDemo.value && recipe.value) {
    url += `&demo=1`
    url += `&recipeName=${encodeURIComponent(recipe.value.name)}`
    if (recipe.value.energyDensityKcalPer100g) {
      url += `&energyDensity=${recipe.value.energyDensityKcalPer100g}`
    }
  }
  
  uni.navigateTo({ url })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.recipe-detail {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.recipe-header {
  margin-bottom: 20rpx;
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  display: block;
  margin-bottom: 10rpx;
}

.recipe-id {
  font-size: 24rpx;
  color: #999;
}

.recipe-info {
  margin-bottom: 30rpx;
  font-size: 28rpx;
  color: #666;
}

.section {
  margin-top: 30rpx;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-bottom: 20rpx;
}

.btn-primary {
  background-color: #1890ff;
}

.diy-sheet {
  margin-top: 20rpx;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
}

.step-item {
  display: flex;
  margin-bottom: 15rpx;
  font-size: 28rpx;
  line-height: 1.6;
}

.step-number {
  margin-right: 10rpx;
  color: #1890ff;
  font-weight: bold;
}

.step-desc {
  flex: 1;
  color: #666;
}

.intake-info {
  margin-top: 20rpx;
  padding: 15rpx;
  background-color: #e6f7ff;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #1890ff;
}

.demo-badge {
  display: inline-block;
  padding: 4rpx 12rpx;
  background-color: #ff9800;
  color: #fff;
  font-size: 20rpx;
  border-radius: 4rpx;
  margin-left: 10rpx;
}

.recipe-description {
  margin-bottom: 20rpx;
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}
</style>



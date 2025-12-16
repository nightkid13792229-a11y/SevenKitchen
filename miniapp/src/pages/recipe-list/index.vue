<template>
  <view class="container">
    <view class="recipe-list">
      <view 
        v-for="recipe in recipes" 
        :key="recipe.id"
        class="recipe-item"
        @tap="viewRecipe(recipe.id)"
      >
        <view class="recipe-name">{{ recipe.name }}</view>
        <view class="recipe-info">
          <text class="recipe-id">ID: {{ recipe.id }}</text>
          <text class="recipe-kcal" v-if="recipe.energyDensityKcalPerKg">
            {{ recipe.energyDensityKcalPerKg }} kcal/kg
          </text>
        </view>
      </view>
      <view v-if="recipes.length === 0" class="empty-state">
        <view class="empty-title">No recipes available yet</view>
        <view class="empty-subtitle">Backend returned an empty list (MVP). Use a demo recipe to continue the flow.</view>
        <button class="btn-demo" @tap="useDemoRecipe">Use Demo Recipe (MVP)</button>
        <button class="btn-secondary" @tap="goToNetworkSettings">Go to Network Settings</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

interface Recipe {
  id: string
  name: string
  energyDensityKcalPerKg?: number
}

const recipes = ref<Recipe[]>([])

onMounted(() => {
  loadRecipes()
})

onShow(() => {
  // Refresh recipes when page becomes visible
  loadRecipes()
})

function loadRecipes() {
  uni.showLoading({ title: '加载中...' })
  
  request({
    url: '/recipes',
    method: 'GET'
  }).then((res: any) => {
    // Diagnostic logging
    console.log('[RecipeList] Response:', {
      code: res.code,
      dataLength: res.data?.length || 0,
      data: res.data
    })
    
    if (res.code === 0 && res.data) {
      recipes.value = res.data
      console.log('[RecipeList] Recipes assigned:', recipes.value.length)
      if (recipes.value.length === 0) {
        console.info('[RecipeList] recipes empty -> showing demo entry')
      }
    } else {
      console.warn('[RecipeList] Unexpected response:', res)
    }
  }).catch((err: any) => {
    console.error('[RecipeList] Load recipes error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

function viewRecipe(recipeId: string) {
  uni.navigateTo({
    url: `/pages/recipe-detail/index?recipeId=${recipeId}`
  })
}

function useDemoRecipe() {
  uni.navigateTo({
    url: '/pages/recipe-detail/index?demo=1'
  })
}

function goToNetworkSettings() {
  uni.navigateTo({
    url: '/pages/network-settings/index'
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.recipe-list {
  padding: 20rpx 0;
}

.recipe-item {
  background-color: #fff;
  padding: 30rpx;
  margin-bottom: 20rpx;
  border-radius: 8rpx;
}

.recipe-name {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 10rpx;
}

.recipe-info {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 100rpx 40rpx;
  color: #666;
}

.empty-title {
  font-size: 36rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
  color: #333;
}

.empty-subtitle {
  font-size: 28rpx;
  line-height: 1.6;
  margin-bottom: 40rpx;
  color: #666;
}

.btn-demo {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-bottom: 20rpx;
}

.btn-secondary {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #f0f0f0;
  color: #333;
  border-radius: 8rpx;
  font-size: 32rpx;
}
</style>



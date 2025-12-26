<template>
  <view class="home-container">
    <!-- 顶部欢迎区 -->
    <view class="header-section">
      <view class="welcome-text">Hi，欢迎来到七号厨房 🍖</view>
      <view class="subtitle-text">专业的狗狗鲜食定制服务</view>
    </view>

    <!-- 快捷功能入口 -->
    <view class="quick-actions">
      <view class="action-item" @tap="goToDogList">
        <view class="action-icon">🐕</view>
        <text class="action-text">狗狗档案</text>
      </view>
      <view class="action-item" @tap="goToRecipeList">
        <view class="action-icon">🍲</view>
        <text class="action-text">食谱橱窗</text>
      </view>
      <view class="action-item" @tap="goToOrderList">
        <view class="action-icon">📦</view>
        <text class="action-text">我的订单</text>
      </view>
      <view class="action-item" @tap="goToAddressList">
        <view class="action-icon">📍</view>
        <text class="action-text">收货地址</text>
      </view>
    </view>

    <!-- 狗狗档案预览 -->
    <view class="section" v-if="dogs.length > 0">
      <view class="section-header">
        <text class="section-title">我的狗狗</text>
        <view class="section-more" @tap="goToDogList">
          <text>查看全部</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <scroll-view scroll-x class="dog-scroll">
        <view class="dog-card" v-for="dog in dogs" :key="dog.id" @tap="goToDogDetail(dog.id)">
          <view class="dog-avatar">{{ dog.breedName ? dog.breedName.charAt(0) : '🐕' }}</view>
          <view class="dog-info">
            <text class="dog-name">{{ dog.name }}</text>
            <text class="dog-detail">{{ dog.currentWeightKg }}kg · {{ dog.ageText }}</text>
          </view>
        </view>
        <view class="dog-card add-dog" @tap="goToDogCreate">
          <view class="add-icon">+</view>
          <text class="add-text">添加档案</text>
        </view>
      </scroll-view>
    </view>

    <!-- 无狗狗时的引导 -->
    <view class="empty-dog-section" v-else>
      <view class="empty-icon">🐕</view>
      <text class="empty-title">还没有狗狗档案</text>
      <text class="empty-desc">创建档案后，即可获得专属喂食建议</text>
      <button class="create-btn" @tap="goToDogCreate">创建档案</button>
    </view>

    <!-- 推荐食谱 -->
    <view class="section" v-if="recommendedRecipes.length > 0">
      <view class="section-header">
        <text class="section-title">推荐食谱</text>
        <view class="section-more" @tap="goToRecipeList">
          <text>查看全部</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <view class="recipe-list">
        <view class="recipe-card" v-for="recipe in recommendedRecipes" :key="recipe.id" @tap="goToRecipeDetail(recipe.id)">
          <image class="recipe-image" :src="recipe.coverImageUrl || '/static/placeholder.png'" mode="aspectFill" />
          <view class="recipe-info">
            <text class="recipe-name">{{ recipe.name }}</text>
            <view class="recipe-tags">
              <text class="tag" v-for="(tag, index) in recipe.tags" :key="index">{{ tag }}</text>
            </view>
            <view class="recipe-energy">
              <text class="energy-text">{{ recipe.energyDensityKcalPerKg }} kcal/kg</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'

// 狗狗列表
const dogs = ref<any[]>([])

// 推荐食谱
const recommendedRecipes = ref<any[]>([])

// 页面加载
onMounted(() => {
  loadDogList()
  loadRecommendedRecipes()
})

// 加载狗狗列表
const loadDogList = async () => {
  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      dogs.value = res.data.map((dog: any) => ({
        ...dog,
        ageText: calculateAgeText(dog.birthday)
      }))
    }
  } catch (err) {
    console.error('加载狗狗列表失败:', err)
  }
}

// 计算年龄文本
const calculateAgeText = (birthday: string) => {
  const birth = new Date(birthday)
  const now = new Date()
  const months = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months < 12) {
    return `${months}个月`
  }
  const years = Math.floor(months / 12)
  return `${years}岁`
}

// 加载推荐食谱
const loadRecommendedRecipes = async () => {
  try {
    const res = await request({
      url: '/recipes',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      // 只显示前 4 个作为推荐
      recommendedRecipes.value = res.data.slice(0, 4)
    }
  } catch (err) {
    console.error('加载食谱失败:', err)
  }
}

// 跳转到狗狗列表
const goToDogList = () => {
  uni.navigateTo({ url: '/pages/dog-profile-list/index' })
}

// 跳转到创建狗狗
const goToDogCreate = () => {
  uni.navigateTo({ url: '/pages/dog-create/index' })
}

// 跳转到狗狗详情
const goToDogDetail = (dogId: string) => {
  uni.navigateTo({ url: `/pages/dog-create/index?id=${dogId}` })
}

// 跳转到食谱列表
const goToRecipeList = () => {
  uni.navigateTo({ url: '/pages/recipe-list/index' })
}

// 跳转到食谱详情
const goToRecipeDetail = (recipeId: string) => {
  uni.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}` })
}

// 跳转到订单列表
const goToOrderList = () => {
  uni.navigateTo({ url: '/pages/orders-list/index' })
}

// 跳转到地址列表
const goToAddressList = () => {
  uni.navigateTo({ url: '/pages/address-list/index' })
}
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 20px;
}

/* 顶部欢迎区 */
.header-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px 30px;
  color: white;
}

.welcome-text {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 8px;
}

.subtitle-text {
  font-size: 14px;
  opacity: 0.9;
}

/* 快捷功能入口 */
.quick-actions {
  display: flex;
  justify-content: space-around;
  background: white;
  margin: -15px 15px 15px;
  border-radius: 12px;
  padding: 20px 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.action-icon {
  font-size: 32px;
}

.action-text {
  font-size: 12px;
  color: #333;
}

/* 区块样式 */
.section {
  background: white;
  margin: 15px;
  border-radius: 12px;
  padding: 15px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.section-more {
  display: flex;
  align-items: center;
  color: #999;
  font-size: 14px;
}

.arrow {
  margin-left: 4px;
  font-size: 16px;
}

/* 狗狗卡片 */
.dog-scroll {
  white-space: nowrap;
}

.dog-card {
  display: inline-block;
  width: 120px;
  background: #f8f8f8;
  border-radius: 8px;
  padding: 15px;
  margin-right: 12px;
  text-align: center;
  vertical-align: top;
}

.dog-avatar {
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin: 0 auto 10px;
}

.dog-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dog-name {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.dog-detail {
  font-size: 12px;
  color: #999;
}

.add-dog {
  border: 1px dashed #ccc;
  background: white;
}

.add-icon {
  font-size: 24px;
  color: #999;
  margin-bottom: 5px;
}

.add-text {
  font-size: 12px;
  color: #999;
}

/* 空状态 */
.empty-dog-section {
  background: white;
  margin: 15px;
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.empty-title {
  display: block;
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.empty-desc {
  display: block;
  font-size: 14px;
  color: #999;
  margin-bottom: 20px;
}

.create-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 20px;
  padding: 10px 30px;
  font-size: 14px;
}

/* 食谱卡片 */
.recipe-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recipe-card {
  display: flex;
  background: #f8f8f8;
  border-radius: 8px;
  overflow: hidden;
}

.recipe-image {
  width: 100px;
  height: 100px;
  flex-shrink: 0;
}

.recipe-info {
  flex: 1;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.recipe-name {
  font-size: 15px;
  font-weight: bold;
  color: #333;
}

.recipe-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  background: #e8f4f8;
  color: #2980b9;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}

.recipe-energy {
  margin-top: 4px;
}

.energy-text {
  font-size: 12px;
  color: #999;
}
</style>

<template>
  <view v-if="showPopup" class="popup-mask" @tap="close">
    <view class="popup-container" @tap.stop>
      <view class="recipe-snapshot-modal">
        <view class="modal-header">
          <text class="modal-title">食谱快照</text>
          <view class="btn-close" @tap="close">
            <text class="close-icon">×</text>
          </view>
        </view>

        <scroll-view class="modal-content" scroll-y>
          <!-- 版本号标签 -->
          <view class="version-tag">版本 v{{ recipeSnapshot.version }}</view>

          <!-- 基础信息 -->
          <view class="info-section">
            <text class="recipe-name">{{ recipeSnapshot.name }}</text>
          </view>

          <!-- 营养数据 -->
          <view class="nutrition-card">
            <view class="nutrition-item">
              <text class="label">营养标准</text>
              <text class="value">{{ getNutritionStandardLabel(recipeSnapshot.nutrition_standard) }}</text>
            </view>
            <view class="nutrition-item">
              <text class="label">能量密度</text>
              <text class="value">{{ recipeSnapshot.energy_density_kcal_per_kg }} kcal/kg</text>
            </view>
          </view>

          <!-- 食谱配方列表 -->
          <view class="ingredients-card">
            <view class="card-header">
              <text class="card-title">食谱配方</text>
              <text class="card-subtitle">共 {{ recipeSnapshot.items?.length || 0 }} 种原料</text>
            </view>

            <!-- 配方表头 -->
            <view class="ingredient-header">
              <text class="ingredient-header-item">原料名称</text>
              <text class="ingredient-header-item">占比/用量</text>
            </view>

            <!-- 配方列表 -->
            <view
              v-for="(item, index) in recipeSnapshot.items"
              :key="index"
              class="ingredient-row"
            >
              <text class="ingredient-item">{{ item.name }}</text>
              <!-- 食材类型：显示占比 -->
              <text v-if="item.ingredient_type === 'FOOD' && item.ratio && item.ratio > 0" class="ingredient-item">
                {{ formatRatio(item.ratio) }}%
              </text>
              <!-- 补剂类型：显示营养目标值 -->
              <text v-else-if="item.ingredient_type === 'SUPPLEMENT' && getNutrientTargetText(item)" class="ingredient-item">
                {{ getNutrientTargetText(item) }}
              </text>
              <!-- 其他情况：显示占位符 -->
              <text v-else class="ingredient-item">-</text>
            </view>
          </view>
        </scroll-view>

        <!-- 底部关闭按钮 -->
        <view class="modal-footer">
          <button class="btn-close-footer" @tap="close">关闭</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { formatSupplementTargets } from '../utils/supplement-nutrients'

interface RecipeSnapshotItem {
  ingredient_id: string
  name: string
  ratio: number
  ingredient_type?: string  // 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'
  nutrient_target_key?: string  // 补剂类型：营养素名称
  nutrient_target_value?: number  // 补剂类型：营养目标值
  supplement_targets?: any[]
  properties?: any  // 补剂类型：完整属性
}

// 后端 RecipeSnapshot 接口定义（基于实际API返回）
interface RecipeSnapshot {
  id: string
  version: number
  name: string
  nutrition_standard: string
  energy_density_kcal_per_kg: number
  production_loss_rate: number
  items: RecipeSnapshotItem[]
}

// RecipeSnapshotItem 定义已在上面（第70-78行）

const showPopup = ref(false)
const recipeSnapshot = ref<RecipeSnapshot>({
  id: '',
  version: 1,
  name: '',
  nutrition_standard: '',
  energy_density_kcal_per_kg: 0,
  production_loss_rate: 0,
  items: []
})

function open(snapshot: RecipeSnapshot) {
  recipeSnapshot.value = snapshot
  showPopup.value = true
}

function close() {
  showPopup.value = false
}

// 格式化占比
function formatRatio(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return '-'
  return ratio.toFixed(2)
}

function getNutrientTargetText(item: RecipeSnapshotItem): string {
  const targetText = formatSupplementTargets(item)
  if (targetText) return targetText
  if (!item.nutrient_target_key || !item.nutrient_target_value) return ''
  return `每kg食材添加${item.nutrient_target_value}${item.nutrient_target_key}`
}

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'AAFCO_2019': 'AAFCO 2019',
    'GB_T_31216': '国标 GB/T 31216',
  }
  return map[standard] || standard
}

defineExpose({
  open,
  close
})
</script>

<style scoped>
.popup-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.popup-container {
  width: 90%;
  max-width: 650rpx;
}

.recipe-snapshot-modal {
  background-color: #fff;
  border-radius: 32rpx;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #e5e5e5;
}

.modal-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.btn-close {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-icon {
  font-size: 60rpx;
  color: #999;
  line-height: 1;
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20rpx;
}

.version-tag {
  display: inline-block;
  margin: 20rpx 32rpx;
  padding: 8rpx 20rpx;
  background-color: #e3f2fd;
  color: #1976d2;
  border-radius: 6rpx;
  font-size: 24rpx;
}

.info-section {
  background-color: #fff;
  padding: 0 32rpx 24rpx;
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  display: block;
}

.nutrition-card {
  background-color: #f9f9f9;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx 32rpx;
  display: flex;
  justify-content: space-around;
}

.nutrition-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.nutrition-item .label {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 4rpx;
}

.nutrition-item .value {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.ingredients-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  margin: 20rpx 32rpx;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.card-subtitle {
  font-size: 24rpx;
  color: #999;
}

/* 配方表头 */
.ingredient-header {
  display: flex;
  padding: 12rpx 0;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  margin-bottom: 8rpx;
}

.ingredient-header-item {
  flex: 1;
  font-size: 26rpx;
  color: #666;
  text-align: center;
  font-weight: 500;
}

/* 配方行 */
.ingredient-row {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.ingredient-row:last-child {
  border-bottom: none;
}

.ingredient-item {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  text-align: center;
  word-break: break-all;
}

.modal-footer {
  padding: 20rpx 32rpx;
  border-top: 1rpx solid #e5e5e5;
  background-color: #fff;
}

.btn-close-footer {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background-color: #f5f5f5;
  color: #333;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
}
</style>

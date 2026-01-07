<template>
  <view class="recipe-detail-page">
    <!-- 封面静态图 -->
    <view class="cover-section">
      <image
        v-if="recipe.coverImageUrl"
        :src="recipe.coverImageUrl"
        mode="aspectFill"
        class="cover-image"
        @tap="previewImage"
      />
      <view v-else class="cover-placeholder">
        <text class="placeholder-text">{{ recipe.name.charAt(0) }}</text>
      </view>
    </view>

    <!-- 基础信息区 -->
    <view class="info-section">
      <text class="recipe-name">{{ recipe.name }}</text>

      <view class="tags-row">
        <text class="section-label">适用于：</text>
        <view class="tags-container">
          <text
            v-for="stage in recipe.applicableLifeStages"
            :key="stage"
            class="tag life-stage-tag"
          >
            {{ getLifeStageLabel(stage) }}
          </text>
          <text
            v-for="tag in recipe.targetHealthTags"
            :key="tag"
            class="tag health-tag"
          >
            {{ getHealthTagLabel(tag) }}
          </text>
        </view>
      </view>

      <text v-if="recipe.description" class="recipe-description">
        {{ recipe.description }}
      </text>
    </view>

    <!-- 营养数据卡片 -->
    <view class="nutrition-card">
      <view class="nutrition-item">
        <text class="label">营养标准</text>
        <text class="value">{{ getNutritionStandardLabel(recipe.nutritionStandard) }}</text>
      </view>
      <view class="nutrition-item">
        <text class="label">设计软件</text>
        <text class="value">{{ recipe.designSource || '七厨房' }}</text>
      </view>
    </view>

    <!-- 食谱配方列表 -->
    <view class="ingredients-card">
      <view class="card-header">
        <text class="card-title">食谱配方</text>
        <text class="card-subtitle">共 {{ recipe.items.length }} 种原料</text>
      </view>

      <!-- 表格标题 -->
      <view class="ingredient-table-header">
        <text class="header-name">原料</text>
        <text class="header-method">制备方法</text>
        <text class="header-ratio">占比/用量</text>
      </view>

      <view
        v-for="(item, index) in sortedItems"
        :key="item.ingredientId"
        class="ingredient-item"
      >
        <view class="ingredient-name">
          <text>{{ item.name }}</text>
          <text
            v-if="item.ingredientType"
            :class="['ingredient-type-tag', getIngredientTypeClass(item.ingredientType)]"
          >
            {{ getIngredientTypeLabel(item.ingredientType) }}
          </text>
        </view>
        <view class="preparation-method">
          <text v-if="item.preparationMethod" class="method-text">{{ item.preparationMethod }}</text>
          <text v-else class="method-text">-</text>
        </view>
        <!-- 食材类型：显示占比 -->
        <text v-if="item.ingredientType === 'FOOD' && item.ratio && item.ratio > 0" class="ingredient-ratio">
          {{ formatRatio(item.ratio) }}%
        </text>
        <!-- 补剂类型：显示营养目标值 -->
        <text v-else-if="item.ingredientType === 'SUPPLEMENT' && item.nutrientTargetValue" class="ingredient-ratio nutrient-target-value">
          每kg添加{{ item.nutrientTargetValue }}{{ getNutrientUnit(item) }}{{ item.nutrientTargetKey }}
        </text>
        <!-- 其他情况：显示占位符 -->
        <text v-else class="ingredient-ratio">
          -
        </text>
      </view>
    </view>

    <!-- 营养成分分析 -->
    <view class="nutrition-panel" v-if="recipe.nutritionDetailedData">
      <view class="card-header">
        <text class="card-title">营养成分分析</text>
      </view>

      <view class="nutrition-grid">
        <view class="nutrition-item-small">
          <text class="nutrition-label">蛋白质</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.proteinPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">脂肪</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.fatPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">灰分</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.ashPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">含水量</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.moisturePercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">膳食纤维</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.crudeFiberPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">碳水</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.carbohydratePercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small highlight-energy">
          <text class="nutrition-label">能量密度</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ recipe.energyDensityKcalPerKg || recipe.nutritionDetailedData?.energyDensityKcalPerKg }}
            </text>
            <text class="nutrition-unit">kcal/kg</text>
          </view>
        </view>

        <view class="nutrition-item-small highlight-ratio">
          <text class="nutrition-label">钙磷比</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatCalciumPhosphorusRatio(recipe.nutritionDetailedData.calciumPhosphorusRatio) }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <view class="bottom-actions">
      <button
        class="btn-favorite"
        :class="{ active: isFavorite }"
        @tap="toggleFavorite"
      >
        <text class="icon">{{ isFavorite ? '⭐' : '☆' }}</text>
      </button>

      <button class="btn-diy" @tap="generateDiySheet">
        我要自己做
      </button>

      <button class="btn-order" @tap="goToOrder">
        订购成品
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'

interface RecipeItem {
  ingredientId: string
  name: string
  preparationMethod?: string
  ratio?: number  // 食材类型才有此字段
  sortOrder: number
  nutrientTargetKey?: string  // 补剂类型才有此字段
  nutrientTargetValue?: number  // 补剂类型才有此字段
  ingredientType?: string
  properties?: any
}

interface NutritionDetailedData {
  energyDensityKcalPerKg?: number
  proteinPercent?: number
  fatPercent?: number
  ashPercent?: number
  moisturePercent?: number
  crudeFiberPercent?: number
  carbohydratePercent?: number
  calciumPhosphorusRatio?: string
}

interface RecipeDetail {
  id: string
  version: number
  name: string
  status: string
  coverImageUrl?: string
  description?: string
  nutritionStandard: string
  designSource?: string
  energyDensityKcalPerKg: number
  targetHealthTags: string[]
  applicableLifeStages: string[]
  nutritionDetailedData?: NutritionDetailedData
  items: RecipeItem[]
}

const recipe = ref<RecipeDetail>({
  id: '',
  version: 1,
  name: '',
  status: '',
  coverImageUrl: undefined,
  description: undefined,
  nutritionStandard: 'FEDIAF_2021',
  designSource: undefined,
  energyDensityKcalPerKg: 0,
  targetHealthTags: [],
  applicableLifeStages: [],
  nutritionDetailedData: undefined,
  items: []
})

const isFavorite = ref(false)
const recipeId = ref('')
const dogId = ref<string | null>(null)

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 原料排序（按sortOrder升序）
const sortedItems = computed(() => {
  return [...recipe.value.items].sort((a, b) => a.sortOrder - b.sortOrder)
})

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage.options?.recipeId || ''

  dogId.value = uni.getStorageSync('dogId') || null

  // 加载健康标签映射
  loadHealthTagMapping()

  if (recipeId.value) {
    loadRecipeDetail()
    checkFavoriteStatus()
  }
})

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
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }).finally(() => {
    uni.hideLoading()
  })
}

function loadHealthTagMapping() {
  request({
    url: '/recipes/filter-options',
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      // 建立健康标签UUID到label的映射
      const uuidMap: Record<string, string> = {}
      if (res.data.healthTags && Array.isArray(res.data.healthTags)) {
        res.data.healthTags.forEach((tag: any) => {
          if (tag.value && tag.label) {
            uuidMap[tag.value] = tag.label
          }
        })
      }
      healthTagUuidLabelMap.value = uuidMap
    }
  }).catch((err: any) => {
    console.error('Load health tag mapping error:', err)
  })
}

function checkFavoriteStatus() {
  // Debug: Log recipeId
  console.log('[RecipeDetail] Checking favorite for recipeId:', recipeId.value)

  // TODO: 调用收藏状态查询API
  const favoriteStatus = uni.getStorageSync(`favorite_${recipeId.value}`)
  console.log('[RecipeDetail] Favorite status from storage:', favoriteStatus)

  isFavorite.value = favoriteStatus || false
  console.log('[RecipeDetail] isFavorite set to:', isFavorite.value)
}

function toggleFavorite() {
  isFavorite.value = !isFavorite.value

  // TODO: 调用收藏API
  // 暂时使用本地存储
  uni.setStorageSync(`favorite_${recipeId.value}`, isFavorite.value)

  uni.showToast({
    title: isFavorite.value ? '已收藏' : '已取消收藏',
    icon: 'success'
  })
}

function previewImage() {
  if (!recipe.value.coverImageUrl) return

  uni.previewImage({
    urls: [recipe.value.coverImageUrl],
    current: recipe.value.coverImageUrl
  })
}

function generateDiySheet() {
  // 直接跳转到DIY配置页面
  uni.navigateTo({
    url: `/pages/recipe-diy/index?recipeId=${recipeId.value}`
  })
}

function goToOrder() {
  // 跳转到新的订购配置页面
  uni.navigateTo({
    url: `/pages/recipe-order/index?recipeId=${recipeId.value}`
  })
}

function getLifeStageLabel(stage: string): string {
  const map: Record<string, string> = {
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期',
  }
  return map[stage] || stage
}

function getHealthTagLabel(tagOrUuid: string): string {
  // 优先使用动态映射（UUID -> label）
  if (healthTagUuidLabelMap.value[tagOrUuid]) {
    return healthTagUuidLabelMap.value[tagOrUuid]
  }

  // 兼容旧的枚举值（用于向后兼容）
  const enumMap: Record<string, string> = {
    'HEALTHY': '健康',
    'PICKY_EATER': '挑食',
    'SENSITIVE_STOMACH': '敏感胃',
    'PANCREATITIS_SUPPORT': '胰腺炎友好',
    'LOW_FAT': '低脂',
    'SKIN_COAT_CARE': '护肤',
  }

  if (enumMap[tagOrUuid]) {
    return enumMap[tagOrUuid]
  }

  return tagOrUuid
}

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'AAFCO_2019': 'AAFCO 2019',
    'GB_T_31216': '国标 GB/T 31216',
  }
  return map[standard] || standard
}

function getIngredientTypeLabel(type: string): string {
  const map: Record<string, string> = {
    'FOOD': '食材',
    'SUPPLEMENT': '补剂',
    'PACKAGING': '包材',
  }
  return map[type] || type
}

function getIngredientTypeClass(type: string): string {
  const map: Record<string, string> = {
    'FOOD': 'type-food',
    'SUPPLEMENT': 'type-supplement',
    'PACKAGING': 'type-packaging',
  }
  return map[type] || ''
}

function getNutrientUnit(item: RecipeItem): string {
  if (!item.properties || !item.nutrientTargetKey) return ''

  const activeNutrients = item.properties?.active_nutrients || {}
  const nutrientData = activeNutrients[item.nutrientTargetKey]

  if (nutrientData && typeof nutrientData === 'object') {
    return nutrientData.unit || ''
  }

  return ''
}

function formatNumber(value: number | undefined | null): string {
  if (value === null || value === undefined) return '-'
  return value.toFixed(1)
}

function formatRatio(value: number | undefined | null): string {
  if (value === null || value === undefined) return '-'
  return value.toFixed(2)
}

function formatCalciumPhosphorusRatio(ratio: string | number | undefined | null): string {
  if (ratio === null || ratio === undefined) return '-'

  // Convert to string first
  const ratioStr = String(ratio)

  // If already contains colon, return as is
  if (ratioStr.includes('：')) return ratioStr

  // Otherwise, convert "1.24" to "1.24：1"
  return `${ratioStr}：1`
}
</script>

<style scoped>
.recipe-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

/* 封面图区 */
.cover-section {
  width: 100%;
  height: 360rpx;
  background-color: #f0f0f0;
}

.cover-image {
  width: 100%;
  height: 100%;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.placeholder-text {
  font-size: 120rpx;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
}

/* 基础信息区 */
.info-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

.section-label {
  font-size: 26rpx;
  color: #666;
  display: inline-block;
  margin-right: 8rpx;
}

.tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  flex: 1;
}

.tag {
  display: inline-block;
  padding: 6rpx 16rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
}

.life-stage-tag {
  background-color: #e3f2fd;
  color: #1976d2;
}

.health-tag {
  background-color: #fff3e0;
  color: #f57c00;
}

.recipe-description {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
  display: block;
}

/* 营养数据卡片 */
.nutrition-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx;
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

/* 原料卡片 */
.ingredients-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx;
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

/* 表格标题 */
.ingredient-table-header {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #e5e5e5;
  margin-bottom: 8rpx;
}

.header-name {
  flex: 1;
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
  text-align: left;
}

.header-method {
  flex: 1.5;
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
  text-align: center;
}

.header-ratio {
  flex: 0 0 120rpx;
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
  text-align: right;
}

/* 原料列表项 */
.ingredient-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.ingredient-item:last-child {
  border-bottom: none;
}

.ingredient-name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.ingredient-type-tag {
  display: inline-block;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  font-size: 20rpx;
  font-weight: normal;
}

.type-food {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.type-supplement {
  background-color: #fff3e0;
  color: #ef6c00;
}

.type-packaging {
  background-color: #e3f2fd;
  color: #1565c0;
}

.preparation-method {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 24rpx;
  color: #666;
}

.preparation-method .method-text {
  width: 100%;
  text-align: center;
  display: block;
}

.ingredient-ratio {
  flex: 0 0 120rpx;
  font-size: 28rpx;
  font-weight: bold;
  color: #07c160;
  text-align: right;
}

.nutrient-target-value {
  font-size: 24rpx;
  color: #ff6b6b;
  font-weight: normal;
}

/* 营养成分分析板块 */
.nutrition-panel {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx;
}

.nutrition-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.nutrition-item-small {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  text-align: center;
}

.nutrition-label {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}

/* 数值和单位在同一行 */
.nutrition-value-with-unit {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4rpx;
}

.nutrition-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #07c160;
}

.nutrition-unit {
  font-size: 22rpx;
  color: #999;
}

/* 能量密度特殊样式 */
.highlight-energy .nutrition-value {
  color: #ff6b6b;
}

/* 钙磷比特殊样式 */
.highlight-ratio .nutrition-value {
  color: #4dabf7;
}

/* 底部操作按钮 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
}

.btn-favorite,
.btn-diy,
.btn-order {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
  /* 重置微信小程序button默认样式 */
  padding: 0;
  margin: 0;
  line-height: normal;
}

.btn-favorite::after,
.btn-diy::after,
.btn-order::after {
  border: none;
}

/* 收藏按钮 - 小红书风格 */
.btn-favorite {
  flex: 0 0 88rpx;
  width: 88rpx;
  height: 88rpx;
  background-color: #f5f5f5;
  border-radius: 50%;
}

.btn-favorite .icon {
  font-size: 48rpx;
  color: #999;
}

.btn-favorite.active .icon {
  color: #FFD700;
}

.btn-diy {
  background-color: #07c160;
  color: #fff;
}

.btn-order {
  background-color: #1890ff;
  color: #fff;
}
</style>

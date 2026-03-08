<template>
  <view class="recipe-detail-page">
    <!-- 封面静态图 -->
    <view class="cover-section">
      <image
        v-if="recipe.coverImageUrl"
        :src="normalizeImageUrl(recipe.coverImageUrl)"
        mode="aspectFill"
        class="cover-image"
        @tap="previewImage"
      />
      <view v-else class="cover-placeholder">
        <text class="placeholder-text">{{ recipe.name.charAt(0) }}</text>
      </view>
      <!-- 封面标题 - 显示在左上角 -->
      <view v-if="recipe.coverTitle" class="cover-title-overlay">
        <text class="cover-title-text">{{ recipe.coverTitle }}</text>
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

<!-- 普通script：定义分享函数 -->
<script lang="ts">
import { CURRENT_SHARE_CONFIG } from '@/config/share.config'

// 模块级变量，存储当前食谱信息
let currentRecipeName = ''
let currentRecipeCoverImageUrl = ''
let currentRecipeId = ''

// 导出函数供setup调用
export function updateShareInfo(name: string, coverImageUrl: string, id: string) {
  currentRecipeName = name
  currentRecipeCoverImageUrl = coverImageUrl
  currentRecipeId = id
  console.log('[Recipe Share] 分享信息已更新:', { name, coverImageUrl, id })
}

export default {
  onShareAppMessage() {
    console.log('[Recipe Share] ========== 转发给朋友分享函数被调用 ==========')
    console.log('[Recipe Share] 当前食谱名称:', currentRecipeName)
    console.log('[Recipe Share] 当前食谱ID:', currentRecipeId)
    console.log('[Recipe Share] 当前封面图:', currentRecipeCoverImageUrl)

    // 动态生成标题
    const title = currentRecipeName
      ? `${currentRecipeName} | Seven的厨房`
      : '精选食谱 | Seven的厨房'

    // 动态选择图片：优先使用食谱封面图，否则使用默认食谱图
    const imageUrl = currentRecipeCoverImageUrl || CURRENT_SHARE_CONFIG.recipeImageUrl

    // 动态生成路径
    const path = currentRecipeId
      ? `/pages/recipe-detail/index?recipeId=${currentRecipeId}`
      : '/pages/home/index'

    const config = { title, imageUrl, path }

    console.log('[Recipe Share] 分享配置:', JSON.stringify(config, null, 2))
    console.log('[Recipe Share] 标题:', title)
    console.log('[Recipe Share] 图片URL:', imageUrl)
    console.log('[Recipe Share] 路径:', path)

    return config
  },
  onShareTimeline() {
    console.log('[Recipe Share] ========== 分享到朋友圈函数被调用 ==========')
    console.log('[Recipe Share] 当前食谱名称:', currentRecipeName)
    console.log('[Recipe Share] 当前封面图:', currentRecipeCoverImageUrl)

    // 动态生成标题
    const title = currentRecipeName
      ? `${currentRecipeName} | Seven的厨房`
      : '精选食谱 | Seven的厨房'

    // 动态选择图片：优先使用食谱封面图，否则使用默认食谱图
    const imageUrl = currentRecipeCoverImageUrl || CURRENT_SHARE_CONFIG.recipeImageUrl

    const config = { title, imageUrl }

    console.log('[Recipe Share] 朋友圈配置:', JSON.stringify(config, null, 2))
    console.log('[Recipe Share] 标题:', title)
    console.log('[Recipe Share] 图片URL:', imageUrl)

    return config
  }
}
</script>

<!-- Setup script：业务逻辑 -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request, addFavorite, removeFavorite, checkFavorite } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'

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
  coverTitle?: string
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
  coverTitle: undefined,
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

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage.options?.recipeId || ''

  dogId.value = uni.getStorageSync('dogId') || null

  // 【修复】先加载健康标签映射，再加载食谱详情
  // 这样可以确保在渲染标签时，映射表已经准备好了
  await loadHealthTagMapping()

  if (recipeId.value) {
    loadRecipeDetail()
    // 只有登录时才检查收藏状态，避免显示"请先登录"提示
    const token = uni.getStorageSync('token')
    if (token) {
      checkFavoriteStatus()
    }
  }
})

function loadRecipeDetail() {
  uni.showLoading({ title: '加载中...' })

  request({
    url: `/recipes/${recipeId.value}`,
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      // Debug: Log API response to diagnose preparationMethod issue
      console.log('[RecipeDetail] API Response:', {
        recipeId: res.data.id,
        recipeName: res.data.name,
        totalItems: res.data.items?.length,
        firstItem: res.data.items?.[0] ? {
          name: res.data.items[0].name,
          preparationMethod: res.data.items[0].preparationMethod,
          prepMethodType: typeof res.data.items[0].preparationMethod
        } : null
      })

      recipe.value = res.data

      // 更新分享信息
      updateShareInfo(
        res.data.name || '',
        res.data.coverImageUrl || '',
        res.data.id || ''
      )

      // Debug: Log recipe value after assignment
      console.log('[RecipeDetail] recipe.value.items[0]:', {
        name: recipe.value.items[0]?.name,
        preparationMethod: recipe.value.items[0]?.preparationMethod
      })
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

function loadHealthTagMapping(): Promise<void> {
  return request({
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
      console.log('[RecipeDetail] 健康标签映射表加载完成，共', Object.keys(uuidMap).length, '个标签')
    }
  }).catch((err: any) => {
    console.error('Load health tag mapping error:', err)
  })
}

async function checkFavoriteStatus() {
  // Debug: Log recipeId
  console.log('[RecipeDetail] Checking favorite for recipeId:', recipeId.value)

  try {
    const result = await checkFavorite(recipeId.value)
    console.log('[RecipeDetail] Favorite status from API:', result)
    isFavorite.value = result.isFavorite
    console.log('[RecipeDetail] isFavorite set to:', isFavorite.value)
  } catch (error: any) {
    console.error('[RecipeDetail] Failed to check favorite status:', error)
    // 未登录或其他错误时，保持false状态，不显示错误提示
    isFavorite.value = false
  }
}

async function toggleFavorite() {
  // 检查是否登录
  const token = uni.getStorageSync('token')
  if (!token) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    // 延迟跳转到登录页
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/login/index'
      })
    }, 1500)
    return
  }

  try {
    if (isFavorite.value) {
      // 取消收藏
      await removeFavorite(recipeId.value)
      isFavorite.value = false
      uni.showToast({
        title: '已取消收藏',
        icon: 'success'
      })
    } else {
      // 添加收藏
      await addFavorite(recipeId.value)
      isFavorite.value = true
      uni.showToast({
        title: '已收藏',
        icon: 'success'
      })
    }
  } catch (error: any) {
    console.error('[RecipeDetail] Failed to toggle favorite:', error)
    // 如果是未授权错误，提示登录
    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('未授权')) {
      uni.showToast({
        title: '请先登录',
        icon: 'none'
      })
      setTimeout(() => {
        uni.navigateTo({
          url: '/pages/login/index'
        })
      }, 1500)
    } else {
      uni.showToast({
        title: error.message || '操作失败',
        icon: 'none'
      })
    }
    // 如果失败，恢复原状态
    isFavorite.value = !isFavorite.value
  }
}

function previewImage() {
  if (!recipe.value.coverImageUrl) return

  const normalizedUrl = normalizeImageUrl(recipe.value.coverImageUrl)
  uni.previewImage({
    urls: [normalizedUrl],
    current: normalizedUrl
  })
}

function generateDiySheet() {
  // 检查是否登录
  const token = uni.getStorageSync('token')
  if (!token) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    // 延迟跳转到登录页
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/login/index'
      })
    }, 1500)
    return
  }

  // 已登录，直接跳转到DIY配置页面
  uni.navigateTo({
    url: `/pages/recipe-diy/index?recipeId=${recipeId.value}`
  })
}

function goToOrder() {
  // 检查是否登录
  const token = uni.getStorageSync('token')
  if (!token) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    // 延迟跳转到登录页
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/login/index'
      })
    }, 1500)
    return
  }

  // 已登录，跳转到订购配置页面
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
  const result = map[stage]
  if (!result) {
    console.warn('[RecipeDetail] 未知的生命阶段标签:', stage)
  }
  return result || stage
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

  // 如果都找不到，记录警告并返回原始值
  console.warn('[RecipeDetail] 未找到健康标签映射:', tagOrUuid, '当前映射表大小:', Object.keys(healthTagUuidLabelMap.value).length)
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
  if (!item.nutrientTargetKey) return ''

  let unit = ''

  // 策略1: 从item.properties获取（如果有）
  if (item.properties?.active_nutrients) {
    const nutrientData = item.properties.active_nutrients[item.nutrientTargetKey]
    if (nutrientData && typeof nutrientData === 'object') {
      unit = nutrientData.unit || ''
    }
  }

  // 策略2: 从item.ingredient.properties获取（如果有）
  if (!unit && (item as any).ingredient?.properties?.active_nutrients) {
    const nutrientData = (item as any).ingredient.properties.active_nutrients[item.nutrientTargetKey]
    if (nutrientData && typeof nutrientData === 'object') {
      unit = nutrientData.unit || ''
    }
  }

  return unit
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
  position: relative;
}

.cover-image {
  width: 100%;
  height: 100%;
}

/* 封面标题覆盖层 */
.cover-title-overlay {
  position: absolute;
  top: 24rpx;
  left: 24rpx;
  background: rgba(0, 0, 0, 0.6);
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  max-width: 60%;
}

.cover-title-text {
  color: #fff;
  font-size: 28rpx;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
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
  text-align: center;
}

.section-label {
  font-size: 26rpx;
  color: #666;
  display: inline-block;
  margin-right: 8rpx;
}

.tags-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
  gap: 8rpx;
}

.tags-row .section-label {
  margin-right: 0;
  margin-bottom: 8rpx;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  justify-content: center;
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

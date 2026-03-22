<template>
  <view class="home-container">
    <!-- 登录引导Banner（游客模式显示） -->
    <view v-if="showLoginBanner && !isLoggedIn" class="login-banner">
      <view class="banner-content">
        <text class="banner-icon">🔔</text>
        <view class="banner-text">
          <text class="banner-title">登录后可创建狗狗档案，进行饭量计算等功能</text>
        </view>
        <view class="banner-actions">
          <text class="banner-login-btn" @tap="goToLogin">立即登录</text>
          <text class="banner-close" @tap="closeBanner">×</text>
        </view>
      </view>
    </view>

    <!-- 顶部欢迎区 -->
    <view class="header-section">
      <view class="welcome-text">Hi~欢迎来到Seven的厨房</view>
    </view>

    <!-- 快捷功能入口 -->
    <view class="quick-actions">
      <view class="action-item" @tap="goToWeightManagement">
        <image class="action-icon-img" src="/static/icons/weight-management.png" mode="aspectFit" />
        <text class="action-text">体重管理</text>
      </view>
      <view class="action-item" @tap="goToCalculatePortion">
        <image class="action-icon-img" src="/static/icons/portion-calculator.png" mode="aspectFit" />
        <text class="action-text">饭量计算</text>
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
          <view class="dog-info">
            <view class="dog-name-row">
              <text class="dog-name">{{ dog.name }}</text>
              <text class="dog-gender" :class="dog.gender === 'MALE' ? 'male' : 'female'">
                {{ dog.gender === 'MALE' ? '♂' : '♀' }}
              </text>
            </view>
            <text class="dog-breed">{{ dog.breedName || '未知品种' }}</text>
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
      <text class="empty-title">还没有狗狗档案</text>
      <text class="empty-desc">创建档案后，才能使用食谱饭量计算等功能</text>
      <button v-if="!isLoggedIn" class="create-btn" @tap="goToLogin">立即登录</button>
      <button v-else class="create-btn" @tap="goToDogCreate">创建档案</button>
    </view>

    <!-- 食谱橱窗标题 -->
    <view class="recipe-showcase-header">
      <text class="section-title">食谱橱窗</text>
      <text class="recipe-count">共 {{ totalCount }} 道食谱</text>
      <text v-if="activeFiltersCount > 0" class="clear-all" @tap="clearAllFilters">清除筛选</text>
    </view>

    <!-- 固定筛选栏 -->
    <view class="filter-bar">
      <view class="filter-buttons">
        <!-- 适用生命阶段按钮 -->
        <view
          :class="['filter-btn', { active: filterState.selectedLifeStages.length > 0 }]"
          @tap="openLifeStageDrawer"
        >
          <text class="filter-btn-text">{{ getLifeStageButtonText() }}</text>
          <text class="dropdown-arrow">▼</text>
          <text
            v-if="filterState.selectedLifeStages.length > 0"
            class="remove-icon"
            @tap.stop="removeLifeStages"
          >×</text>
        </view>

        <!-- 健康类型按钮 -->
        <view
          :class="['filter-btn', { active: filterState.selectedHealthTags.length > 0 }]"
          @tap="openHealthTagsDrawer"
        >
          <text class="filter-btn-text">{{ getHealthTagsButtonText() }}</text>
          <text class="dropdown-arrow">▼</text>
          <text
            v-if="filterState.selectedHealthTags.length > 0"
            class="remove-icon"
            @tap.stop="removeHealthTags"
          >×</text>
        </view>

        <!-- 不吃这些按钮 -->
        <view
          :class="['filter-btn', { excluded: filterState.excludedIngredientTags.length > 0 }]"
          @tap="openExcludedTagsDrawer"
        >
          <text class="filter-btn-text">{{ getExcludedTagsButtonText() }}</text>
          <text class="dropdown-arrow">▼</text>
          <text
            v-if="filterState.excludedIngredientTags.length > 0"
            class="remove-icon"
            @tap.stop="removeExcludedTags"
          >×</text>
        </view>
      </view>
    </view>

    <!-- 食谱列表信息流 -->
    <view class="recipe-list">
      <view
        v-for="recipe in recipes"
        :key="recipe.id"
        class="recipe-card"
        @tap="viewRecipe(recipe.id)"
      >
        <!-- 封面图容器 - 使用固定高度容器避免布局问题 -->
        <view class="recipe-cover-wrapper">
          <image
            v-if="recipe.coverImageUrl"
            class="recipe-cover"
            :src="normalizeImageUrl(recipe.coverImageUrl)"
            mode="aspectFill"
            lazy-load
          />
          <view v-else class="recipe-cover placeholder">
            <text class="placeholder-text">{{ (recipe.name && recipe.name.charAt(0)) || '?' }}</text>
          </view>
        </view>

        <!-- 食谱信息 - 使用强制渲染 -->
        <view class="recipe-info" :id="'info-' + recipe.id">
          <view class="recipe-name">{{ recipe.name || '未命名食谱' }}</view>

          <!-- 生命阶段和健康标签合并 -->
          <view
            v-if="(recipe.applicableLifeStages && recipe.applicableLifeStages.length > 0) ||
                   (recipe.targetHealthTags && recipe.targetHealthTags.length > 0)"
            class="tags-row"
          >
            <text class="tags-label">适用于：</text>
            <view class="tags">
              <!-- 生命阶段标签 -->
              <text
                v-for="stage in recipe.applicableLifeStages"
                :key="'stage-' + stage"
                class="tag life-stage-tag"
              >
                {{ getLifeStageLabel(stage) }}
              </text>
              <!-- 健康标签 -->
              <text
                v-for="tag in recipe.targetHealthTags"
                :key="'health-' + tag"
                class="tag health-tag"
              >
                {{ getHealthTagLabel(tag) }}
              </text>
            </view>
          </view>

          <!-- 主要原料 (前6名) -->
          <view v-if="recipe.items && recipe.items.length > 0" class="ingredients">
            <text class="ingredients-label">主要原料：</text>
            <text class="ingredients-list">
              {{ recipe.items.map((item: RecipeItem) => item.name).join('、') }}
            </text>
          </view>
        </view>
      </view>

      <!-- 加载状态 -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- 没有更多 -->
      <view v-if="!hasMore && recipes.length > 0" class="no-more">
        <text>没有更多了</text>
      </view>

      <!-- 空状态 -->
      <view v-if="recipes.length === 0 && !loading" class="empty-recipe-state">
        <view class="empty-icon">🥗</view>
        <view class="empty-title">暂无食谱</view>
        <view class="empty-subtitle">当前筛选条件下没有找到食谱</view>
        <button class="btn-reset" @tap="resetFilters">重置筛选</button>
      </view>
    </view>

    <!-- 适用生命阶段筛选抽屉 -->
    <view v-if="showLifeStageDrawer" class="drawer-mask" @tap="applyLifeStagesFilter">
      <view class="drawer-content" @tap.stop>
        <view class="drawer-header">
          <text class="drawer-title">适用生命阶段</text>
          <text class="close-btn" @tap="applyLifeStagesFilter">×</text>
        </view>
        <view class="drawer-desc">可多选，筛选适用所选生命阶段的食谱</view>
        <scroll-view class="drawer-body" scroll-y>
          <view class="tag-grid">
            <view
              v-for="stage in filterOptions.lifeStages"
              :key="stage.value"
              class="tag-item"
              :class="{ active: filterState.selectedLifeStages.includes(stage.value) }"
              @tap="toggleLifeStage(stage.value)"
            >
              {{ stage.label }}
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 健康类型筛选抽屉 -->
    <view v-if="showHealthTagsDrawer" class="drawer-mask" @tap="applyHealthTagsFilter">
      <view class="drawer-content" @tap.stop>
        <view class="drawer-header">
          <text class="drawer-title">健康类型</text>
          <text class="close-btn" @tap="applyHealthTagsFilter">×</text>
        </view>
        <view class="drawer-desc">可多选，筛选具有所选健康标签的食谱</view>
        <scroll-view class="drawer-body" scroll-y>
          <view class="tag-grid">
            <view
              v-for="tag in filterOptions.healthTags"
              :key="tag.value"
              class="tag-item"
              :class="{ active: filterState.selectedHealthTags.includes(tag.value) }"
              @tap="toggleHealthTag(tag.value)"
            >
              {{ tag.label }}
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 不吃这些筛选抽屉 -->
    <view v-if="showExcludedTagsDrawer" class="drawer-mask" @tap="applyExcludedTagsFilter">
      <view class="drawer-content" @tap.stop>
        <view class="drawer-header">
          <text class="drawer-title">🚫 不吃这些</text>
          <text class="close-btn" @tap="applyExcludedTagsFilter">×</text>
        </view>
        <scroll-view class="drawer-body" scroll-y>
          <view class="drawer-desc">排除包含以下食材的食谱</view>

          <!-- 已选排除 -->
          <view v-if="filterState.excludedIngredientTags.length > 0" class="excluded-tags">
            <text class="excluded-label">已选排除：</text>
            <view
              v-for="tag in filterState.excludedIngredientTags"
              :key="tag"
              class="excluded-tag"
              @tap="removeExcludedTag(tag)"
            >
              {{ getIngredientTagLabel(tag) }} ×
            </view>
          </view>

          <view class="section-subtitle">选择要排除的食材标签</view>
          <view class="tag-grid">
            <view
              v-for="tag in filterOptions.ingredientTags"
              :key="tag.value"
              class="tag-item"
              :class="{ excluded: filterState.excludedIngredientTags.includes(tag.value) }"
              @tap="toggleExcludedTag(tag.value)"
            >
              {{ tag.label }}
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { request, getToken } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import { CURRENT_SHARE_CONFIG } from '@/config/share.config'

interface RecipeItem {
  ingredientId: string
  name: string
  ratio: number
}

interface Recipe {
  id: string
  name: string
  version: number
  status: string
  energyDensityKcalPerKg: number
  coverImageUrl?: string
  targetHealthTags: string[]
  applicableLifeStages: string[]
  items: RecipeItem[]
}

// 筛选选项类型
interface FilterOption {
  value: string
  label: string
  count: number
}

interface FilterOptions {
  lifeStages: FilterOption[]
  healthTags: FilterOption[]
  ingredientTags: FilterOption[]
}

// 筛选状态
interface FilterState {
  selectedLifeStages: string[]
  selectedHealthTags: string[]
  excludedIngredientTags: string[]
}

// 登录状态
const isLoggedIn = ref(false)
const showLoginBanner = ref(true)

// 狗狗列表
const dogs = ref<any[]>([])

// 食谱数据
const recipes = ref<Recipe[]>([])
const loading = ref(false)
const hasMore = ref(true)
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = 10

// 筛选相关
const showLifeStageDrawer = ref(false)
const showHealthTagsDrawer = ref(false)
const showExcludedTagsDrawer = ref(false)
const filterOptions = ref<FilterOptions>({
  lifeStages: [],
  healthTags: [],
  ingredientTags: []
})
const filterState = ref<FilterState>({
  selectedLifeStages: [],
  selectedHealthTags: [],
  excludedIngredientTags: []
})

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 计算已选筛选数量
const activeFiltersCount = computed(() => {
  let count = 0
  count += filterState.value.selectedLifeStages.length
  count += filterState.value.selectedHealthTags.length
  count += filterState.value.excludedIngredientTags.length
  return count
})

// 检查登录状态
const checkLoginStatus = () => {
  const token = getToken()
  isLoggedIn.value = !!token
  console.log('[Home] 登录状态检查:', isLoggedIn.value)
}

// 页面加载
onMounted(async () => {
  console.log('[Home] onMounted')
  checkLoginStatus()

  // 检查是否已关闭过Banner（当天有效）
  const bannerClosed = uni.getStorageSync('loginBannerClosed')
  const bannerClosedDate = uni.getStorageSync('loginBannerClosedDate')
  const today = new Date().toDateString()

  if (bannerClosed && bannerClosedDate === today) {
    showLoginBanner.value = false
  }

  // 加载数据（只在已登录时）
  if (isLoggedIn.value) {
    loadDogList()
  } else {
    // 未登录时确保清空狗狗数据
    if (dogs.value.length > 0) {
      console.log('[Home] Not logged in, clearing dog data')
      dogs.value = []
    }
  }

  // 【修复】先加载筛选项（包含健康标签映射），再加载食谱
  // 这样可以确保在渲染食谱标签时，映射表已经准备好了
  await loadFilterOptions()
  loadRecipes()
})

// 页面显示时重新检查登录状态（解决switchTab后不更新的问题）
onShow(() => {
  console.log('[Home] onShow - 重新检查登录状态')
  console.log('[Home] Current dogs count:', dogs.value.length)

  checkLoginStatus()

  // 更新自定义 TabBar 状态
  // 注意：自定义TabBar会在页面切换时自动检测当前页面路径并更新selected状态
  // 不需要页面主动调用更新方法

  // 根据登录状态处理狗狗数据
  if (isLoggedIn.value) {
    // 已登录：每次都重新加载狗狗数据（确保显示最新数据）
    console.log('[Home] Logged in, reloading dog list')
    loadDogList()
  } else {
    // 未登录：清空狗狗数据（避免显示前一个用户的数据）
    console.log('[Home] Not logged in, current dogs count:', dogs.value.length)
    if (dogs.value.length > 0) {
      console.log('[Home] User logged out, clearing dog data')
      dogs.value = []
      console.log('[Home] Dog data cleared, new count:', dogs.value.length)
    } else {
      console.log('[Home] No dog data to clear')
    }
  }
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

// ==================== 食谱相关方法 ====================

// 加载筛选项（返回 Promise 以支持 await）
function loadFilterOptions(): Promise<void> {
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
      console.log('[Home] 健康标签映射表加载完成，共', Object.keys(uuidMap).length, '个标签')

      // 添加"全部"选项
      filterOptions.value = {
        lifeStages: [
          { value: '', label: '全部', count: res.data.total || 0 },
          ...res.data.lifeStages || []
        ],
        healthTags: [
          { value: '', label: '全部', count: res.data.total || 0 },
          ...res.data.healthTags || []
        ],
        ingredientTags: res.data.ingredientTags || []
      }
    }
  }).catch((err: any) => {
    console.error('[Home] Load filter options error:', err)
  })
}

// 加载食谱
function loadRecipes(isRefresh = false) {
  if (loading.value) return

  // 如果没有更多数据且不是刷新，直接返回
  if (!hasMore.value && !isRefresh) {
    console.log('[Home] No more recipes to load')
    return
  }

  loading.value = true

  // 只在非刷新模式时显示loading
  const shouldShowLoading = !isRefresh
  if (shouldShowLoading) {
    uni.showLoading({ title: '加载中...' })
  }

  // 如果是刷新，重置页码
  if (isRefresh) {
    currentPage.value = 1
  }

  // 构建筛选参数和分页参数
  const params: any = {
    page: currentPage.value,
    pageSize: pageSize
  }
  if (filterState.value.selectedLifeStages.length > 0) {
    params.lifeStages = filterState.value.selectedLifeStages.join(',')
  }
  if (filterState.value.selectedHealthTags.length > 0) {
    params.healthTags = filterState.value.selectedHealthTags.join(',')
  }
  if (filterState.value.excludedIngredientTags.length > 0) {
    params.excludeTags = filterState.value.excludedIngredientTags.join(',')
  }

  console.log('[Home] Loading recipes with params:', params)

  request({
    url: '/recipes',
    method: 'GET',
    data: params
  }).then((res: any) => {
    console.log('[Home] Recipes Response:', {
      code: res.code,
      dataLength: res.data?.data?.length || 0,
      data: res.data
    })

    if (res.code === 0 && res.data) {
      // 后端现在返回分页数据格式：{ data: [], total, page, pageSize, hasMore }
      const newRecipes = res.data.data || []

      if (isRefresh) {
        recipes.value = newRecipes
      } else {
        recipes.value = [...recipes.value, ...newRecipes]
      }

      // 调试：检查每个食谱的name字段
      newRecipes.forEach((recipe: Recipe, index: number) => {
        if (!recipe.name || recipe.name.trim() === '') {
          console.warn('[Home] 食谱缺少name字段:', { index, id: recipe.id, recipe })
        }
      })

      // 更新分页状态
      totalCount.value = res.data.total || 0
      hasMore.value = res.data.hasMore !== undefined ? res.data.hasMore : false

      // 如果有更多数据，页码+1
      if (hasMore.value) {
        currentPage.value++
      }

      console.log('[Home] Load recipes complete:', {
        currentPage: currentPage.value,
        hasMore: hasMore.value,
        totalCount: totalCount.value,
        recipesCount: recipes.value.length
      })
    } else {
      console.warn('[Home] Unexpected response:', res)
      hasMore.value = false
    }
  }).catch((err: any) => {
    console.error('[Home] Load recipes error:', err)
    hasMore.value = false
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }).finally(() => {
    loading.value = false
    // 只在之前显示了loading时才隐藏
    if (shouldShowLoading) {
      uni.hideLoading()
    }
    if (isRefresh) {
      uni.stopPullDownRefresh()
    }
  })
}

// ==================== 筛选相关方法 ====================

// 打开生命阶段抽屉
function openLifeStageDrawer() {
  showLifeStageDrawer.value = true
}

// 打开健康标签抽屉
function openHealthTagsDrawer() {
  showHealthTagsDrawer.value = true
}

// 打开排除标签抽屉
function openExcludedTagsDrawer() {
  showExcludedTagsDrawer.value = true
}

// 关闭所有抽屉
function closeAllDrawers() {
  showLifeStageDrawer.value = false
  showHealthTagsDrawer.value = false
  showExcludedTagsDrawer.value = false
  // 选择后自动应用筛选
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1  // 添加缺失的页码重置
  loadRecipes(true)  // 传递 isRefresh = true
}

// 获取生命阶段按钮文字
function getLifeStageButtonText(): string {
  if (filterState.value.selectedLifeStages.length > 0) {
    const count = filterState.value.selectedLifeStages.length
    return `适用生命阶段(${count})`
  }
  return '适用生命阶段'
}

// 获取健康标签按钮文字
function getHealthTagsButtonText(): string {
  if (filterState.value.selectedHealthTags.length > 0) {
    const count = filterState.value.selectedHealthTags.length
    return `健康类型(${count})`
  }
  return '健康类型'
}

// 获取排除标签按钮文字
function getExcludedTagsButtonText(): string {
  if (filterState.value.excludedIngredientTags.length > 0) {
    const count = filterState.value.excludedIngredientTags.length
    return `不吃这些(${count})`
  }
  return '不吃这些'
}

// 快速删除生命阶段
function removeLifeStages() {
  filterState.value.selectedLifeStages = []
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)  // 传递 isRefresh = true
}

// 快速删除健康标签
function removeHealthTags() {
  filterState.value.selectedHealthTags = []
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)  // 传递 isRefresh = true
}

// 快速删除排除标签
function removeExcludedTags() {
  filterState.value.excludedIngredientTags = []
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)  // 传递 isRefresh = true
}

// 切换生命阶段
function toggleLifeStage(stage: string) {
  const index = filterState.value.selectedLifeStages.indexOf(stage)
  if (index > -1) {
    filterState.value.selectedLifeStages.splice(index, 1)
  } else {
    filterState.value.selectedLifeStages.push(stage)
  }
}

// 应用生命阶段筛选
function applyLifeStagesFilter() {
  showLifeStageDrawer.value = false
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)  // 传递 isRefresh = true，确保使用替换逻辑而不是追加逻辑
}

// 切换健康标签
function toggleHealthTag(tag: string) {
  const index = filterState.value.selectedHealthTags.indexOf(tag)
  if (index > -1) {
    filterState.value.selectedHealthTags.splice(index, 1)
  } else {
    filterState.value.selectedHealthTags.push(tag)
  }
}

// 应用健康标签筛选
function applyHealthTagsFilter() {
  showHealthTagsDrawer.value = false
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)  // 传递 isRefresh = true
}

// 切换排除食材标签
function toggleExcludedTag(tag: string) {
  const index = filterState.value.excludedIngredientTags.indexOf(tag)
  if (index > -1) {
    filterState.value.excludedIngredientTags.splice(index, 1)
  } else {
    filterState.value.excludedIngredientTags.push(tag)
  }
}

// 应用排除标签筛选
function applyExcludedTagsFilter() {
  showExcludedTagsDrawer.value = false
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)  // 传递 isRefresh = true
}

// 移除已选排除标签
function removeExcludedTag(tag: string) {
  const index = filterState.value.excludedIngredientTags.indexOf(tag)
  if (index > -1) {
    filterState.value.excludedIngredientTags.splice(index, 1)
  }
}

// 获取食材标签名称
function getIngredientTagLabel(tagId: string): string {
  const tag = filterOptions.value.ingredientTags.find(t => t.value === tagId)
  return tag?.label || tagId
}

// 清除所有筛选
function clearAllFilters() {
  filterState.value = {
    selectedLifeStages: [],
    selectedHealthTags: [],
    excludedIngredientTags: []
  }
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes()
}

// 重置筛选
function resetFilters() {
  clearAllFilters()
}

// 查看食谱详情
function viewRecipe(recipeId: string) {
  uni.navigateTo({
    url: `/pages/recipe-detail/index?recipeId=${recipeId}`
  })
}

// 获取生命阶段标签
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
    console.warn('[Home] 未知的生命阶段标签:', stage)
  }
  return result || stage
}

// 获取健康标签
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
  console.warn('[Home] 未找到健康标签映射:', tagOrUuid, '当前映射表大小:', Object.keys(healthTagUuidLabelMap.value).length)
  return tagOrUuid
}

// 下拉刷新
onPullDownRefresh(() => {
  console.log('[Home] Pull down refresh')
  recipes.value = []
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)
})

// 上拉加载更多
onReachBottom(() => {
  if (!loading.value && hasMore.value) {
    loadRecipes()
  }
})

// ==================== 跳转方法 ====================

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
  uni.navigateTo({ url: `/pages/dog-create/index?dogId=${dogId}` })
}

// 跳转到订单列表
const goToOrderList = () => {
  uni.navigateTo({ url: '/pages/orders-list/index' })
}

// 跳转到体重管理
const goToWeightManagement = () => {
  if (!isLoggedIn.value) {
    checkLoginAndNavigate('/pages/weight-management/index')
    return
  }
  uni.navigateTo({ url: '/pages/weight-management/index' })
}

// 跳转到饭量计算
const goToCalculatePortion = () => {
  uni.navigateTo({ url: '/pages/calculate-portion/index' })
}

// 关闭登录Banner
const closeBanner = () => {
  showLoginBanner.value = false
  const today = new Date().toDateString()
  uni.setStorageSync('loginBannerClosed', true)
  uni.setStorageSync('loginBannerClosedDate', today)
}

// 跳转登录页
const goToLogin = () => {
  uni.navigateTo({
    url: '/pages/login/index'
  })
}

// 跳转到食谱定制
const goToRecipeDIY = () => {
  console.log('=== 点击了食谱定制按钮 ===')
  console.log('当前登录状态:', isLoggedIn.value)

  if (!isLoggedIn.value) {
    console.log('未登录，跳转到登录页')
    checkLoginAndNavigate('/pages/custom-recipe/index')
    return
  }

  const targetUrl = '/pages/custom-recipe/index'
  console.log('准备跳转到:', targetUrl)
  uni.navigateTo({
    url: targetUrl,
    success: () => {
      console.log('✅ 跳转成功')
    },
    fail: (err: any) => {
      console.log('❌ 跳转失败:', err)
    }
  })
}

// 检查登录状态并跳转
const checkLoginAndNavigate = (url: string) => {
  if (!isLoggedIn.value) {
    uni.showModal({
      title: '提示',
      content: '该功能需要登录后使用，是否立即登录？',
      success: (res) => {
        if (res.confirm) {
          goToLogin()
        }
      }
    })
    return
  }
  uni.navigateTo({ url })
}

// 配置分享功能
defineOptions({
  onShareAppMessage() {
    console.log('[Home Share] ========== 转发给朋友分享函数被调用 ==========')
    const config = {
      title: 'Seven的厨房 - 为您的爱犬定制健康食谱',
      imageUrl: CURRENT_SHARE_CONFIG.homeImageUrl,
      path: '/pages/home/index'
    }
    console.log('[Home Share] 分享配置:', JSON.stringify(config, null, 2))
    console.log('[Home Share] 图片URL:', config.imageUrl)
    return config
  },
  onShareTimeline() {
    console.log('[Home Share] ========== 分享到朋友圈函数被调用 ==========')
    const config = {
      title: 'Seven的厨房 - 为您的爱犬定制健康食谱',
      imageUrl: CURRENT_SHARE_CONFIG.homeImageUrl
    }
    console.log('[Home Share] 朋友圈配置:', JSON.stringify(config, null, 2))
    console.log('[Home Share] 图片URL:', config.imageUrl)
    return config
  }
})
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 20px;
}

/* 登录引导Banner */
.login-banner {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  padding: 24rpx 32rpx;
}

.banner-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.banner-icon {
  font-size: 40rpx;
  margin-right: 16rpx;
}

.banner-text {
  flex: 1;
  margin-right: 16rpx;
}

.banner-title {
  font-size: 28rpx;
  color: #333;
  line-height: 40rpx;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.banner-login-btn {
  background: #fff;
  color: #e17055;
  padding: 12rpx 24rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
  font-weight: bold;
}

.banner-close {
  font-size: 48rpx;
  color: #333;
  line-height: 1;
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

.action-icon-img {
  width: 32px;
  height: 32px;
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
  /* 确保右侧有padding，让最后一张卡片右边也有空间 */
  padding-right: 20rpx;
  /* 强制容器不换行 */
  overflow-x: scroll;
  /* 隐藏滚动条但保留滚动功能 */
  -webkit-overflow-scrolling: touch;
}

.dog-scroll::-webkit-scrollbar {
  display: none;
}

.dog-card {
  display: inline-flex;
  align-items: center;
  /* 强制固定宽度，确保能明显露出下一张卡片 */
  width: 220rpx !important;
  min-width: 220rpx !important;
  max-width: 220rpx !important;
  flex-shrink: 0 !important; /* 防止卡片被压缩 */
  background: #f8f8f8;
  border-radius: 8px;
  padding: 15px;
  margin-right: 20rpx; /* 增加卡片间距 */
  vertical-align: top;
  box-sizing: border-box !important;
}

.dog-card.add-dog {
  border: 1px dashed #ccc;
  background: white;
  flex-direction: column;
  justify-content: center;
}

.dog-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.dog-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dog-name {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.dog-gender {
  font-size: 12px;
  font-weight: bold;
}

.dog-gender.male {
  color: #1890ff;
}

.dog-gender.female {
  color: #ff69b4;
}

.dog-breed {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dog-detail {
  font-size: 12px;
  color: #999;
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

/* ==================== 食谱橱窗样式 ==================== */

/* 筛选区域 */
.filter-bar {
  background-color: #fff;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #e5e5e5;
  position: sticky;
  top: 0;
  z-index: 10;
}

.filter-scroll {
  white-space: nowrap;
}

.filter-group {
  display: flex;
  padding: 0 20rpx;
}

.filter-tag {
  display: inline-block;
  padding: 12rpx 24rpx;
  margin-right: 16rpx;
  border-radius: 40rpx;
  font-size: 28rpx;
  background-color: #f0f0f0;
  color: #666;
  border: 2rpx solid transparent;
  transition: all 0.3s;
}

.filter-tag.active {
  background-color: #07c160;
  color: #fff;
  border-color: #07c160;
}

/* 食谱列表 */
.recipe-list {
  padding: 20rpx;
}

.recipe-card {
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
  /* 隔离每个卡片的渲染，避免相互影响 */
  contain: layout style;
}

/* 封面图容器 - 固定高度避免布局问题 */
.recipe-cover-wrapper {
  width: 100%;
  height: 360rpx;
  position: relative;
  overflow: hidden;
  /* 隔离图片渲染，避免影响后续元素 */
  contain: layout;
}

/* 封面图 */
.recipe-cover {
  width: 100%;
  height: 100%;
  display: block;
}

.recipe-cover.placeholder {
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

/* 食谱信息 */
.recipe-info {
  padding: 24rpx;
  position: relative;
  z-index: 1;
  background-color: #fff;
  /* 强制 GPU 加速，避免渲染阻塞 */
  transform: translateZ(0);
  will-change: transform;
}

.recipe-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
  line-height: 1.4;
  word-break: break-all;
  overflow-wrap: break-word;
  min-height: 45rpx;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 16rpx;
  gap: 8rpx;
}

.tags-label {
  font-size: 26rpx;
  color: #666;
  flex-shrink: 0;
}

.tags-row .tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
  gap: 8rpx;
}

.tag {
  display: inline-block;
  padding: 6rpx 16rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
  white-space: nowrap;
}

.life-stage-tag {
  background-color: #e3f2fd;
  color: #1976d2;
}

.health-tag {
  background-color: #fff3e0;
  color: #f57c00;
}

.ingredients {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
  display: flex;
  flex-wrap: wrap;
}

.ingredients-label {
  color: #999;
  flex-shrink: 0;
}

.ingredients-list {
  flex: 1;
}

/* 状态 */
.loading-state,
.no-more {
  text-align: center;
  padding: 40rpx 0;
  color: #999;
  font-size: 28rpx;
}

.empty-recipe-state {
  text-align: center;
  padding: 120rpx 40rpx;
}

.empty-recipe-state .empty-icon {
  font-size: 120rpx;
  margin-bottom: 24rpx;
}

.empty-recipe-state .empty-title {
  font-size: 36rpx;
  font-weight: bold;
  margin-bottom: 16rpx;
  color: #333;
}

.empty-recipe-state .empty-subtitle {
  font-size: 28rpx;
  line-height: 1.6;
  margin-bottom: 40rpx;
  color: #999;
}

.btn-reset {
  width: 240rpx;
  height: 72rpx;
  line-height: 72rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 40rpx;
  font-size: 28rpx;
}

/* ==================== 筛选相关样式 ==================== */

/* 食谱橱窗标题 */
.recipe-showcase-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx 30rpx 20rpx;
  background: #fff;
  gap: 16rpx;
}

.recipe-showcase-header .section-title {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  flex-shrink: 0;
}

.recipe-count {
  font-size: 26rpx;
  color: #999;
  margin-left: auto;
}

.clear-all {
  font-size: 26rpx;
  color: #667eea;
  flex-shrink: 0;
}

/* 固定筛选栏（吸顶） */
.filter-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #fff;
  padding: 20rpx 30rpx;
  border-bottom: 1rpx solid #f0f0f0;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.filter-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  flex-shrink: 0;
}

.filter-buttons {
  display: flex;
  gap: 16rpx;
  flex-wrap: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1;
}

.filter-buttons::-webkit-scrollbar {
  display: none;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 24rpx;
  background: #f5f5f5;
  border-radius: 40rpx;
  font-size: 26rpx;
  color: #666;
  white-space: nowrap;
  border: 2rpx solid transparent;
  transition: all 0.3s;
  flex-shrink: 0;
}

.filter-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-color: #667eea;
}

.filter-btn.excluded {
  background: #ffebee;
  color: #f44336;
  border-color: #f44336;
}

.filter-btn-text {
  max-width: 300rpx;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-arrow {
  font-size: 20rpx;
  color: #999;
  margin-left: 4rpx;
  flex-shrink: 0;
}

.filter-btn.active .dropdown-arrow {
  color: #fff;
}

.filter-btn.excluded .dropdown-arrow {
  color: #f44336;
}

.remove-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32rpx;
  height: 32rpx;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  font-size: 28rpx;
  font-weight: bold;
  flex-shrink: 0;
}

/* 筛选抽屉遮罩 */
.drawer-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 筛选抽屉内容 */
.drawer-content {
  position: absolute;
  top: 100rpx; /* 从筛选栏下方开始显示 */
  left: 30rpx;
  right: 30rpx;
  background: #fff;
  border-radius: 16rpx;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  animation: slideDown 0.3s ease-out;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
  overflow: hidden;
}

@keyframes slideDown {
  from {
    transform: translateY(-20rpx);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 抽屉头部 */
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
  flex-shrink: 0;
}

.drawer-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.close-btn {
  font-size: 60rpx;
  color: #999;
  line-height: 1;
}

/* 抽屉主体 */
.drawer-body {
  flex: 1;
  padding: 32rpx;
  box-sizing: border-box;
  overflow-x: hidden;
}

.drawer-desc {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 24rpx;
  padding: 16rpx 20rpx;
  background: #fff3e0;
  border-radius: 8rpx;
  border-left: 4rpx solid #ff9800;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

/* 标签网格 */
.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.tag-item {
  padding: 16rpx 32rpx;
  background: #f5f5f5;
  border-radius: 40rpx;
  font-size: 28rpx;
  color: #333;
  border: 2rpx solid transparent;
  transition: all 0.3s;
}

.tag-item.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-color: #667eea;
}

.tag-item.excluded {
  background: #ffebee;
  color: #f44336;
  border-color: #f44336;
  text-decoration: line-through;
}

/* 已选排除标签 */
.excluded-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 24rpx;
  padding: 20rpx;
  background: #fff3e0;
  border-radius: 12rpx;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.excluded-label {
  font-size: 26rpx;
  color: #f57c00;
  align-self: center;
}

.excluded-tag {
  padding: 8rpx 20rpx;
  background: #fff;
  border-radius: 24rpx;
  font-size: 24rpx;
  color: #f57c00;
  border: 1rpx solid #ff9800;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.section-subtitle {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 16rpx;
  font-weight: bold;
}
</style>

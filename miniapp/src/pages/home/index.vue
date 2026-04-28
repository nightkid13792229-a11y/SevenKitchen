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
    <view class="header-section" :style="headerSectionStyle"></view>

    <!-- 快捷功能入口 -->
    <view class="quick-actions">
      <view class="action-item" @tap="goToCalculatePortion">
        <image class="action-icon" src="/static/home-actions/calculate-portion.png" mode="aspectFit" />
        <text class="action-text">饭量计算</text>
      </view>
      <view class="action-item" @tap="goToWeightManagement">
        <image class="action-icon" src="/static/home-actions/weight-management.png" mode="aspectFit" />
        <text class="action-text">体重管理</text>
      </view>
      <view class="action-item" @tap="goToHealthRecords">
        <image class="action-icon" src="/static/home-actions/health-records.png" mode="aspectFit" />
        <text class="action-text">健康记录</text>
      </view>
      <view class="action-item" @tap="goToFeedback">
        <image class="action-icon" src="/static/home-actions/feedback.png" mode="aspectFit" />
        <text class="action-text">建议反馈</text>
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
          <image
            class="dog-card-avatar"
            :src="resolveDogAvatarSrc(dog.avatarUrl)"
            mode="aspectFill"
          />
          <view class="dog-card-name-overlay">
            <text class="dog-card-name">{{ dog.name }}</text>
          </view>
        </view>
        <view class="dog-card add-dog" @tap="goToDogCreate">
          <text class="add-icon">+</text>
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
          :class="['filter-btn', { active: filterState.selectedLifeStages.filter(Boolean).length > 0 }]"
          @tap="openLifeStageDrawer"
        >
          <text class="filter-btn-text">{{ getLifeStageButtonText() }}</text>
          <text class="dropdown-arrow">▼</text>
          <text
            v-if="filterState.selectedLifeStages.filter(Boolean).length > 0"
            class="remove-icon"
            @tap.stop="removeLifeStages"
          >×</text>
        </view>

        <!-- 健康类型按钮 -->
        <view
          :class="['filter-btn', { active: filterState.selectedHealthTags.filter(Boolean).length > 0 }]"
          @tap="openHealthTagsDrawer"
        >
          <text class="filter-btn-text">{{ getHealthTagsButtonText() }}</text>
          <text class="dropdown-arrow">▼</text>
          <text
            v-if="filterState.selectedHealthTags.filter(Boolean).length > 0"
            class="remove-icon"
            @tap.stop="removeHealthTags"
          >×</text>
        </view>

        <!-- 不吃这些按钮 -->
        <view
          :class="['filter-btn', { excluded: filterState.excludedIngredients.length > 0 }]"
          @tap="openExcludedTagsDrawer"
        >
          <text class="filter-btn-text">{{ getExcludedTagsButtonText() }}</text>
          <text class="dropdown-arrow">▼</text>
          <text
            v-if="filterState.excludedIngredients.length > 0"
            class="remove-icon"
            @tap.stop="removeExcludedTags"
          >×</text>
        </view>
      </view>
    </view>

    <!-- 食谱列表信息流 -->
    <view class="recipe-list">
      <view
        v-for="recipe in renderedRecipes"
        :key="recipe.id"
        class="recipe-card"
        @tap="viewRecipe(recipe.id)"
      >
        <!-- 封面图容器 - 使用固定高度容器避免布局问题 -->
        <view class="recipe-cover-wrapper">
          <image
            v-if="recipe.displayCoverUrl"
            class="recipe-cover"
            :src="recipe.displayCoverUrl"
            mode="aspectFill"
            lazy-load
            @error="handleRecipeCoverError(recipe)"
          />
          <view v-else class="recipe-cover placeholder">
            <text class="placeholder-text">{{ (recipe.name && recipe.name.charAt(0)) || '?' }}</text>
          </view>
          <view
            v-if="recipe.displayCoverUrl && recipe.coverTitle"
            class="recipe-cover-badge-gradient"
          >
            <text class="recipe-cover-title-badge">{{ recipe.coverTitle }}</text>
          </view>
        </view>

        <!-- 食谱信息 - 使用强制渲染 -->
        <view class="recipe-info" :id="'info-' + recipe.id">
          <view class="recipe-name-row">
            <text class="recipe-name">{{ recipe.name || '未命名食谱' }}</text>
            <view class="recipe-stats">
              <text class="stat-item">👁 {{ formatStatNum(recipe.viewCount) }}</text>
              <text class="stat-item">⭐ {{ formatStatNum(recipe.favoriteCount) }}</text>
              <text class="stat-item">🍳 {{ formatStatNum(recipe.diyGenCount) }}</text>
            </view>
          </view>

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
    <view v-if="showLifeStageDrawer" class="drawer-mask" @tap="cancelLifeStageDrawer">
      <view class="drawer-content" @tap.stop>
        <view class="drawer-header">
          <text class="drawer-title">生命阶段</text>
          <text class="close-btn" @tap="cancelLifeStageDrawer">×</text>
        </view>
        <view class="drawer-desc">可多选，筛选适用所选生命阶段的食谱</view>
        <scroll-view class="drawer-body" scroll-y>
          <view class="tag-grid">
            <view
              v-for="stage in filterOptions.lifeStages"
              :key="stage.value"
              class="tag-item"
              :class="{ active: stage.value ? draftFilterState.selectedLifeStages.includes(stage.value) : draftFilterState.selectedLifeStages.length === 0 }"
              @tap="toggleLifeStage(stage.value)"
            >
              {{ stage.label }}
            </view>
          </view>
        </scroll-view>
        <view class="drawer-actions">
          <view class="drawer-action drawer-action-secondary" @tap="resetLifeStageDraft">重置</view>
          <view class="drawer-action drawer-action-primary" @tap="applyLifeStagesFilter">查看结果</view>
        </view>
      </view>
    </view>

    <!-- 健康类型筛选抽屉 -->
    <view v-if="showHealthTagsDrawer" class="drawer-mask" @tap="cancelHealthTagsDrawer">
      <view class="drawer-content" @tap.stop>
        <view class="drawer-header">
          <text class="drawer-title">疾病/功能</text>
          <text class="close-btn" @tap="cancelHealthTagsDrawer">×</text>
        </view>
        <view class="drawer-desc">可多选，筛选具有所选健康标签的食谱</view>
        <scroll-view class="drawer-body" scroll-y>
          <view class="tag-grid">
            <view
              v-for="tag in filterOptions.healthTags"
              :key="tag.value"
              class="tag-item"
              :class="{ active: tag.value ? draftFilterState.selectedHealthTags.includes(tag.value) : draftFilterState.selectedHealthTags.length === 0 }"
              @tap="toggleHealthTag(tag.value)"
            >
              {{ tag.label }}
            </view>
          </view>
        </scroll-view>
        <view class="drawer-actions">
          <view class="drawer-action drawer-action-secondary" @tap="resetHealthTagsDraft">重置</view>
          <view class="drawer-action drawer-action-primary" @tap="applyHealthTagsFilter">查看结果</view>
        </view>
      </view>
    </view>

    <!-- 不吃这些筛选抽屉 -->
    <view v-if="showExcludedTagsDrawer" class="drawer-mask" @tap="cancelExcludedTagsDrawer">
      <view class="drawer-content" @tap.stop>
        <view class="drawer-header">
          <text class="drawer-title">挑食/过敏</text>
          <text class="close-btn" @tap="cancelExcludedTagsDrawer">×</text>
        </view>
        <scroll-view class="drawer-body" scroll-y>
          <view class="drawer-desc">选择要排除的食材，包含该食材的食谱将不会显示</view>

          <!-- 已选排除食材标签 -->
          <view v-if="getDraftExcludedIngredientNames().length > 0" class="excluded-tags">
            <text class="excluded-label">已排除：</text>
            <view
              v-for="name in getDraftExcludedIngredientNames()"
              :key="name"
              class="excluded-tag"
              @tap="removeDraftExcludedIngredient(name)"
            >
              {{ name }} x
            </view>
          </view>

          <!-- 按 CFCT 分类展示食材 -->
          <view
            v-for="group in filterOptions.ingredientGroups"
            :key="group.category"
            class="ingredient-group"
          >
            <view class="group-header" @tap="toggleGroup(group.category)">
              <text class="group-arrow">{{ expandedGroups.has(group.category) ? '▼' : '▶' }}</text>
              <text class="group-name">{{ group.category }}</text>
              <text class="group-count">({{ group.ingredients.length }})</text>
            </view>
            <view v-if="expandedGroups.has(group.category)" class="group-body">
              <view class="tag-grid">
                <view
                  v-for="ing in group.ingredients"
                  :key="ing.name"
                  class="tag-item"
                  :class="{ excluded: isDraftIngredientExcluded(ing.name) }"
                  @tap="toggleExcludedIngredient(ing.name)"
                >
                  {{ ing.name }}
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
        <view class="drawer-actions">
          <view class="drawer-action drawer-action-secondary" @tap="resetExcludedTagsDraft">重置</view>
          <view class="drawer-action drawer-action-primary" @tap="applyExcludedTagsFilter">查看结果</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { request, getToken } from '../../utils/api'
import { getRecipeCoverImageUrl, isKnownStaleRecipeCoverUrl, normalizeImageUrl } from '../../utils/config'
import { resolveDogProfileEntryRoute } from '../../utils/dog-profile-form'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import { refreshCurrentTabBar } from '../../utils/tabbar'
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
  displayCoverUrl?: string
  coverTitle?: string
  targetHealthTags: string[]
  applicableLifeStages: string[]
  items: RecipeItem[]
  viewCount?: number
  favoriteCount?: number
  diyGenCount?: number
}

// 筛选选项类型
interface FilterOption {
  value: string
  label: string
  count: number
}

interface IngredientGroup {
  category: string
  ingredients: Array<{ ids: string[]; name: string }>
}

interface FilterOptions {
  lifeStages: FilterOption[]
  healthTags: FilterOption[]
  ingredientTags: FilterOption[]
  ingredientGroups: IngredientGroup[]
}

// 筛选状态
interface FilterState {
  selectedLifeStages: string[]
  selectedHealthTags: string[]
  excludedIngredientTags: string[]
  excludedIngredients: string[]
}

// 登录状态
const isLoggedIn = ref(false)
const showLoginBanner = ref(true)
const homeHeaderBgImageUrl = ref('')
const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'
const RECIPE_COVER_ORIGINAL_ONLY_STORAGE_KEY = 'home_recipe_cover_original_only_urls_v2'

// 狗狗列表
const dogs = ref<any[]>([])

// 食谱数据
const recipes = ref<Recipe[]>([])
const loading = ref(false)
const hasMore = ref(true)
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = 10
const INITIAL_RECIPE_RENDER_COUNT = 3
const INITIAL_RECIPE_RENDER_DELAY_MS = 300
const STALE_RECIPE_COVER_REVEAL_DELAY_MS = 1500
const recipeCoverOriginalOnlyMap = ref<Record<string, boolean>>({})
const hasMountedHome = ref(false)
const visibleRecipesCount = ref(pageSize)
let recipeRenderRevealTimer: ReturnType<typeof setTimeout> | null = null
let staleRecipeCoverRevealTimer: ReturnType<typeof setTimeout> | null = null

// 筛选相关
const showLifeStageDrawer = ref(false)
const showHealthTagsDrawer = ref(false)
const showExcludedTagsDrawer = ref(false)
const filterOptions = ref<FilterOptions>({
  lifeStages: [],
  healthTags: [],
  ingredientTags: [],
  ingredientGroups: []
})
const filterState = ref<FilterState>({
  selectedLifeStages: [],
  selectedHealthTags: [],
  excludedIngredientTags: [],
  excludedIngredients: []
})
const draftFilterState = ref<FilterState>({
  selectedLifeStages: [],
  selectedHealthTags: [],
  excludedIngredientTags: [],
  excludedIngredients: []
})

// 食材分类展开状态
const expandedGroups = ref<Set<string>>(new Set())

// 食材ID→名称映射（用于显示）
const ingredientNameMap = ref<Record<string, string>>({})
// 食材名称→所有IDs映射（用于排除）
const ingredientNameToIds = ref<Record<string, string[]>>({})

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})
const healthTagMappingLoaded = ref(false)
let healthTagMappingPromise: Promise<void> | null = null

// 计算已选筛选数量
const activeFiltersCount = computed(() => {
  let count = 0
  count += filterState.value.selectedLifeStages.filter(Boolean).length
  count += filterState.value.selectedHealthTags.filter(Boolean).length
  count += getExcludedIngredientNames().length
  return count
})

const renderedRecipes = computed(() => {
  return recipes.value.slice(0, visibleRecipesCount.value)
})

const headerSectionStyle = computed(() => {
  if (!homeHeaderBgImageUrl.value) {
    return {}
  }

  return {
    backgroundImage: `url("${homeHeaderBgImageUrl.value}")`,
    backgroundSize: 'contain',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
})

// 检查登录状态
const checkLoginStatus = () => {
  const token = getToken()
  isLoggedIn.value = !!token
}

// 页面加载
onMounted(() => {
  hasMountedHome.value = true
  checkLoginStatus()
  loadRecipeCoverOriginalOnlyMap()
  loadHomeHeaderBackground()

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
      dogs.value = []
    }
  }

  // 【修复】先加载筛选项（包含健康标签映射），再加载食谱
  // 这样可以确保在渲染食谱标签时，映射表已经准备好了
  ensureHealthTagMappingLoaded().finally(() => {
    loadRecipes()
  })
})

onUnmounted(() => {
  if (recipeRenderRevealTimer) {
    clearTimeout(recipeRenderRevealTimer)
    recipeRenderRevealTimer = null
  }

  if (staleRecipeCoverRevealTimer) {
    clearTimeout(staleRecipeCoverRevealTimer)
    staleRecipeCoverRevealTimer = null
  }
})

// 页面显示时重新检查登录状态（解决switchTab后不更新的问题）
onShow(() => {
  refreshCurrentTabBar()
  checkLoginStatus()

  if (!hasMountedHome.value) {
    return
  }

  // 根据登录状态处理狗狗数据
  if (isLoggedIn.value) {
    // 已登录：每次都重新加载狗狗数据（确保显示最新数据）
    loadDogList()
  } else {
    // 未登录：清空狗狗数据（避免显示前一个用户的数据）
    if (dogs.value.length > 0) {
      dogs.value = []
    }
  }

  loadHomeHeaderBackground()

  const recipeStatsDirty = uni.getStorageSync(HOME_RECIPE_STATS_DIRTY_KEY)
  if (recipeStatsDirty) {
    uni.removeStorageSync(HOME_RECIPE_STATS_DIRTY_KEY)
    ensureHealthTagMappingLoaded().finally(() => {
      loadRecipes(true)
    })
  }
})

function loadHomeHeaderBackground(): Promise<void> {
  return request({
    url: '/global-config',
    method: 'GET',
    quiet: true,
    suppressErrorToast: true
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      homeHeaderBgImageUrl.value = normalizeImageUrl(res.data.homeHeaderBgImageUrl)
    }
  }).catch((err: any) => {
    console.warn('[Home] Load homepage header background error:', err)
  })
}

// 加载狗狗列表
const loadDogList = async () => {
  try {
    const res = await request({
      url: '/dogs',
      method: 'GET',
      quiet: true
    })
    if (res.code === 0 && res.data) {
      dogs.value = Array.isArray(res.data) ? res.data : []
    }
  } catch (err) {
    console.error('加载狗狗列表失败:', err)
  }
}

// ==================== 食谱相关方法 ====================

function getRecipeCoverStorageKey(imageUrl: string | undefined | null): string {
  return normalizeImageUrl(imageUrl)
}

function scheduleInitialRecipeRender(requestPage: number) {
  if (recipeRenderRevealTimer) {
    clearTimeout(recipeRenderRevealTimer)
    recipeRenderRevealTimer = null
  }

  if (requestPage !== 1) {
    visibleRecipesCount.value = recipes.value.length
    return
  }

  const initialVisibleCount = Math.min(INITIAL_RECIPE_RENDER_COUNT, recipes.value.length)
  visibleRecipesCount.value = initialVisibleCount

  if (recipes.value.length <= initialVisibleCount) {
    return
  }

  recipeRenderRevealTimer = setTimeout(() => {
    visibleRecipesCount.value = recipes.value.length
    recipeRenderRevealTimer = null
  }, INITIAL_RECIPE_RENDER_DELAY_MS)
}

function scheduleStaleRecipeCoverReveal() {
  if (staleRecipeCoverRevealTimer) {
    clearTimeout(staleRecipeCoverRevealTimer)
    staleRecipeCoverRevealTimer = null
  }

  const hasStaleRecipeCover = recipes.value.some((recipe) => {
    return !recipe.displayCoverUrl && isKnownStaleRecipeCoverUrl(recipe.coverImageUrl)
  })

  if (!hasStaleRecipeCover) {
    return
  }

  staleRecipeCoverRevealTimer = setTimeout(() => {
    recipes.value = recipes.value.map((recipe) => {
      if (recipe.displayCoverUrl || !isKnownStaleRecipeCoverUrl(recipe.coverImageUrl)) {
        return recipe
      }

      return {
        ...recipe,
        displayCoverUrl: normalizeImageUrl(recipe.coverImageUrl)
      }
    })
    staleRecipeCoverRevealTimer = null
  }, STALE_RECIPE_COVER_REVEAL_DELAY_MS)
}

function loadRecipeCoverOriginalOnlyMap() {
  try {
    const stored = uni.getStorageSync(RECIPE_COVER_ORIGINAL_ONLY_STORAGE_KEY)
    if (stored && typeof stored === 'object') {
      recipeCoverOriginalOnlyMap.value = stored as Record<string, boolean>
    }
  } catch (err) {
    console.warn('[Home] Failed to load recipe cover fallback cache:', err)
  }
}

function persistRecipeCoverOriginalOnlyMap() {
  try {
    uni.setStorageSync(
      RECIPE_COVER_ORIGINAL_ONLY_STORAGE_KEY,
      recipeCoverOriginalOnlyMap.value,
    )
  } catch (err) {
    console.warn('[Home] Failed to persist recipe cover fallback cache:', err)
  }
}

function shouldUseOriginalRecipeCover(imageUrl: string | undefined | null): boolean {
  const storageKey = getRecipeCoverStorageKey(imageUrl)
  return !!(storageKey && recipeCoverOriginalOnlyMap.value[storageKey])
}

function handleRecipeCoverError(recipe: Recipe) {
  const storageKey = getRecipeCoverStorageKey(recipe.coverImageUrl)
  if (!storageKey) {
    return
  }

  if (!recipeCoverOriginalOnlyMap.value[storageKey]) {
    recipeCoverOriginalOnlyMap.value = {
      ...recipeCoverOriginalOnlyMap.value,
      [storageKey]: true
    }
    persistRecipeCoverOriginalOnlyMap()
    recipes.value = recipes.value.map((currentRecipe) => {
      if (currentRecipe.id !== recipe.id) {
        return currentRecipe
      }

      return {
        ...currentRecipe,
        displayCoverUrl: normalizeImageUrl(recipe.coverImageUrl)
      }
    })
    console.warn('[Home] Recipe cover thumbnail failed, falling back to original image:', storageKey)
    return
  }

  console.error('[Home] Recipe cover failed even after fallback:', storageKey)
}

function ensureHealthTagMappingLoaded(): Promise<void> {
  if (healthTagMappingLoaded.value) {
    return Promise.resolve()
  }

  if (!healthTagMappingPromise) {
    healthTagMappingPromise = loadFilterOptions().finally(() => {
      healthTagMappingPromise = null
    })
  }

  return healthTagMappingPromise
}

// 加载筛选项（返回 Promise 以支持 await）
function loadFilterOptions(): Promise<void> {
  return request({
    url: '/recipes/filter-options',
    method: 'GET',
    quiet: true
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
      healthTagMappingLoaded.value = true

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
        ingredientTags: res.data.ingredientTags || [],
        ingredientGroups: res.data.ingredientGroups || []
      }

      // Build ingredient name maps
      const nameMap: Record<string, string> = {}
      const nameToIds: Record<string, string[]> = {}
      for (const group of filterOptions.value.ingredientGroups) {
        for (const ing of group.ingredients) {
          nameToIds[ing.name] = ing.ids
          for (const id of ing.ids) {
            nameMap[id] = ing.name
          }
        }
      }
      ingredientNameMap.value = nameMap
      ingredientNameToIds.value = nameToIds
    }
  }).catch((err: any) => {
    healthTagMappingLoaded.value = false
    console.error('[Home] Load filter options error:', err)
  })
}

// 加载食谱
function loadRecipes(isRefresh = false) {
  if (loading.value) return

  // 如果没有更多数据且不是刷新，直接返回
  if (!hasMore.value && !isRefresh) {
    return
  }

  loading.value = true

  // 如果是刷新，重置页码
  if (isRefresh) {
    currentPage.value = 1
  }

  // 构建筛选参数和分页参数
  const params: any = {
    page: currentPage.value,
    pageSize: pageSize
  }
  const requestPage = currentPage.value
  const selectedLifeStages = filterState.value.selectedLifeStages.filter(Boolean)
  const selectedHealthTags = filterState.value.selectedHealthTags.filter(Boolean)

  if (selectedLifeStages.length > 0) {
    params.lifeStages = selectedLifeStages.join(',')
  }
  if (selectedHealthTags.length > 0) {
    params.healthTags = selectedHealthTags.join(',')
  }
  if (filterState.value.excludedIngredients.length > 0) {
    params.excludeIngredients = filterState.value.excludedIngredients.join(',')
  }

  request({
    url: '/recipes',
    method: 'GET',
    data: params,
    quiet: true
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      // 后端现在返回分页数据格式：{ data: [], total, page, pageSize, hasMore }
      const newRecipes = (res.data.data || []).map((recipe: Recipe) => ({
        ...recipe,
        displayCoverUrl: isKnownStaleRecipeCoverUrl(recipe.coverImageUrl)
          ? ''
          : getRecipeCoverImageUrl(recipe.coverImageUrl, {
            skipOptimization: shouldUseOriginalRecipeCover(recipe.coverImageUrl)
          })
      }))

      if (isRefresh) {
        recipes.value = newRecipes
      } else {
        recipes.value = [...recipes.value, ...newRecipes]
      }

      scheduleInitialRecipeRender(requestPage)
      scheduleStaleRecipeCoverReveal()

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
    if (isRefresh) {
      uni.stopPullDownRefresh()
    }
  })
}

// ==================== 筛选相关方法 ====================

// 打开生命阶段抽屉
function openLifeStageDrawer() {
  syncDraftFilterState()
  showLifeStageDrawer.value = true
}

// 打开健康标签抽屉
function openHealthTagsDrawer() {
  syncDraftFilterState()
  showHealthTagsDrawer.value = true
}

function refreshRecipesWithFilters() {
  recipes.value = []
  visibleRecipesCount.value = 0
  hasMore.value = true
  currentPage.value = 1
  loadRecipes(true)
}

function syncDraftFilterState() {
  draftFilterState.value = {
    selectedLifeStages: [...filterState.value.selectedLifeStages],
    selectedHealthTags: [...filterState.value.selectedHealthTags],
    excludedIngredientTags: [...filterState.value.excludedIngredientTags],
    excludedIngredients: [...filterState.value.excludedIngredients]
  }
}

function toggleSelectableDraftValue(selectedValues: string[], value: string) {
  if (!value) {
    selectedValues.splice(0, selectedValues.length)
    return
  }

  const blankIndex = selectedValues.indexOf('')
  if (blankIndex > -1) {
    selectedValues.splice(blankIndex, 1)
  }

  const index = selectedValues.indexOf(value)
  if (index > -1) {
    selectedValues.splice(index, 1)
    return
  }

  selectedValues.push(value)
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
  const count = filterState.value.selectedLifeStages.filter(Boolean).length
  if (count > 0) {
    return `生命阶段(${count})`
  }
  return '生命阶段'
}

// 获取健康标签按钮文字
function getHealthTagsButtonText(): string {
  const count = filterState.value.selectedHealthTags.filter(Boolean).length
  if (count > 0) {
    return `疾病/功能(${count})`
  }
  return '疾病/功能'
}

// 获取排除标签按钮文字
function getExcludedTagsButtonText(): string {
  const names = getExcludedIngredientNames()
  if (names.length > 0) {
    return `挑食/过敏(${names.length})`
  }
  return '挑食/过敏'
}

// 快速删除生命阶段
function removeLifeStages() {
  filterState.value.selectedLifeStages = []
  refreshRecipesWithFilters()
}

// 快速删除健康标签
function removeHealthTags() {
  filterState.value.selectedHealthTags = []
  refreshRecipesWithFilters()
}

// 快速删除排除标签
function removeExcludedTags() {
  filterState.value.excludedIngredients = []
  refreshRecipesWithFilters()
}

// 切换生命阶段
function toggleLifeStage(stage: string) {
  toggleSelectableDraftValue(draftFilterState.value.selectedLifeStages, stage)
}

function cancelLifeStageDrawer() {
  showLifeStageDrawer.value = false
  draftFilterState.value.selectedLifeStages = [...filterState.value.selectedLifeStages]
}

function resetLifeStageDraft() {
  draftFilterState.value.selectedLifeStages = []
}

// 应用生命阶段筛选
function applyLifeStagesFilter() {
  filterState.value.selectedLifeStages = [...draftFilterState.value.selectedLifeStages]
  showLifeStageDrawer.value = false
  refreshRecipesWithFilters()
}

// 切换健康标签
function toggleHealthTag(tag: string) {
  toggleSelectableDraftValue(draftFilterState.value.selectedHealthTags, tag)
}

function cancelHealthTagsDrawer() {
  showHealthTagsDrawer.value = false
  draftFilterState.value.selectedHealthTags = [...filterState.value.selectedHealthTags]
}

function resetHealthTagsDraft() {
  draftFilterState.value.selectedHealthTags = []
}

// 应用健康标签筛选
function applyHealthTagsFilter() {
  filterState.value.selectedHealthTags = [...draftFilterState.value.selectedHealthTags]
  showHealthTagsDrawer.value = false
  refreshRecipesWithFilters()
}

// 切换排除食材（按名称，一次性排除所有同名ID）
function toggleExcludedIngredient(ingredientName: string) {
  const allIds = ingredientNameToIds.value[ingredientName] || []
  // Check if already excluded (check by any id)
  const isExcluded = allIds.some(id => draftFilterState.value.excludedIngredients.includes(id))
  if (isExcluded) {
    // Remove all ids for this name
    for (const id of allIds) {
      const idx = draftFilterState.value.excludedIngredients.indexOf(id)
      if (idx > -1) draftFilterState.value.excludedIngredients.splice(idx, 1)
    }
  } else {
    // Add all ids for this name
    draftFilterState.value.excludedIngredients.push(...allIds)
  }
}

// 判断食材是否被排除
function isIngredientExcluded(ingredientName: string): boolean {
  const allIds = ingredientNameToIds.value[ingredientName] || []
  return allIds.some(id => filterState.value.excludedIngredients.includes(id))
}

function isDraftIngredientExcluded(ingredientName: string): boolean {
  const allIds = ingredientNameToIds.value[ingredientName] || []
  return allIds.some(id => draftFilterState.value.excludedIngredients.includes(id))
}

// 获取已排除食材的去重名称列表
function getExcludedIngredientNames(): string[] {
  const names = new Set<string>()
  for (const id of filterState.value.excludedIngredients) {
    const name = ingredientNameMap.value[id]
    if (name) names.add(name)
  }
  return Array.from(names)
}

function getDraftExcludedIngredientNames(): string[] {
  const names = new Set<string>()
  for (const id of draftFilterState.value.excludedIngredients) {
    const name = ingredientNameMap.value[id]
    if (name) names.add(name)
  }
  return Array.from(names)
}

// 切换分类展开/折叠
function toggleGroup(category: string) {
  if (expandedGroups.value.has(category)) {
    expandedGroups.value.delete(category)
  } else {
    expandedGroups.value.add(category)
  }
}

// 应用排除标签筛选
function applyExcludedTagsFilter() {
  filterState.value.excludedIngredients = [...draftFilterState.value.excludedIngredients]
  showExcludedTagsDrawer.value = false
  refreshRecipesWithFilters()
}

// 移除已选排除食材（按名称，移除所有同名ID）
function removeExcludedIngredient(ingredientName: string) {
  const allIds = ingredientNameToIds.value[ingredientName] || []
  for (const id of allIds) {
    const idx = filterState.value.excludedIngredients.indexOf(id)
    if (idx > -1) {
      filterState.value.excludedIngredients.splice(idx, 1)
    }
  }
}

function removeDraftExcludedIngredient(ingredientName: string) {
  const allIds = ingredientNameToIds.value[ingredientName] || []
  for (const id of allIds) {
    const idx = draftFilterState.value.excludedIngredients.indexOf(id)
    if (idx > -1) {
      draftFilterState.value.excludedIngredients.splice(idx, 1)
    }
  }
}

function cancelExcludedTagsDrawer() {
  showExcludedTagsDrawer.value = false
  draftFilterState.value.excludedIngredients = [...filterState.value.excludedIngredients]
}

function resetExcludedTagsDraft() {
  draftFilterState.value.excludedIngredients = []
}

// 获取食材名称
function getIngredientName(ingredientId: string): string {
  return ingredientNameMap.value[ingredientId] || ingredientId
}

// 打开排除标签抽屉（默认展开所有分组）
function openExcludedTagsDrawer() {
  syncDraftFilterState()
  showExcludedTagsDrawer.value = true
  // 默认展开所有分组
  expandedGroups.value = new Set(
    filterOptions.value.ingredientGroups.map(g => g.category)
  )
}

// 清除所有筛选
function clearAllFilters() {
  filterState.value = {
    selectedLifeStages: [],
    selectedHealthTags: [],
    excludedIngredientTags: [],
    excludedIngredients: []
  }
  syncDraftFilterState()
  refreshRecipesWithFilters()
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
function formatStatNum(num: number | undefined): string {
  if (!num || num < 1) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(num)
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

  if (!healthTagMappingLoaded.value) {
    return tagOrUuid
  }

  // 如果都找不到，记录警告并返回原始值
  console.warn('[Home] 未找到健康标签映射:', tagOrUuid, '当前映射表大小:', Object.keys(healthTagUuidLabelMap.value).length)
  return tagOrUuid
}

// 下拉刷新
onPullDownRefresh(() => {
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
  uni.navigateTo({ url: resolveDogProfileEntryRoute() })
}

// 跳转到狗狗详情
const goToDogDetail = (dogId: string) => {
  uni.navigateTo({ url: resolveDogProfileEntryRoute(dogId) })
}

// 跳转到订单列表
const goToOrderList = () => {
  uni.navigateTo({ url: '/pages/orders-list/index' })
}

// 跳转到建议反馈
const goToFeedback = () => {
  if (!isLoggedIn.value) {
    checkLoginAndNavigate('/pages/feedback-list/index')
    return
  }
  uni.navigateTo({ url: '/pages/feedback-list/index' })
}

// 跳转到体重管理
const goToWeightManagement = () => {
  if (!isLoggedIn.value) {
    checkLoginAndNavigate('/pages/weight-management/index')
    return
  }
  uni.navigateTo({ url: '/pages/weight-management/index' })
}

// 跳转到健康记录
const goToHealthRecords = () => {
  if (!isLoggedIn.value) {
    checkLoginAndNavigate('/pages/dog-profile-health/index')
    return
  }

  if (dogs.value.length === 0) {
    uni.showToast({ title: '请先创建狗狗档案', icon: 'none' })
    goToDogCreate()
    return
  }

  uni.navigateTo({ url: '/pages/dog-profile-health/index' })
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


/* 顶部图片区 */
.header-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  height: 400rpx;
  padding: 0;
}

/* 快捷功能入口 */
.quick-actions {
  display: flex;
  justify-content: space-around;
  background: white;
  margin: 15px 15px 15px;
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
  width: 56rpx;
  height: 56rpx;
  display: block;
  flex-shrink: 0;
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
  justify-content: center;
  position: relative;
  overflow: hidden;
  width: 220rpx !important;
  min-width: 220rpx !important;
  max-width: 220rpx !important;
  height: 220rpx !important;
  flex-shrink: 0 !important; /* 防止卡片被压缩 */
  background: #f8f8f8;
  border-radius: 8px;
  padding: 0;
  margin-right: 20rpx; /* 增加卡片间距 */
  vertical-align: top;
  box-sizing: border-box !important;
}

.dog-card.add-dog {
  border: 1px dashed #ccc;
  background: white;
  flex-direction: column;
  justify-content: center;
  gap: 8rpx;
}

.dog-card-avatar {
  width: 100%;
  height: 100%;
  display: block;
}

.dog-card-name-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  padding: 54rpx 18rpx 16rpx;
  box-sizing: border-box;
  background: linear-gradient(
    180deg,
    rgba(26, 28, 33, 0) 0%,
    rgba(26, 28, 33, 0.42) 100%
  );
}

.dog-card-name {
  display: block;
  min-width: 0;
  max-width: 100%;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  background: rgba(18, 20, 24, 0.58);
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.16);
  box-sizing: border-box;
  font-size: 28rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.22);
}

.add-icon {
  font-size: 48rpx;
  line-height: 1;
  color: #999;
}

.add-text {
  font-size: 24rpx;
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

.recipe-cover-badge-gradient {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  padding: 56rpx 24rpx 20rpx;
  box-sizing: border-box;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(20, 18, 16, 0) 0%,
    rgba(20, 18, 16, 0.18) 52%,
    rgba(20, 18, 16, 0.34) 100%
  );
}

.recipe-cover-title-badge {
  max-width: 340rpx;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  background: rgba(32, 29, 25, 0.58);
  color: #fff;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 32rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.16);
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

.recipe-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.recipe-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  line-height: 1.4;
  word-break: break-all;
  overflow-wrap: break-word;
  min-height: 45rpx;
  flex: 1;
  margin-right: 12rpx;
}

.recipe-stats {
  display: flex;
  gap: 8rpx;
  flex-shrink: 0;
}

.stat-item {
  font-size: 20rpx;
  color: #999;
  white-space: nowrap;
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

.drawer-actions {
  display: flex;
  gap: 16rpx;
  padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;
  background: #fff;
  flex-shrink: 0;
}

.drawer-action {
  flex: 1;
  height: 80rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
}

.drawer-action-secondary {
  background: #f5f5f5;
  color: #666;
}

.drawer-action-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.section-subtitle {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 16rpx;
  font-weight: bold;
}

/* 食材分组样式 */
.ingredient-group {
  margin-bottom: 16rpx;
}

.group-header {
  display: flex;
  align-items: center;
  padding: 16rpx 20rpx;
  background: #f8f8f8;
  border-radius: 8rpx;
  margin-bottom: 12rpx;
}

.group-arrow {
  font-size: 22rpx;
  color: #999;
  margin-right: 12rpx;
}

.group-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
}

.group-count {
  font-size: 24rpx;
  color: #999;
  margin-left: 8rpx;
}

.group-body {
  padding: 0 8rpx;
}

.group-body .tag-grid {
  margin-top: 0;
}
</style>

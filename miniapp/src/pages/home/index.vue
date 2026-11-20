<template>
  <view class="home-container">
    <!-- 登录引导Banner（游客模式显示） -->
    <view v-if="showLoginBanner && !isLoggedIn" class="login-banner">
      <view class="banner-content">
        <view class="banner-accent" aria-hidden="true"></view>
        <view class="banner-text">
          <text class="banner-title">登录后按你家狗狗体重，一键算出饭量和价格</text>
        </view>
        <view class="banner-actions">
          <text class="banner-login-btn" @tap="goToLogin">立即登录</text>
          <text class="banner-close" @tap="closeBanner">×</text>
        </view>
      </view>
    </view>

    <!-- 顶部欢迎区 -->
    <view class="header-section" :style="headerSectionStyle" />

    <!-- 快捷功能入口 -->
    <view class="quick-actions">
      <view class="action-item" @tap="goToCalculatePortion">
        <image class="action-icon" src="/static/home-actions/calculate-portion.png" mode="aspectFit" />
        <text class="action-text">饭量计算</text>
      </view>
      <view class="action-divider" aria-hidden="true"></view>
      <view class="action-item" @tap="goToHealthRecords">
        <image class="action-icon" src="/static/home-actions/health-records.png" mode="aspectFit" />
        <text class="action-text">健康管理</text>
      </view>
    </view>

    <!-- 试吃装入口（现货）：只在开放且确实有货时展示，
         避免顾客点进去发现是空的 -->
    <view
      v-if=tastingPackEntry.visible
      class="tasting-pack-entry"
      @tap="goTastingPack"
    >
      <view class="tpe-body">
        <text class="tpe-title">{{ tastingPackEntry.name }}</text>
        <text class="tpe-desc">{{ tastingPackEntry.desc }}</text>
      </view>
      <text class="tpe-btn">去看看</text>
    </view>

    <!-- 狗狗档案预览（紧凑单行） -->
    <view class="section dog-section" v-if="dogs.length > 0">
      <view class="section-header">
        <view class="section-heading">
          <view class="section-accent" aria-hidden="true"></view>
          <text class="section-title">我的狗狗</text>
        </view>
        <view class="section-more" @tap="goToDogList">
          <text>查看全部</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <scroll-view scroll-x class="dog-scroll">
        <view class="dog-compact-item" v-for="dog in dogs" :key="dog.id" @tap="goToDogDetail(dog.id)">
          <image
            class="dog-compact-avatar"
            :src="resolveDogAvatarSrc(dog.avatarUrl)"
            mode="aspectFill"
          />
          <view class="dog-compact-copy">
            <text class="dog-compact-name">{{ dog.name }}</text>
            <text v-if="dog.currentWeightKg != null" class="dog-compact-weight">{{ dog.currentWeightKg }}kg</text>
          </view>
        </view>
        <view class="dog-compact-item dog-compact-add" @tap="goToDogCreate">
          <text class="add-icon">+</text>
          <text class="add-text">添加狗狗</text>
        </view>
      </scroll-view>
    </view>

    <!-- 无狗狗时的引导 -->
    <view class="empty-dog-section" v-else>
      <view class="empty-ornament" aria-hidden="true">
        <view class="empty-ornament-inner"></view>
      </view>
      <text class="empty-title">还没有狗狗档案</text>
      <text class="empty-desc">建档后可一键算出你家狗狗的饭量和订单价</text>
      <button v-if="!isLoggedIn" class="create-btn" @tap="goToLogin">立即登录</button>
      <button v-else class="create-btn" @tap="goToDogCreate">创建狗狗档案</button>
    </view>

    <!-- 食谱定制入口（常驻）
         原「给 XX 的推荐」板块已整块下线，这个位置改为定制入口。
         刻意做成**任何人都看得到**（含未登录游客）：推荐只在"已登录 + 有狗狗 +
         有推荐结果"时才出现，而定制是独立产品线，不该只在登录后才被看见。 -->
    <view class="custom-recipe-section" hover-class="card-hover" @tap="goToCustomRecipe">
      <view class="custom-recipe-body">
        <view class="custom-recipe-heading">
          <view class="section-accent" aria-hidden="true"></view>
          <text class="custom-recipe-title">食谱定制</text>
        </view>
        <text class="custom-recipe-desc">为毛孩子定制个性化专属食谱</text>
      </view>
      <view class="custom-recipe-action">
        <view class="custom-recipe-action-copy">
          <text class="custom-recipe-action-text">去定制</text>
          <text v-if="customRecipeFeeText" class="custom-recipe-action-fee">
            {{ customRecipeFeeText }}/份
          </text>
        </view>
        <text class="custom-recipe-arrow">›</text>
      </view>
    </view>

    <!-- 食谱橱窗标题 -->
    <view class="recipe-showcase-header">
      <view class="section-heading">
        <view class="section-accent" aria-hidden="true"></view>
        <text class="section-title">食谱橱窗</text>
      </view>
      <text class="recipe-count">共 {{ totalCount }} 道食谱</text>
      <text v-if="hasShelfFilters" class="clear-all" @tap="resetShelfAll()">清除筛选</text>
    </view>

    <!-- 三筛选：肉类 / 特性 / 避开 -->
    <view class="filter-bar">
      
    <view class="sf-bar">
      <view
        :class="['sf-pill', { 'is-active': shelfHasSelection('main'), 'is-open': shelfOpenSheet === 'main' }]"
        @tap="openShelfSheet('main')"
      >
        <text class="sf-pill-text">肉类</text>
        <text class="sf-pill-car">▼</text>
        <text v-if="shelfSelectionCount('main')" class="sf-pill-count">{{ shelfSelectionCount('main') }}</text>
      </view>
      <view
        :class="['sf-pill', { 'is-active': shelfHasSelection('needs'), 'is-open': shelfOpenSheet === 'needs' }]"
        @tap="openShelfSheet('needs')"
      >
        <text class="sf-pill-text">特性</text>
        <text class="sf-pill-car">▼</text>
        <text v-if="shelfSelectionCount('needs')" class="sf-pill-count">{{ shelfSelectionCount('needs') }}</text>
      </view>
      <view
        :class="['sf-pill', { 'is-active': shelfHasSelection('avoid'), 'is-open': shelfOpenSheet === 'avoid' }]"
        @tap="openShelfSheet('avoid')"
      >
        <text class="sf-pill-text">避开</text>
        <text class="sf-pill-car">▼</text>
        <text v-if="shelfSelectionCount('avoid')" class="sf-pill-count">{{ shelfSelectionCount('avoid') }}</text>
      </view>
    </view>
    </view>

        <!-- 食谱列表信息流 -->
    <view class="recipe-list">
      <view
        v-for="recipe in renderedRecipes"
        :key="recipe.id"
        class="recipe-card"
        hover-class="card-hover"
        :hover-start-time="20"
        :hover-stay-time="70"
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
            v-if="recipe.displayCoverUrl && resolveCoverBadgeText(recipe)"
            class="recipe-cover-badge-gradient"
          >
            <text class="recipe-cover-title-badge">{{ resolveCoverBadgeText(recipe) }}</text>
          </view>
        </view>

        <!-- 食谱信息 - 使用强制渲染 -->
        <view class="recipe-info" :id="'info-' + recipe.id">
          <view class="recipe-name-row">
            <view class="recipe-name-wrap">
              <text class="recipe-orderable-badge">可订购</text>
              <text class="recipe-name">{{ recipe.name || '未命名食谱' }}</text>
            </view>
            <view class="recipe-stats">
              <view class="stat-item">
                <image class="stat-icon" src="/static/ui-icons/view.png" mode="aspectFit" />
                <text>{{ formatStatNum(recipe.viewCount) }}</text>
              </view>
              <view class="stat-item">
                <image class="stat-icon" src="/static/ui-icons/favorite.png" mode="aspectFit" />
                <text>{{ formatStatNum(recipe.favoriteCount) }}</text>
              </view>
            </view>
          </view>

          <!-- 成品参考价 -->
          <view v-if="referencePriceMap[recipe.id]" class="recipe-order-row">
            <text class="recipe-price-label">成品参考价</text>
            <text class="recipe-price-text">约¥{{ formatReferencePrice(referencePriceMap[recipe.id].priceByRecipeId[recipe.id] ?? referencePriceMap[recipe.id].minPricePer100g) }}/100g</text>
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
        <view class="empty-ornament" aria-hidden="true">
          <view class="empty-ornament-inner"></view>
        </view>
        <view class="empty-title">暂无食谱</view>
        <view class="empty-subtitle">当前筛选条件下没有找到食谱</view>
        <button class="btn-reset" @tap="resetFilters">重置筛选</button>
      </view>
    </view>

    <!-- 适用生命阶段筛选抽屉 -->
    <view v-show="shelfOpenSheet" class="drawer-mask sf-mask" @tap="closeShelfSheet">
      <view class="drawer-content sf-sheet" @tap.stop>
        <view class="sf-handle"></view>
        <view class="sf-head">
          <text class="sf-title">{{ shelfSheetTitle }}</text>
          <text class="sf-close" @tap="closeShelfSheet">×</text>
        </view>

        <scroll-view
          scroll-y
          :class="['sf-body', shelfOpenSheet === 'avoid' ? 'sf-body--tall' : 'sf-body--auto']"
        >
          <!-- 肉类：一次只归一个肉种 -->
          <view v-if="shelfOpenSheet === 'main'" class="sf-chips">
            <view
              v-for="opt in shelfOptions.mainProtein"
              :key="opt.value"
              :class="['sf-chip', { 'is-on': shelfDraft.main.includes(opt.value) }]"
              @tap="toggleShelfMain(opt.value)"
            >
              <text>{{ opt.label }}</text>
              <text class="sf-chip-n">{{ opt.count }}</text>
            </view>
            <view v-if="!shelfOptions.mainProtein.length" class="sf-empty">暂无可选</view>
          </view>

          <!-- 特性：可多选，同时满足 -->
          <view v-else-if="shelfOpenSheet === 'needs'" class="sf-rows">
            <view
              v-for="opt in shelfOptions.needs"
              :key="opt.value"
              :class="['sf-row', { 'is-on': shelfDraft.needs.includes(opt.value) }]"
              @tap="toggleShelfNeed(opt.value)"
            >
              <text class="sf-row-label">{{ opt.label }}</text>
              <text class="sf-row-count">{{ opt.count }} 道</text>
              <view class="sf-check">
                <text v-if="shelfDraft.needs.includes(opt.value)">✓</text>
              </view>
            </view>
            <view v-if="!shelfOptions.needs.length" class="sf-empty">暂无可选</view>
          </view>

          <!-- 避开：原料标签树 -->
          <view v-else class="sf-avoid">
            <input
              v-model="shelfSearch"
              class="sf-search"
              placeholder="搜索原料或类别"
              placeholder-class="sf-search-ph"
            />
            <template v-if="!shelfSearch.trim()">
              <view v-for="group in shelfAvoidGroups" :key="group.value" class="sf-group">
                <view
                  :class="[
                    'sf-group-head',
                    {
                      'is-on': shelfDraft.avoid.includes(group.value),
                      'is-off': group.disabled
                    }
                  ]"
                  @tap="onShelfGroupTap(group)"
                >
                  <text class="sf-group-name">{{ group.label }}</text>
                  <text class="sf-group-count">{{ group.count }} 道</text>
                  <text v-if="group.disabled" class="sf-group-warn">会避开全部食谱</text>
                  <view v-else class="sf-check">
                    <text v-if="shelfDraft.avoid.includes(group.value)">✓</text>
                  </view>
                </view>
                <view v-if="group.children.length" class="sf-chips sf-chips--sub">
                  <view
                    v-for="child in group.children"
                    :key="child.value"
                    :class="[
                      'sf-chip',
                      'sf-chip--sm',
                      { 'is-on': shelfDraft.avoid.includes(child.value) }
                    ]"
                    @tap="toggleShelfAvoid(child.value)"
                  >
                    <text>{{ child.label }}</text>
                    <text class="sf-chip-n">{{ child.count }}</text>
                  </view>
                </view>
                <text v-if="group.disabled && group.children.length" class="sf-group-warn2">
                  整类选会排除全部 {{ shelfOptions.total }} 道食谱
                </text>
              </view>
            </template>
            <template v-else>
              <view
                v-for="opt in shelfAvoidSearchResults"
                :key="opt.value"
                class="sf-row"
                @tap="toggleShelfAvoid(opt.value)"
              >
                <text class="sf-row-label">{{ opt.label }}</text>
                <text class="sf-row-count">{{ opt.count }} 道</text>
                <view class="sf-check">
                  <text v-if="shelfDraft.avoid.includes(opt.value)">✓</text>
                </view>
              </view>
              <view v-if="!shelfAvoidSearchResults.length" class="sf-empty">没有匹配的原料</view>
            </template>
          </view>
        </scroll-view>

        <view class="sf-actions">
          <view class="sf-btn sf-btn--ghost" @tap="resetShelfDraft">重置</view>
          <view class="sf-btn sf-btn--primary" @tap="applyShelfDraft">{{ shelfPrimaryText }}</view>
        </view>
      </view>
    </view>

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

    <!-- 健康类型筛选抽屉（字典合规化完成前不对顾客展示） -->
    <view v-if="HEALTH_TAG_FILTER_ENABLED && showHealthTagsDrawer" class="drawer-mask" @tap="cancelHealthTagsDrawer">
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

          <!-- 档案里记的过敏（2026-10-04，第一期）。
               改造前这里完全不读档案 —— 顾客在健康管理里点了"鸡肉过敏"，
               到这里还得自己再挑一遍。现在把结论直接摆出来，
               让他看得见"系统记住了"，也随时能取消。 -->
          <view v-if="allergenSuggestion" class="allergen-hint">
            <text class="allergen-hint__title">
              「{{ allergenSuggestion.dogName }}」的健康档案里记了过敏
            </text>
            <text class="allergen-hint__list">
              {{ allergenSuggestion.allergenNames.join('、') || '（已记录）' }}
            </text>
            <view class="allergen-hint__action" @tap="applyAllergenSuggestion()">
              一键避开这些食材
            </view>
          </view>

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
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { fetchTastingPacks } from '../../api/tastingPack'
import { onLoad, onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { AUTH_EXPIRED_EVENT, request, getToken } from '../../utils/api'
import { fetchUnreadMessageCount } from '@/api/messages'
import { fetchPublicConfig } from '@/api/custom-recipe'
import { formatAmount } from '@/utils/custom-recipe-order'
import { storeUnreadMessageCount } from '@/utils/unread-message-badge'
import { getRecipeCoverImageUrl, isKnownStaleRecipeCoverUrl, normalizeImageUrl } from '../../utils/config'
import { resolveDogProfileEntryRoute } from '../../utils/dog-profile-form'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import { refreshCurrentTabBar } from '../../utils/tabbar'
import { trackFunnelEvent } from '../../utils/funnel'
import { navigateToDogCreate } from '../../utils/dog-profile-entry'
import { resolveCoverBadgeText } from '../../utils/cover-badge'
import { dogApi } from '../../api/dogs'
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
  /** 系列级封面角标（合规词表，最多 2 个） */
  coverBadges?: string[]
  targetHealthTags: string[]
  applicableLifeStages: string[]
  items: RecipeItem[]
  viewCount?: number
  favoriteCount?: number
  diyGenCount?: number
  matchScore?: number
  matchStars?: number
  matchReasons?: string[]
  dailyIntakeG?: number | null
  section?: string
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
const customRecipeFee = ref<number | null>(null)
const customRecipeFeeText = computed(() =>
  customRecipeFee.value !== null
    ? `¥${formatAmount(customRecipeFee.value)}`
    : '',
)

async function loadCustomRecipeFee() {
  try {
    const config = await fetchPublicConfig()
    const fee = Number(config?.feeAmount)
    if (Number.isFinite(fee) && fee > 0) customRecipeFee.value = fee
  } catch {
    // 首页价格拿不到不阻塞其它内容；不显示即可
  }
}

const recipes = ref<Recipe[]>([])
const loading = ref(false)
const hasMore = ref(true)
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = 10
// 参考价（每100g、已含运费）：由后端参考价接口自动计算，接口未就绪时留空不展示。
// 卡片优先显示"这张卡自己那个生命阶段"的价（priceByRecipeId），拿不到再退回全阶段最低价。
const referencePriceMap = ref<
  Record<string, { minPricePer100g: number; priceByRecipeId: Record<string, number> }>
>({})
// 参考价请求代次：刷新时自增，用来丢弃「刷新前发出、刷新后才回来」的旧响应
let referencePriceRequestSeq = 0
const INITIAL_RECIPE_RENDER_COUNT = 3
const INITIAL_RECIPE_RENDER_DELAY_MS = 300
const STALE_RECIPE_COVER_REVEAL_DELAY_MS = 1500
const recipeCoverOriginalOnlyMap = ref<Record<string, boolean>>({})
const hasMountedHome = ref(false)
const visibleRecipesCount = ref(pageSize)


let recipeRenderRevealTimer: ReturnType<typeof setTimeout> | null = null
let staleRecipeCoverRevealTimer: ReturnType<typeof setTimeout> | null = null
let customerServiceRouteHandled = false

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
const SHELF_FILTER_STORAGE_KEY = 'home_shelf_filters_v1'

interface ShelfFilters {
  mainProteinNodeIds: string[]
  needTagIds: string[]
  avoidTagIds: string[]
}

function readShelfFilters(): ShelfFilters {
  try {
    const saved = uni.getStorageSync(SHELF_FILTER_STORAGE_KEY)
    if (!saved || typeof saved !== 'object') {
      return { mainProteinNodeIds: [], needTagIds: [], avoidTagIds: [] }
    }
    return {
      mainProteinNodeIds: Array.isArray(saved.mainProteinNodeIds) ? saved.mainProteinNodeIds : [],
      needTagIds: Array.isArray(saved.needTagIds) ? saved.needTagIds : [],
      avoidTagIds: Array.isArray(saved.avoidTagIds) ? saved.avoidTagIds : []
    }
  } catch {
    return { mainProteinNodeIds: [], needTagIds: [], avoidTagIds: [] }
  }
}

const newFilters = ref<ShelfFilters>(readShelfFilters())
const hasShelfFilters = computed(
  () =>
    newFilters.value.mainProteinNodeIds.length > 0 ||
    newFilters.value.needTagIds.length > 0 ||
    newFilters.value.avoidTagIds.length > 0
)
let pendingShelfRefresh = false

type ShelfSheetKey = 'main' | 'needs' | 'avoid'

interface ShelfFilterOption {
  value: string
  label: string
  count: number
  parentId?: string | null
}

interface ShelfFilterOptions {
  mainProtein: ShelfFilterOption[]
  needs: ShelfFilterOption[]
  avoid: ShelfFilterOption[]
  total: number
}

interface ShelfFilterState {
  mainProteinNodeIds: string[]
  needTagIds: string[]
  avoidTagIds: string[]
}

interface AvoidGroup extends ShelfFilterOption {
  children: ShelfFilterOption[]
  disabled: boolean
}



const shelfOptions = reactive<ShelfFilterOptions>({
  mainProtein: [],
  needs: [],
  avoid: [],
  total: 0
})

const shelfSelected = reactive<ShelfFilterState>({
  mainProteinNodeIds: [],
  needTagIds: [],
  avoidTagIds: []
})

const shelfDraft = reactive<ShelfFilterState>({
  mainProteinNodeIds: [],
  needTagIds: [],
  avoidTagIds: []
})

const shelfOpenSheet = ref<ShelfSheetKey | null>(null)
const shelfSearch = ref('')
const shelfPreviewTotal = ref<number | null>(null)
let shelfPreviewTimer: ReturnType<typeof setTimeout> | null = null
let shelfPreviewSeq = 0

const shelfSheetTitle = computed(() => {
  if (shelfOpenSheet.value === 'main') return '肉类'
  if (shelfOpenSheet.value === 'needs') return '特性'
  return '要避开什么？'
})

const shelfPrimaryText = computed(() => {
  const total = shelfPreviewTotal.value
  if (total === null) return '查看结果'
  return shelfOpenSheet.value === 'avoid' ? `还剩 ${total} 道食谱` : `${total} 道食谱`
})

const shelfAvoidGroups = computed<AvoidGroup[]>(() => {
  const childrenOf = new Map<string, ShelfFilterOption[]>()
  for (const tag of shelfOptions.avoid) {
    if (!tag.parentId) continue
    const list = childrenOf.get(tag.parentId) || []
    list.push(tag)
    childrenOf.set(tag.parentId, list)
  }
  const total = shelfOptions.total
  return shelfOptions.avoid
    .filter((tag) => !tag.parentId)
    .map((tag) => {
      const children = childrenOf.get(tag.value) || []
      return {
        ...tag,
        children,
        disabled: total > 0 && tag.count >= total
      }
    })
})

const shelfAvoidSearchResults = computed(() => {
  const keyword = shelfSearch.value.trim()
  if (!keyword) return []
  return shelfOptions.avoid.filter((tag) => tag.label.includes(keyword))
})

function shelfSelectionCount(key: ShelfSheetKey): number {
  if (key === 'main') return shelfSelected.mainProteinNodeIds.length
  if (key === 'needs') return shelfSelected.needTagIds.length
  return shelfSelected.avoidTagIds.length
}

function shelfHasSelection(key: ShelfSheetKey): boolean {
  return shelfSelectionCount(key) > 0
}

function buildShelfParams(filters: ShelfFilterState): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.mainProteinNodeIds.length) {
    params.mainProteinNodeIds = filters.mainProteinNodeIds.join(',')
  }
  if (filters.needTagIds.length) {
    params.needTagIds = filters.needTagIds.join(',')
  }
  if (filters.avoidTagIds.length) {
    params.avoidTagIds = filters.avoidTagIds.join(',')
  }
  return params
}

function shelfSnapshot(): ShelfFilterState {
  return {
    mainProteinNodeIds: [...shelfSelected.mainProteinNodeIds],
    needTagIds: [...shelfSelected.needTagIds],
    avoidTagIds: [...shelfSelected.avoidTagIds]
  }
}

function persistShelf(): void {
  try {
    uni.setStorageSync(SHELF_FILTER_STORAGE_KEY, shelfSnapshot())
  } catch {
    // 存储失败不影响筛选
  }
}

function restoreShelf(): void {
  try {
    const saved = uni.getStorageSync(SHELF_FILTER_STORAGE_KEY)
    if (!saved || typeof saved !== 'object') return
    shelfSelected.mainProteinNodeIds = Array.isArray(saved.mainProteinNodeIds)
      ? saved.mainProteinNodeIds.filter((id: unknown): id is string => typeof id === 'string')
      : []
    shelfSelected.needTagIds = Array.isArray(saved.needTagIds)
      ? saved.needTagIds.filter((id: unknown): id is string => typeof id === 'string')
      : []
    shelfSelected.avoidTagIds = Array.isArray(saved.avoidTagIds)
      ? saved.avoidTagIds.filter((id: unknown): id is string => typeof id === 'string')
      : []
  } catch {
    // 读取失败按未选处理
  }
}

function syncShelfDraft(): void {
  shelfDraft.mainProteinNodeIds = [...shelfSelected.mainProteinNodeIds]
  shelfDraft.needTagIds = [...shelfSelected.needTagIds]
  shelfDraft.avoidTagIds = [...shelfSelected.avoidTagIds]
}

function openShelfSheet(key: ShelfSheetKey): void {
  shelfOpenSheet.value = key
  uni.showModal({ title: '弹层状态', content: String(shelfOpenSheet.value), showCancel: false })
  shelfSearch.value = ''
  syncShelfDraft()
  shelfPreviewTotal.value = null
  scheduleShelfPreview()
}

function closeShelfSheet(): void {
  shelfOpenSheet.value = null
  if (shelfPreviewTimer) {
    clearTimeout(shelfPreviewTimer)
    shelfPreviewTimer = null
  }
}

function toggleShelfMain(value: string): void {
  shelfDraft.mainProteinNodeIds = shelfDraft.mainProteinNodeIds.includes(value) ? [] : [value]
  scheduleShelfPreview()
}

function toggleShelfNeed(value: string): void {
  const set = new Set(shelfDraft.needTagIds)
  if (set.has(value)) set.delete(value)
  else set.add(value)
  shelfDraft.needTagIds = Array.from(set)
  scheduleShelfPreview()
}

function toggleShelfAvoid(value: string): void {
  const set = new Set(shelfDraft.avoidTagIds)
  if (set.has(value)) set.delete(value)
  else set.add(value)
  shelfDraft.avoidTagIds = Array.from(set)
  scheduleShelfPreview()
}

function onShelfGroupTap(group: AvoidGroup): void {
  if (group.disabled) return
  toggleShelfAvoid(group.value)
}

function resetShelfDraft(): void {
  shelfDraft.mainProteinNodeIds = []
  shelfDraft.needTagIds = []
  shelfDraft.avoidTagIds = []
  scheduleShelfPreview()
}

function scheduleShelfPreview(): void {
  if (shelfPreviewTimer) clearTimeout(shelfPreviewTimer)
  shelfPreviewTimer = setTimeout(() => {
    void fetchShelfPreview()
  }, 240)
}

async function fetchShelfPreview(): Promise<void> {
  const seq = ++shelfPreviewSeq
  try {
    const res: any = await request({
      url: '/recipes',
      method: 'GET',
      data: {
        ...buildShelfParams(shelfDraft),
        page: 1,
        pageSize: 1
      },
      quiet: true
    })
    if (seq !== shelfPreviewSeq) return
    shelfPreviewTotal.value = res?.code === 0 ? Number(res.data?.total || 0) : null
  } catch {
    if (seq !== shelfPreviewSeq) return
    shelfPreviewTotal.value = null
  }
}

function applyShelfDraft(): void {
  shelfSelected.mainProteinNodeIds = [...shelfDraft.mainProteinNodeIds]
  shelfSelected.needTagIds = [...shelfDraft.needTagIds]
  shelfSelected.avoidTagIds = [...shelfDraft.avoidTagIds]
  persistShelf()
  onShelfApply(shelfSnapshot())
  closeShelfSheet()
}

function resetShelfAll(): void {
  shelfSelected.mainProteinNodeIds = []
  shelfSelected.needTagIds = []
  shelfSelected.avoidTagIds = []
  persistShelf()
  onShelfApply(shelfSnapshot())
  closeShelfSheet()
}

async function loadShelfOptions(): Promise<void> {
  try {
    const res: any = await request({
      url: '/recipes/filter-options',
      method: 'GET',
      quiet: true
    })
    if (res?.code !== 0 || !res.data) return
    shelfOptions.mainProtein = Array.isArray(res.data.mainProtein) ? res.data.mainProtein : []
    shelfOptions.needs = Array.isArray(res.data.needs) ? res.data.needs : []
    shelfOptions.avoid = Array.isArray(res.data.avoid) ? res.data.avoid : []
    shelfOptions.total = Number(res.data.total || 0)
  } catch {
    // 选项加载失败时保持空面板，不阻塞首页
  }
}

onMounted(async () => {
  restoreShelf()
  await loadShelfOptions()
})


function onShelfApply(filters: ShelfFilters): void {
  const same =
    JSON.stringify(filters) ===
    JSON.stringify({
      mainProteinNodeIds: newFilters.value.mainProteinNodeIds,
      needTagIds: newFilters.value.needTagIds,
      avoidTagIds: newFilters.value.avoidTagIds
    })
  if (same) return
  newFilters.value = filters
  if (loading.value) {
    pendingShelfRefresh = true
    return
  }
  refreshRecipesWithFilters()
}
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

/**
 * 档案里记录的过敏（2026-10-04，过敏重构第一期）。
 *
 * 改造前首页这个「挑食/过敏」筛选**完全不读档案** ——
 * 顾客在健康管理里认真点了"鸡肉过敏"，到这里还得自己再挑一遍。
 * 于是"填了过敏 → 首页自动避开"这件事，在最显眼的那个入口上是断的。
 *
 * 现在读取这只狗的过敏档案，把**原料库里会被命中的食材**带出来：
 *   · 只有一只狗 → 直接默认排除（点开筛选能看到「已排除：鸡胸」）
 *   · 有多只狗   → 不默认排除（不知道说的是哪只），
 *                  但在抽屉里给一行「按 XX 的档案避开」一键应用
 * 两种情况都让顾客**看得见**系统记住了什么，也随时能取消。
 */
const allergenSuggestion = ref<{
  dogId: string
  dogName: string
  allergenNames: string[]
  ingredientNames: string[]
} | null>(null)
/** 顾客自己动过排除项之后就不再自动套用，免得把他的选择冲掉 */
const excludedFilterTouchedByUser = ref(false)

// 健康类型筛选开关：标签字典尚未完成合规化（生产库存在疾病名/功效类标签），
// 因此暂不对顾客展示该筛选项。字典清理完成后改回 true 即可恢复。
const HEALTH_TAG_FILTER_ENABLED = false

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})
const healthTagMappingLoaded = ref(false)
let healthTagMappingPromise: Promise<void> | null = null

// 计算已选筛选数量
const activeFiltersCount = computed(() => {
  let count = 0
  count += filterState.value.selectedLifeStages.filter(Boolean).length
  if (HEALTH_TAG_FILTER_ENABLED) {
    count += filterState.value.selectedHealthTags.filter(Boolean).length
  }
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
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
})

/**
 * 未读消息数（2026-10-18）。
 * 失败静默给 0 —— 红点拿不到不该打扰顾客。
 */
async function refreshUnreadMessages() {
  if (!getToken()) {
    storeUnreadMessageCount(0)
    refreshCurrentTabBar()
    return
  }
  try {
    storeUnreadMessageCount(await fetchUnreadMessageCount())
  } catch {
    storeUnreadMessageCount(0)
  }
  // 首页是打开 App 的第一站；拿到未读数后要让自定义 tabBar 立刻显示/隐藏红点
  refreshCurrentTabBar()
}

// 检查登录状态
const checkLoginStatus = () => {
  const token = getToken()
  isLoggedIn.value = !!token
}

/**
 * 401 时 API 层已经清掉 token；首页不能等下一次 onShow 才更新。
 * 立刻切到未登录，让顶部的「立即登录」Banner 当场出现。
 */
function handleAuthExpired() {
  isLoggedIn.value = false
  if (dogs.value.length > 0) {
    dogs.value = []
  }
  refreshCurrentTabBar()
}

// 页面加载
function getQueryStringValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '')
  return String(value || '')
}

function handleCustomerServiceEntry(options: Record<string, unknown> = {}) {
  if (customerServiceRouteHandled) return

  const csType = getQueryStringValue(options.csType)
  const csProductId = getQueryStringValue(options.csProductId)
  const csOrderId = getQueryStringValue(options.csOrderId)

  let targetUrl = ''
  if (csType === 'PRODUCT' && csProductId) {
    targetUrl = `/pages/recipe-detail/index?recipeId=${encodeURIComponent(csProductId)}`
  } else if ((csType === 'ORDER' || csType === 'AFTERSALE' || csType === 'REFUND') && csOrderId) {
    targetUrl = String(csOrderId).startsWith('CR')
      ? `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(csOrderId)}`
      : `/pages/order-detail/index?id=${encodeURIComponent(csOrderId)}`
  }

  if (!targetUrl) return

  customerServiceRouteHandled = true
  setTimeout(() => {
    uni.navigateTo({
      url: targetUrl,
      fail: (error) => {
        console.warn('[Home] customer service card navigation failed:', error)
      },
    })
  }, 200)
}

onLoad((options = {}) => {
  handleCustomerServiceEntry(options as Record<string, unknown>)
})

onMounted(() => {
  uni.$on(AUTH_EXPIRED_EVENT, handleAuthExpired)
  hasMountedHome.value = true
  checkLoginStatus()
  loadRecipeCoverOriginalOnlyMap()
  loadHomeHeaderBackground()
  void loadCustomRecipeFee()
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

  // 试吃装入口：失败静默，不影响首页其它内容
  loadTastingPackEntry()
})

onUnmounted(() => {
  uni.$off(AUTH_EXPIRED_EVENT, handleAuthExpired)
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
  // 从未读页返回时铃铛红点要立刻变（失败静默给 0）
  void refreshUnreadMessages();
  refreshCurrentTabBar()
  checkLoginStatus()

  // 漏斗：首页曝光（漏斗第 1 步）
  trackFunnelEvent({
    eventName: 'home_view',
    step: 'home',
    entrySource: 'tabbar',
  })

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
      quiet: true,
      // 登录态校验失败由 Banner/未登录界面表达，不再弹一条“请先登录”
      suppressErrorToast: true,
    })
    if (res.code === 0 && res.data) {
      dogs.value = Array.isArray(res.data) ? res.data : []
    }
  } catch (err) {
    console.error('加载狗狗列表失败:', err)
  }
}

// ==================== 食谱定制入口 ====================

/**
 * 首页入口只负责"把人带过去"，**刻意不展示任何金额**。
 *
 * 定制费在定制页与订单确认页里已经有完整交代，
 * 入口上再堆一遍数字只会让首屏变吵。
 * 因此这里既不读配置、也不落任何价格文案。
 */

/** 首页定制入口：未登录先登录，登录后进定制页（页面自己再引导建档） */
function goToCustomRecipe() {
  trackFunnelEvent({
    eventName: 'tap_custom_recipe',
    step: 'tap_custom_recipe',
    entrySource: 'home_custom_recipe_card',
  })

  if (!isLoggedIn.value) {
    checkLoginAndNavigate('/pages/custom-recipe/index')
    return
  }

  uni.navigateTo({ url: '/pages/custom-recipe/index' })
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

      // 筛选项（含食材名→ID 映射）就绪后才能把过敏档案套进来
      void loadAllergenSuggestion()
    }
  }).catch((err: any) => {
    healthTagMappingLoaded.value = false
    console.error('[Home] Load filter options error:', err)
  })
}

/**
 * 读取档案里的过敏，生成首页筛选的默认排除项（2026-10-04，第一期）。
 *
 * 只取第一只有过敏记录的狗：
 *   · 只有一只狗 → 自动套用
 *   · 多只狗    → 只给建议，抽屉里一键应用
 *                 （不知道顾客说的是哪只，静默套用别的狗的过敏会让人莫名其妙）
 */
async function loadAllergenSuggestion(): Promise<void> {
  if (!isLoggedIn.value || dogs.value.length === 0) {
    allergenSuggestion.value = null
    return
  }

  for (const dog of dogs.value) {
    const dogId = String(dog?.id || '')
    if (!dogId) continue

    let profile: any = null
    try {
      const res: any = await dogApi.allergenProfile(dogId)
      if (res?.code !== 0) continue
      profile = res?.data || null
    } catch {
      // 过敏档案读不到不能挡住首页 —— 静默跳过
      continue
    }

    const ingredientNames = Array.isArray(profile?.avoidedIngredientNames)
      ? profile.avoidedIngredientNames.filter(
          (item: unknown) => typeof item === 'string' && item,
        )
      : []
    if (ingredientNames.length === 0) continue

    const allergenNames: string[] = Array.from(
      new Set<string>(
        (Array.isArray(profile?.allergens) ? profile.allergens : [])
          .map((item: any) => String(item?.allergen || '').trim())
          .filter(Boolean),
      ),
    )

    allergenSuggestion.value = {
      dogId,
      dogName: String(dog?.name || '这只狗'),
      allergenNames,
      ingredientNames,
    }

    // 只有一只狗时直接默认排除：顾客自己填过的过敏，不该让他再挑一遍
    if (dogs.value.length === 1 && !excludedFilterTouchedByUser.value) {
      applyAllergenSuggestion(false)
    }
    return
  }

  allergenSuggestion.value = null
}

/**
 * 把档案里的过敏套用到排除筛选。
 *
 * @param refresh 是否立刻重新拉食谱（自动套用时首页尚未加载完，不必重复拉）
 */
function applyAllergenSuggestion(refresh = true) {
  const suggestion = allergenSuggestion.value
  if (!suggestion) return

  const ids: string[] = []
  for (const name of suggestion.ingredientNames) {
    const matched = ingredientNameToIds.value[name]
    if (Array.isArray(matched)) ids.push(...matched)
  }

  if (ids.length === 0) {
    // 原料库里没有对应食材（例如顾客写的是"海鲜"而库里没有可筛选的水产）——
    // 不算失败，只是这次没有可排除的项
    return
  }

  const merged = new Set([...filterState.value.excludedIngredients, ...ids])
  filterState.value.excludedIngredients = Array.from(merged)
  draftFilterState.value.excludedIngredients = Array.from(merged)

  if (refresh) {
    refreshRecipesWithFilters()
  }
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
  if (newFilters.value.mainProteinNodeIds.length > 0) {
    params.mainProteinNodeIds = newFilters.value.mainProteinNodeIds.join(',')
  }
  if (newFilters.value.needTagIds.length > 0) {
    params.needTagIds = newFilters.value.needTagIds.join(',')
  }
  if (newFilters.value.avoidTagIds.length > 0) {
    params.avoidTagIds = newFilters.value.avoidTagIds.join(',')
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

      // 拉取已加载食谱的参考价（接口未就绪时静默降级，不展示价格）
      loadReferencePrices(newRecipes.map((recipe: Recipe) => recipe.id))

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
    if (pendingShelfRefresh) {
      pendingShelfRefresh = false
      refreshRecipesWithFilters()
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

/**
 * 列表刷新前的统一复位。
 *
 * 参考价必须一起清空：loadReferencePrices 会跳过"已经在 map 里"的 id，
 * 不清的话刷新后永远显示上一次的价格；同时把请求代次 +1，
 * 让刷新前发出的旧请求回来时不再写进 map。
 */
function resetRecipeListForRefresh() {
  recipes.value = []
  visibleRecipesCount.value = 0
  hasMore.value = true
  currentPage.value = 1
  referencePriceMap.value = {}
  referencePriceRequestSeq += 1
}

function refreshRecipesWithFilters() {
  resetRecipeListForRefresh()
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
  // 顾客自己动过之后就不再自动套用档案里的过敏，免得把他的选择冲掉
  excludedFilterTouchedByUser.value = true
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
  excludedFilterTouchedByUser.value = true
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
function viewRecipe(recipeId: string, dogId?: string | null) {
  const query = [`recipeId=${encodeURIComponent(recipeId)}`]
  if (dogId) {
    query.push(`dogId=${encodeURIComponent(dogId)}`)
  }

  uni.navigateTo({
    url: `/pages/recipe-detail/index?${query.join('&')}`
  })
}

// 获取生命阶段标签
// 拉取食谱参考价（每100g、已含运费）。接口未就绪或失败时静默降级：不展示价格。
const tastingPackEntry = ref({
  visible: false,
  name: '多种口味试吃装',
  desc: '一单尝几种，不用凑起订量、只付一次运费',
  code: '',
})

/**
 * 试吃装入口。
 *
 * 只在"开放且确实有货"时展示 —— 首页摆一个点进去是空的入口，
 * 比不摆更伤信任。整段逻辑失败一律静默：首页不该因为一个次要入口而报错。
 */
async function loadTastingPackEntry() {
  try {
    const res = await fetchTastingPacks()
    if (res.code !== 0 || !res.data?.enabled) return
    const available = (res.data.items || []).filter((item) => !item.soldOut)
    if (available.length === 0) return

    const first = available[0]
    tastingPackEntry.value = {
      visible: true,
      name: first.name,
      desc: `${first.items.length} 道菜尝鲜 · 现货 ¥${first.unitPrice} 起`,
      code: first.code,
    }
  } catch (error) {
    // 入口失败不影响首页其它内容
  }
}

function goTastingPack() {
  const code = tastingPackEntry.value.code
  uni.navigateTo({
    url: code
      ? `/pages/tasting-pack/index?packId=${encodeURIComponent(code)}`
      : '/pages/tasting-pack/list',
  })
}

async function loadReferencePrices(recipeIds: string[]) {
  const targetIds = recipeIds.filter((id) => Boolean(id) && !referencePriceMap.value[id])
  if (targetIds.length === 0) return

  const requestSeq = referencePriceRequestSeq

  try {
    const res: any = await request({
      url: '/recipes/reference-prices',
      method: 'GET',
      data: { ids: targetIds.join(',') },
      quiet: true,
      suppressErrorToast: true,
    })

    if (res?.code !== 0) return
    // 刷新已经发生：这份响应属于上一轮，丢弃，等新请求的结果
    if (requestSeq !== referencePriceRequestSeq) return

    const items = Array.isArray(res?.data?.items) ? res.data.items : []
    items.forEach((item: any) => {
      const recipeId = item?.recipeId
      const minPricePer100g = Number(item?.minPricePer100g)
      // 只收有限正数：挡住 Number(null) === 0 → 首页显示 ¥0.00/100g
      if (!recipeId || !Number.isFinite(minPricePer100g) || !(minPricePer100g > 0)) return

      const priceByRecipeId: Record<string, number> = {}
      const lifeStagePrices = Array.isArray(item?.lifeStagePrices)
        ? item.lifeStagePrices
        : []
      lifeStagePrices.forEach((entry: any) => {
        const versionRecipeId = String(entry?.recipeId || '')
        const price = Number(entry?.pricePer100g)
        if (versionRecipeId && Number.isFinite(price) && price > 0) {
          priceByRecipeId[versionRecipeId] = price
        }
      })

      referencePriceMap.value[recipeId] = { minPricePer100g, priceByRecipeId }
    })
  } catch (error) {
    console.warn('[Home] Load reference prices failed:', error)
  }
}

function formatReferencePrice(amount: number): string {
  return Number(amount).toFixed(2)
}

function formatStatNum(num: number | undefined): string {
  if (!num || num < 1) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(num)
}


// 下拉刷新
onPullDownRefresh(() => {
  resetRecipeListForRefresh()
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

// 跳转到创建狗狗（统一入口：带来源埋点，建档成功后回到首页）
const goToDogCreate = () => {
  navigateToDogCreate({ source: 'home' })
}

// 跳转到狗狗详情
const goToDogDetail = (dogId: string) => {
  uni.navigateTo({ url: resolveDogProfileEntryRoute(dogId) })
}

// 跳转到订单列表
const goToOrderList = () => {
  uni.navigateTo({ url: '/pages/orders-list/index' })
}

// 跳转到健康管理
const goToHealthRecords = () => {
  if (!isLoggedIn.value) {
    checkLoginAndNavigate('/pages/dog-profile-health/index?from=home')
    return
  }

  if (dogs.value.length === 0) {
    uni.showToast({ title: '请先创建狗狗档案', icon: 'none' })
    goToDogCreate()
    return
  }

  uni.navigateTo({ url: '/pages/dog-profile-health/index?from=home' })
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

/**
 * 跳转登录页。
 *
 * redirect 由调用方给（例如首页的定制卡）：游客点"食谱定制"，如果登录完落回首页，
 * 他刚点的那件事就丢了，还得自己再找一遍入口。
 * 参数只认字符串 —— 模板里 `@tap="goToLogin"` 会把事件对象当第一个参数传进来。
 */
const goToLogin = (redirect?: unknown) => {
  const target = typeof redirect === 'string' ? redirect.trim() : ''
  uni.navigateTo({
    url: target
      ? `/pages/login/index?redirect=${encodeURIComponent(target)}`
      : '/pages/login/index'
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
          // 带上目标页：登录后直接回到顾客刚点的地方（与定制页同一套 redirect 约定）
          goToLogin(url)
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
      title: 'Setar 赛文的食堂 - 为您的爱犬定制健康食谱',
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
      title: 'Setar 赛文的食堂 - 为您的爱犬定制健康食谱',
      imageUrl: CURRENT_SHARE_CONFIG.homeImageUrl
    }
    console.log('[Home Share] 朋友圈配置:', JSON.stringify(config, null, 2))
    console.log('[Home Share] 图片URL:', config.imageUrl)
    return config
  }
})
</script>

<style scoped>
/* ==========================================================
   SevenKitchen 首页 · 高级质感风（深墨绿 + 金色）
   全局设计规范见 App.vue 中 page 级别的 CSS 变量
   ========================================================== */

.home-container {
  min-height: 100vh;
  background-color: #f0f3e9;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
}

/* ---------- 登录引导Banner ---------- */
.login-banner {
  background: linear-gradient(135deg, #14291f 0%, #1e3a2f 60%, #2b5040 100%);
  padding: 20rpx 28rpx;
}

.banner-content {
  display: flex;
  align-items: center;
}

.banner-accent {
  width: 6rpx;
  height: 56rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #d8bc85 0%, #b08d4f 100%);
  margin-right: 20rpx;
  flex-shrink: 0;
}

.banner-text {
  flex: 1;
  margin-right: 16rpx;
}

.banner-title {
  font-size: 26rpx;
  color: #f3eddd;
  line-height: 38rpx;
  letter-spacing: 1rpx;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.banner-login-btn {
  background: linear-gradient(135deg, #d8bc85 0%, #b08d4f 100%);
  color: #1e3a2f;
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: bold;
  letter-spacing: 1rpx;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.18);
}

.banner-close {
  font-size: 44rpx;
  color: rgba(243, 237, 221, 0.7);
  line-height: 1;
  padding: 0 4rpx;
}

/* ---------- 顶部品牌区 ---------- */
.header-section {
  background: linear-gradient(150deg, #14291f 0%, #1e3a2f 55%, #2b5040 100%);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  height: 240rpx;
  padding: 0;
  position: relative;
  overflow: hidden;
}

.header-section::before {
  content: '';
  position: absolute;
  right: -80rpx;
  top: -60rpx;
  width: 320rpx;
  height: 320rpx;
  border-radius: 50%;
  background: rgba(216, 188, 133, 0.12);
}

.header-section::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4rpx;
  background: linear-gradient(90deg, rgba(216, 188, 133, 0) 0%, #b08d4f 50%, rgba(216, 188, 133, 0) 100%);
}

/* ---------- 快捷功能入口 ---------- */
.quick-actions {
  display: flex;
  align-items: stretch;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  margin: -36rpx 24rpx 0;
  border-radius: 28rpx;
  padding: 34rpx 12rpx;
  box-shadow: 0 16rpx 44rpx rgba(20, 41, 31, 0.32);
  position: relative;
  z-index: 2;
}

.action-item {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.action-icon {
  width: 60rpx;
  height: 60rpx;
  display: block;
  flex-shrink: 0;
  margin-bottom: 8rpx;
}

.action-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #f3eddd;
  letter-spacing: 1rpx;
}

.action-divider {
  width: 1rpx;
  background: rgba(216, 188, 133, 0.35);
  margin: 10rpx 0;
}

/* ---------- 通用区块 ---------- */
.section {
  background: #fbfcf7;
  border: 1rpx solid #e5e8d4;
  margin: 24rpx;
  border-radius: 28rpx;
  padding: 28rpx;
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22rpx;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.section-accent {
  width: 8rpx;
  height: 34rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #d8bc85 0%, #b08d4f 100%);
  flex-shrink: 0;
}

.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
  letter-spacing: 2rpx;
}

.section-more {
  display: flex;
  align-items: center;
  color: #968f6d;
  font-size: 24rpx;
}

.arrow {
  margin-left: 6rpx;
  font-size: 28rpx;
  color: #b08d4f;
}

/* ---------- 狗狗卡片（紧凑单行） ---------- */
.dog-scroll {
  white-space: nowrap;
  padding-right: 20rpx;
  overflow-x: scroll;
  -webkit-overflow-scrolling: touch;
}

.dog-scroll::-webkit-scrollbar {
  display: none;
}

.dog-compact-item {
  display: inline-flex;
  align-items: center;
  gap: 14rpx;
  background: #eef2e4;
  border: 1rpx solid #dbe2c6;
  border-radius: 999rpx;
  padding: 10rpx 24rpx 10rpx 10rpx;
  margin-right: 16rpx;
  vertical-align: top;
}

.dog-compact-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 999rpx;
  display: block;
  flex-shrink: 0;
  background: #e6e6e6;
  border: 2rpx solid #d8c9a8;
  box-sizing: border-box;
}

.dog-compact-copy {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

.dog-compact-name {
  font-size: 26rpx;
  font-weight: bold;
  color: #26261f;
}

.dog-compact-weight {
  font-size: 20rpx;
  color: #968f6d;
}

.dog-compact-add {
  border: 1rpx dashed #c2c9a4;
  background: #fbfcf7;
  color: #968f6d;
}

.dog-compact-add .add-icon {
  font-size: 36rpx;
  line-height: 1;
  color: #b08d4f;
}

.dog-compact-add .add-text {
  font-size: 24rpx;
}

/* ---------- 空状态 ---------- */
.empty-dog-section {
  background: #fbfcf7;
  border: 1rpx solid #e5e8d4;
  margin: 24rpx;
  border-radius: 28rpx;
  padding: 56rpx 40rpx;
  text-align: center;
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.empty-ornament {
  width: 120rpx;
  height: 120rpx;
  margin: 0 auto 30rpx;
  border-radius: 50%;
  background: #f2ede0;
  border: 2rpx solid #ddcfa8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-ornament-inner {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: linear-gradient(160deg, #2b5040 0%, #1e3a2f 100%);
}

.empty-title {
  display: block;
  font-size: 16px;
  font-weight: bold;
  color: #26261f;
  margin-bottom: 8px;
}

.empty-desc {
  display: block;
  font-size: 14px;
  color: #968f6d;
  margin-bottom: 20px;
}

.create-btn {
  background: linear-gradient(135deg, #24493a 0%, #1e3a2f 100%);
  color: #f3eddd;
  border: none;
  border-radius: 999rpx;
  padding: 10px 30px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  box-shadow: 0 10rpx 24rpx rgba(30, 58, 47, 0.28);
}

/* ---------- 食谱橱窗 ---------- */
/* ===== 食谱定制入口卡：常驻，任何登录状态都展示 ===== */
.custom-recipe-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin: 32rpx 28rpx 0;
  padding: 28rpx 24rpx;
  background: linear-gradient(155deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: 28rpx;
  box-shadow: 0 14rpx 34rpx rgba(20, 41, 31, 0.24);
}

.custom-recipe-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.custom-recipe-heading {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.custom-recipe-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #f6efe0;
  letter-spacing: 2rpx;
}


.custom-recipe-desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #cfe0d5;
}


.custom-recipe-action {
  display: flex;
  align-items: center;
  gap: 4rpx;
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  border: 1rpx solid rgba(216, 188, 133, 0.7);
  border-radius: 999rpx;
}

.custom-recipe-action-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
}

.custom-recipe-action-text {
  font-size: 26rpx;
  font-weight: 700;
  color: #f3eddd;
}

.custom-recipe-action-fee {
  font-size: 18rpx;
  line-height: 1.3;
  color: rgba(246, 239, 224, 0.78);
  white-space: nowrap;
}

.custom-recipe-arrow {
  font-size: 30rpx;
  color: #d8bc85;
  line-height: 1;
}

.recipe-showcase-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 40rpx 28rpx 20rpx;
  gap: 16rpx;
}

.recipe-showcase-header .section-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #26261f;
  flex-shrink: 0;
}

.recipe-count {
  font-size: 24rpx;
  color: #968f6d;
  margin-left: auto;
}

.clear-all {
  font-size: 24rpx;
  color: #b08d4f;
  font-weight: 600;
  flex-shrink: 0;
}

/* ---------- 固定筛选栏 ---------- */
.filter-bar {
  position: relative;
  z-index: 1;
  background: rgba(240, 243, 233, 0.96);
  padding: 16rpx 28rpx;
  border-bottom: 1rpx solid #e3e6d4;
  display: flex;
  align-items: center;
  gap: 16rpx;
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
  padding: 14rpx 26rpx;
  background: #fbfcf7;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #6b6653;
  white-space: nowrap;
  border: 1rpx solid #dfe3ca;
  flex-shrink: 0;
}

.filter-btn.active {
  background: linear-gradient(135deg, #24493a 0%, #1e3a2f 100%);
  color: #f3eddd;
  border-color: #1e3a2f;
  box-shadow: 0 8rpx 20rpx rgba(30, 58, 47, 0.22);
}

.filter-btn.excluded {
  background: #f7e9e3;
  color: #b4553f;
  border-color: #d9b3a6;
}

.filter-btn-text {
  max-width: 300rpx;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-arrow {
  font-size: 18rpx;
  color: #9c9687;
  margin-left: 4rpx;
  flex-shrink: 0;
}

.filter-btn.active .dropdown-arrow {
  color: #d8bc85;
}

.filter-btn.excluded .dropdown-arrow {
  color: #b4553f;
}

.remove-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  background: rgba(0, 0, 0, 0.14);
  border-radius: 50%;
  font-size: 24rpx;
  font-weight: bold;
  color: #ffffff;
  flex-shrink: 0;
}

/* ---------- 食谱列表 ---------- */
.recipe-list {
  padding: 8rpx 24rpx 24rpx;
}

.recipe-card {
  background-color: #fbfcf7;
  border-radius: 28rpx;
  overflow: hidden;
  margin-bottom: 28rpx;
  box-shadow: 0 10rpx 32rpx rgba(30, 46, 36, 0.08);
  border: 1rpx solid #e5e8d4;
  contain: layout style;
}

.card-hover {
  opacity: 0.94;
}

.recipe-cover-wrapper {
  width: 100%;
  height: 380rpx;
  position: relative;
  overflow: hidden;
  contain: layout;
}

.recipe-cover {
  width: 100%;
  height: 100%;
  display: block;
}

.recipe-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(150deg, #24493a 0%, #1e3a2f 60%, #14291f 100%);
}

.placeholder-text {
  font-size: 120rpx;
  font-weight: bold;
  color: rgba(216, 188, 133, 0.9);
  font-family: Georgia, 'Times New Roman', serif;
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
  background: linear-gradient(180deg, rgba(20, 26, 21, 0) 0%, rgba(20, 26, 21, 0.55) 100%);
}

.recipe-cover-title-badge {
  max-width: 340rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(22, 34, 27, 0.62);
  border: 1rpx solid rgba(216, 188, 133, 0.55);
  color: #f0e6cd;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 32rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recipe-info {
  padding: 26rpx 28rpx 30rpx;
  position: relative;
  z-index: 1;
  background-color: #fbfcf7;
  transform: translateZ(0);
  will-change: transform;
}

.recipe-name-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14rpx;
  gap: 16rpx;
}

.recipe-name-wrap {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.recipe-orderable-badge {
  flex-shrink: 0;
  font-size: 20rpx;
  color: #1e3a2f;
  background: linear-gradient(160deg, #f0e6cd 0%, #e8d9b6 100%);
  border: 1rpx solid #d8c49a;
  border-radius: 12rpx;
  padding: 4rpx 14rpx;
  letter-spacing: 1rpx;
}

.recipe-order-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.recipe-price-label {
  font-size: 22rpx;
  color: #968f6d;
  letter-spacing: 2rpx;
  flex-shrink: 0;
}

.recipe-price-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #a9843e;
  font-family: Georgia, 'Times New Roman', serif;
}

.recipe-name {
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
  line-height: 1.4;
  word-break: break-all;
  overflow-wrap: break-word;
  min-height: 45rpx;
  min-width: 0;
}

.recipe-stats {
  display: flex;
  gap: 14rpx;
  flex-shrink: 0;
  padding-top: 6rpx;
}

.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  font-size: 20rpx;
  color: #968f6d;
  white-space: nowrap;
}

.stat-icon {
  width: 30rpx;
  height: 30rpx;
  flex-shrink: 0;
}

.ingredients {
  font-size: 26rpx;
  color: #6b6653;
  line-height: 1.7;
  display: flex;
  flex-wrap: wrap;
}

.ingredients-label {
  color: #968f6d;
  flex-shrink: 0;
}

.ingredients-list {
  flex: 1;
}

/* ---------- 状态 ---------- */
.loading-state,
.no-more {
  text-align: center;
  padding: 40rpx 0;
  color: #968f6d;
  font-size: 26rpx;
  letter-spacing: 2rpx;
}

.empty-recipe-state {
  text-align: center;
  padding: 100rpx 40rpx;
}

.empty-recipe-state .empty-ornament {
  margin-bottom: 32rpx;
}

.empty-recipe-state .empty-title {
  font-size: 34rpx;
  font-weight: bold;
  margin-bottom: 16rpx;
  color: #26261f;
}

.empty-recipe-state .empty-subtitle {
  font-size: 26rpx;
  line-height: 1.6;
  margin-bottom: 44rpx;
  color: #968f6d;
}

.btn-reset {
  width: 260rpx;
  height: 76rpx;
  line-height: 76rpx;
  background: linear-gradient(135deg, #24493a 0%, #1e3a2f 100%);
  color: #f3eddd;
  border-radius: 999rpx;
  font-size: 28rpx;
  letter-spacing: 2rpx;
  box-shadow: 0 10rpx 24rpx rgba(30, 58, 47, 0.25);
}

/* ---------- 筛选抽屉 ---------- */
.drawer-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(20, 26, 21, 0.55);
  z-index: 999;
  animation: fadeIn 0.25s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.drawer-content {
  position: absolute;
  top: 120rpx;
  left: 24rpx;
  right: 24rpx;
  background: #fbfcf7;
  border-radius: 28rpx;
  max-height: 74vh;
  display: flex;
  flex-direction: column;
  animation: slideDown 0.3s ease-out;
  box-shadow: 0 20rpx 60rpx rgba(20, 26, 21, 0.35);
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

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #e7e9d8;
  flex-shrink: 0;
}

.drawer-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #26261f;
  letter-spacing: 2rpx;
}

.close-btn {
  font-size: 52rpx;
  color: #9c9687;
  line-height: 1;
}

.drawer-body {
  flex: 1;
  padding: 28rpx;
  box-sizing: border-box;
  overflow-x: hidden;
}

.drawer-desc {
  font-size: 24rpx;
  color: #8a6d3b;
  margin-bottom: 24rpx;
  padding: 16rpx 20rpx;
  background: #f6efe0;
  border-radius: 12rpx;
  border-left: 6rpx solid #b08d4f;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

/* 档案里记的过敏（2026-10-04，第一期） */
.allergen-hint {
  margin-bottom: 24rpx;
  padding: 20rpx 24rpx;
  background: #fdf3ec;
  border-radius: 12rpx;
  border-left: 6rpx solid #ad5b2a;
  box-sizing: border-box;
}

.allergen-hint__title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #8a4520;
  margin-bottom: 8rpx;
}

.allergen-hint__list {
  display: block;
  font-size: 24rpx;
  color: #a3623a;
  margin-bottom: 16rpx;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.allergen-hint__action {
  display: inline-block;
  padding: 10rpx 28rpx;
  font-size: 24rpx;
  color: #ffffff;
  background: #ad5b2a;
  border-radius: 999rpx;
}

.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.tag-item {
  padding: 14rpx 30rpx;
  background: #f0f3e9;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #4b4a3d;
  border: 1rpx solid #dde3cd;
  transition: all 0.2s;
}

.tag-item.active {
  background: linear-gradient(135deg, #24493a 0%, #1e3a2f 100%);
  color: #f3eddd;
  border-color: #1e3a2f;
  box-shadow: 0 6rpx 16rpx rgba(30, 58, 47, 0.2);
}

.tag-item.excluded {
  background: #f7e9e3;
  color: #b4553f;
  border-color: #d9b3a6;
  text-decoration: line-through;
}

.excluded-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 24rpx;
  padding: 20rpx;
  background: #f6efe0;
  border: 1rpx dashed #d8c49a;
  border-radius: 12rpx;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.excluded-label {
  font-size: 24rpx;
  color: #8a6d3b;
  align-self: center;
}

.excluded-tag {
  padding: 8rpx 20rpx;
  background: #ffffff;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: #8a6d3b;
  border: 1rpx solid #d8c49a;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.drawer-actions {
  display: flex;
  gap: 16rpx;
  padding: 24rpx 28rpx calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #e7e9d8;
  background: #fbfcf7;
  flex-shrink: 0;
}

.drawer-action {
  flex: 1;
  height: 84rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
}

.drawer-action-secondary {
  background: #f0f3e9;
  color: #6b6653;
  border: 1rpx solid #dde3cd;
}

.drawer-action-primary {
  background: linear-gradient(135deg, #24493a 0%, #1e3a2f 100%);
  color: #f3eddd;
  box-shadow: 0 10rpx 24rpx rgba(30, 58, 47, 0.28);
}

/* ---------- 食材分组 ---------- */
.ingredient-group {
  margin-bottom: 16rpx;
}

.group-header {
  display: flex;
  align-items: center;
  padding: 18rpx 22rpx;
  background: #eef2e4;
  border: 1rpx solid #dbe2c6;
  border-radius: 12rpx;
  margin-bottom: 14rpx;
}

.group-arrow {
  font-size: 20rpx;
  color: #b08d4f;
  margin-right: 12rpx;
}

.group-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
  flex: 1;
}

.group-count {
  font-size: 22rpx;
  color: #968f6d;
  margin-left: 8rpx;
}

.group-body {
  padding: 0 8rpx;
}

.group-body .tag-grid {
  margin-top: 0;
}

/* 试吃装入口 */
.tasting-pack-entry {
  margin: 20rpx 24rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #2f5a45 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.tpe-body {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex: 1;
}

.tpe-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #ffffff;
}

.tpe-desc {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.78);
}

.tpe-btn {
  font-size: 26rpx;
  color: #1e3a2f;
  background: #ffffff;
  border-radius: 30rpx;
  padding: 12rpx 32rpx;
  flex-shrink: 0;
}


.shelf-filter {
  width: 100%;
}

.sf-bar {
  display: flex;
  gap: 16rpx;
  padding: 0 0 8rpx;
}

.sf-pill {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 26rpx;
  background: #fbfcf7;
  border: 1rpx solid #dfe3ca;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #6b6653;
  white-space: nowrap;
}

.sf-pill.is-active {
  background: linear-gradient(135deg, #24493a 0%, #1e3a2f 100%);
  border-color: #1e3a2f;
  color: #f3eddd;
  box-shadow: 0 8rpx 20rpx rgba(30, 58, 47, 0.22);
}

.sf-pill-car {
  font-size: 18rpx;
  opacity: 0.65;
}

.sf-pill-count {
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: #e5b96a;
  color: #2b2414;
  font-size: 18rpx;
  line-height: 28rpx;
  text-align: center;
}

.sf-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  background: rgba(22, 32, 27, 0.48);
  display: flex;
  align-items: flex-end;
}

.sf-sheet {
  width: 100%;
  max-height: 84vh;
  background: #fbfaf4;
  border-radius: 32rpx 32rpx 0 0;
  box-shadow: 0 -18rpx 48rpx rgba(25, 34, 28, 0.18);
  display: flex;
  flex-direction: column;
}

.sf-handle {
  width: 64rpx;
  height: 8rpx;
  margin: 16rpx auto 0;
  border-radius: 999rpx;
  background: #d8d3c0;
}

.sf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 32rpx 12rpx;
}

.sf-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1f2a24;
}

.sf-close {
  font-size: 40rpx;
  color: #a19b88;
  padding: 0 4rpx;
}

.sf-body {
  padding: 8rpx 32rpx 0;
  box-sizing: border-box;
}

.sf-body--auto {
  max-height: 30vh;
}

.sf-body--tall {
  height: 54vh;
}

.sf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 8rpx 0 16rpx;
}

.sf-chip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 22rpx;
  border-radius: 14rpx;
  border: 1rpx solid #dfe3ca;
  background: #f4f6ea;
  font-size: 25rpx;
  color: #4d5646;
}

.sf-chip.is-on {
  background: #24493a;
  border-color: #1e3a2f;
  color: #f3eddd;
}

.sf-chip--sm {
  padding: 9rpx 14rpx;
  font-size: 22rpx;
}

.sf-chip-n {
  font-size: 19rpx;
  color: #8c8a72;
  font-weight: 600;
}

.sf-chip.is-on .sf-chip-n {
  color: #d8e1c8;
}

.sf-chips--sub {
  padding: 0 0 12rpx 4rpx;
}

.sf-rows {
  padding: 4rpx 0 12rpx;
}

.sf-row,
.sf-group-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #eee9d9;
}

.sf-row-label,
.sf-group-name {
  font-size: 28rpx;
  color: #1f2a24;
  font-weight: 600;
}

.sf-row-count,
.sf-group-count {
  font-size: 22rpx;
  color: #8c8a72;
}

.sf-row-count {
  margin-left: auto;
}

.sf-row.is-on .sf-row-label {
  color: #24493a;
}

.sf-check {
  width: 34rpx;
  height: 34rpx;
  margin-left: auto;
  border-radius: 50%;
  border: 1rpx solid #d6d2c1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: #f3eddd;
}

.sf-row-count + .sf-check {
  margin-left: 8rpx;
}

.sf-row.is-on .sf-check,
.sf-group-head.is-on .sf-check {
  background: #24493a;
  border-color: #1e3a2f;
}

.sf-avoid {
  padding-bottom: 4rpx;
}

.sf-search {
  height: 72rpx;
  margin: 4rpx 0 8rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: #f1eee2;
  font-size: 24rpx;
  color: #1f2a24;
}

.sf-search-ph {
  color: #a7a18d;
}

.sf-group {
  border-bottom: 1rpx solid #eee9d9;
  padding-bottom: 8rpx;
}

.sf-group-head {
  border-bottom: 0;
  padding-bottom: 12rpx;
}

.sf-group-head.is-off {
  opacity: 0.55;
}

.sf-group-warn {
  margin-left: auto;
  font-size: 20rpx;
  color: #b4553f;
  font-weight: 700;
}

.sf-group-warn2 {
  display: block;
  padding: 0 0 12rpx 4rpx;
  font-size: 20rpx;
  color: #b4553f;
}

.sf-empty {
  padding: 48rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: #9b9783;
}

.sf-actions {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #eee9d9;
}

.sf-btn {
  flex: 1;
  height: 88rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 700;
}

.sf-btn--ghost {
  background: #f1eee2;
  color: #5d5a4a;
}

.sf-btn--primary {
  flex: 1.7;
  background: linear-gradient(135deg, #24493a 0%, #1e3a2f 100%);
  color: #f3eddd;
  box-shadow: 0 10rpx 24rpx rgba(30, 58, 47, 0.24);
}

</style>

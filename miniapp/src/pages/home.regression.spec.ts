import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('home runtime regressions', () => {
  it('keeps the feedback quick action entry on the home page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('建议反馈')
    expect(source).toContain('@tap="goToFeedback"')
    expect(source).toContain("/pages/feedback-list/index")
  })

  it('adds a recipe designer quick action immediately after feedback', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('食谱设计')
    expect(source).toContain('@tap="goToRecipeDesigner"')
    expect(source).toContain('src="/static/home-actions/recipe-designer.png"')
    expect(source).toContain("/pages/recipe-designer/list")

    const feedbackIndex = source.indexOf('@tap="goToFeedback"')
    const designerIndex = source.indexOf('@tap="goToRecipeDesigner"')
    expect(feedbackIndex).toBeGreaterThan(-1)
    expect(designerIndex).toBeGreaterThan(feedbackIndex)
  })

  it('adds health records to the home quick action tools', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('健康记录')
    expect(source).toContain('@tap="goToHealthRecords"')
    expect(source).toContain("/pages/dog-profile-health/index")
  })

  it('uses minimal abstract quick action icons instead of emoji or detailed illustrations', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('src="/static/home-actions/feedback.png"')
    expect(source).toContain('src="/static/home-actions/weight-management.png"')
    expect(source).toContain('src="/static/home-actions/calculate-portion.png"')
    expect(source).toContain('src="/static/home-actions/health-records.png"')
    expect(source).toContain('class="action-icon"')
    expect(source).not.toContain('message-box')
    expect(source).not.toContain('weight-scale-shell')
    expect(source).not.toContain('portion-bowl')
    expect(source).not.toContain('💬')
    expect(source).not.toContain('⚖️')
    expect(source).not.toContain('🥣')
    expect(source).not.toContain('action-icon-weight-solid')
    expect(source).not.toContain('weight-body')
    expect(source).not.toContain('weight-handle')
    expect(source).not.toContain('action-icon-trend')
    expect(source).not.toContain('trend-line')
    expect(source).not.toContain('trend-point')
    expect(source).not.toContain('action-icon--health')
    expect(source).not.toContain('action-icon__cross')
    expect(source).not.toContain('scale-pan')
    expect(source).not.toContain('spoon-head')
    expect(source).not.toContain('feedback-dots')
  })

  it('keeps each homepage quick action backed by a static PNG asset', () => {
    const actionIconNames = [
      'calculate-portion',
      'weight-management',
      'health-records',
      'feedback',
      'recipe-designer',
    ]

    actionIconNames.forEach((name) => {
      expect(
        existsSync(resolve(process.cwd(), `src/static/home-actions/${name}.png`)),
      ).toBe(true)
    })
  })

  it('uses the configured global homepage header background image', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain(':style="headerSectionStyle"')
    expect(source).toContain("const homeHeaderBgImageUrl = ref('')")
    expect(source).toContain('const headerSectionStyle = computed(() =>')
    expect(source).toContain("url: '/global-config'")
    expect(source).toContain('res.data.homeHeaderBgImageUrl')
    expect(source).toContain('loadHomeHeaderBackground()')
    expect(source).toContain("backgroundSize: 'contain'")
    expect(source).toContain('height: 400rpx')
    expect(source).toContain('padding: 0')
    expect(source).not.toContain('Hi~欢迎来到Seven的厨房')
    expect(source).not.toContain('class="welcome-text"')
  })

  it('falls back to original recipe cover URLs when thumbnail loading fails', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('getRecipeCoverImageUrl')
    expect(source).toContain("const RECIPE_COVER_ORIGINAL_ONLY_STORAGE_KEY = 'home_recipe_cover_original_only_urls_v2'")
    expect(source).toContain('const recipeCoverOriginalOnlyMap = ref<Record<string, boolean>>({})')
    expect(source).toContain('displayCoverUrl?: string')
    expect(source).toContain('v-if="recipe.displayCoverUrl"')
    expect(source).toContain(':src="recipe.displayCoverUrl"')
    expect(source).toContain('@error="handleRecipeCoverError(recipe)"')
    expect(source).toContain('uni.getStorageSync(RECIPE_COVER_ORIGINAL_ONLY_STORAGE_KEY)')
    expect(source).toContain('uni.setStorageSync(')
    expect(source).toContain('RECIPE_COVER_ORIGINAL_ONLY_STORAGE_KEY')
    expect(source).toContain('isKnownStaleRecipeCoverUrl(recipe.coverImageUrl)')
    expect(source).toContain('getRecipeCoverImageUrl(recipe.coverImageUrl, {')
    expect(source).toContain('skipOptimization: shouldUseOriginalRecipeCover(recipe.coverImageUrl)')
    expect(source).toContain('displayCoverUrl: normalizeImageUrl(recipe.coverImageUrl)')
    expect(source).toContain('const STALE_RECIPE_COVER_REVEAL_DELAY_MS = 1500')
    expect(source).toContain('scheduleStaleRecipeCoverReveal()')
  })

  it('renders recipe cover titles as subtle bottom badges only when a real cover image exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('coverTitle?: string')
    expect(source).toContain('v-if="recipe.displayCoverUrl && recipe.coverTitle"')
    expect(source).toContain('class="recipe-cover-badge-gradient"')
    expect(source).toContain('class="recipe-cover-title-badge"')
    expect(source).toContain('{{ recipe.coverTitle }}')
    expect(source).toContain('.recipe-cover-badge-gradient')
    expect(source).toContain('.recipe-cover-title-badge')
    expect(source).not.toContain('class="cover-title-overlay"')
  })

  it('refreshes recipe stats on return when the DIY flow marked them dirty', () => {
    const homeSource = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )
    const detailSource = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const favoritesSource = readFileSync(
      resolve(process.cwd(), 'src/pages/favorite-recipes/index.vue'),
      'utf-8',
    )

    expect(homeSource).toContain("const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'")
    expect(homeSource).toContain("const recipeStatsDirty = uni.getStorageSync(HOME_RECIPE_STATS_DIRTY_KEY)")
    expect(homeSource).toContain('uni.removeStorageSync(HOME_RECIPE_STATS_DIRTY_KEY)')
    expect(homeSource).toContain('loadRecipes(true)')

    expect(detailSource).toContain("const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'")
    expect(detailSource).toContain("uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')")

    expect(favoritesSource).toContain("const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'")
    expect(favoritesSource).toContain("uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')")
  })

  it('waits for health tag mappings before a dirty home refresh loads recipes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const healthTagMappingLoaded = ref(false)')
    expect(source).toContain('let healthTagMappingPromise: Promise<void> | null = null')
    expect(source).toContain('function ensureHealthTagMappingLoaded(): Promise<void> {')
    expect(source).toContain('ensureHealthTagMappingLoaded().finally(() => {')
    expect(source).toContain('healthTagMappingLoaded.value = true')
  })

  it('avoids duplicate initial home loads and suppresses verbose home request logs', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const hasMountedHome = ref(false)')
    expect(source).toContain('const visibleRecipesCount = ref(pageSize)')
    expect(source).toContain('const renderedRecipes = computed(() =>')
    expect(source).toContain('v-for="recipe in renderedRecipes"')
    expect(source).toContain('const INITIAL_RECIPE_RENDER_COUNT = 3')
    expect(source).toContain('if (!hasMountedHome.value) {')
    expect(source).toContain('hasMountedHome.value = true')
    expect(source).not.toContain('onMounted(async () => {')
    expect(source).not.toContain('onShow(async () => {')
    expect(source).not.toContain("uni.showLoading({ title: '加载中...' })")
    expect((source.match(/quiet: true/g) || []).length).toBeGreaterThanOrEqual(3)
    expect(source).not.toContain("console.log('[Home] Recipes Response:'")
  })

  it('tracks recipe views explicitly from the detail page instead of counting every recipe read', () => {
    const apiSource = readFileSync(
      resolve(process.cwd(), 'src/utils/api.ts'),
      'utf-8',
    )
    const detailSource = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const diySource = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const diySheetSource = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(apiSource).toContain('export function trackRecipeView(recipeId: string, shareToken?: string): Promise<void>')
    expect(apiSource).toContain("url: `/recipes/${recipeId}/view`")
    expect(detailSource).toContain('const actionRecipeId = selectedRecipeIdForActions.value')
    expect(detailSource).toContain('trackRecipeView(actionRecipeId, shareToken.value)')
    expect(detailSource).not.toContain('trackRecipeView(recipeId.value, shareToken.value)')
    expect(diySource).not.toContain('trackRecipeView(')
    expect(diySheetSource).not.toContain('trackRecipeView(')
  })

  it('uses explicit drawer apply actions for recipe filters on the home page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const draftFilterState = ref<FilterState>({')
    expect(source).toContain('class="drawer-actions"')
    expect(source).toContain('@tap="cancelLifeStageDrawer"')
    expect(source).toContain('@tap="resetLifeStageDraft"')
    expect(source).toContain('@tap="cancelHealthTagsDrawer"')
    expect(source).toContain('@tap="resetHealthTagsDraft"')
    expect(source).toContain('@tap="cancelExcludedTagsDrawer"')
    expect(source).toContain('@tap="resetExcludedTagsDraft"')
    expect(source).toContain('查看结果')
    expect(source).toContain('filterState.value.selectedLifeStages = [...draftFilterState.value.selectedLifeStages]')
    expect(source).toContain('filterState.value.selectedHealthTags = [...draftFilterState.value.selectedHealthTags]')
    expect(source).toContain('filterState.value.excludedIngredients = [...draftFilterState.value.excludedIngredients]')
  })

  it('renders dog profile previews as square avatar tiles with name-only overlays', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain("import { resolveDogAvatarSrc } from '../../utils/dog-avatar'")
    expect(source).toContain('class="dog-card-avatar"')
    expect(source).toContain(':src="resolveDogAvatarSrc(dog.avatarUrl)"')
    expect(source).toContain('mode="aspectFill"')
    expect(source).toContain('class="dog-card-name-overlay"')
    expect(source).toContain('<text class="dog-card-name">{{ dog.name }}</text>')
    expect(source).toContain('height: 220rpx !important;')
    expect(source).toContain('padding: 0;')
    expect(source).toContain('background: rgba(18, 20, 24, 0.58);')
    expect(source).toContain('border-radius: 999rpx;')
    expect(source).toContain('padding: 6rpx 12rpx;')
    expect(source).not.toContain('class="dog-breed"')
    expect(source).not.toContain('class="dog-detail"')
    expect(source).not.toContain('ageText: calculateAgeText')
    expect(source).not.toContain('const calculateAgeText =')
  })

  it('does not render or load personalized recipe recommendations on the home page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('专属食谱推荐')
    expect(templateSource).not.toContain('personalized-section')
    expect(templateSource).not.toContain('selectDogForRecommendations')
    expect(templateSource).not.toContain('exclusiveRecipes')
    expect(templateSource).not.toContain('generalRecommendedRecipes')
    expect(source).not.toContain('recipeRecommendationApi')
    expect(source).not.toContain('loadPersonalizedRecommendations')
    expect(source).not.toContain('recommendedDog')
  })
})

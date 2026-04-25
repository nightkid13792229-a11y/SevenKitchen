import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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

  it('uses minimal abstract quick action icons instead of emoji or detailed illustrations', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('action-icon-message')
    expect(source).toContain('action-icon-weight-scale')
    expect(source).toContain('weight-scale-shell')
    expect(source).toContain('weight-scale-display')
    expect(source).toContain('weight-scale-needle')
    expect(source).toContain('action-icon-bowl')
    expect(source).not.toContain('💬')
    expect(source).not.toContain('⚖️')
    expect(source).not.toContain('🥣')
    expect(source).not.toContain('action-icon-weight-solid')
    expect(source).not.toContain('weight-body')
    expect(source).not.toContain('weight-handle')
    expect(source).not.toContain('action-icon-trend')
    expect(source).not.toContain('trend-line')
    expect(source).not.toContain('trend-point')
    expect(source).not.toContain('scale-pan')
    expect(source).not.toContain('spoon-head')
    expect(source).not.toContain('feedback-dots')
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
    expect(detailSource).toContain('trackRecipeView(recipeId.value, shareToken.value)')
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
})

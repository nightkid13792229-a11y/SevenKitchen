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

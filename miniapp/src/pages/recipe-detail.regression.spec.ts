import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('recipe detail nutrition report regressions', () => {
  it('renders the structured nutrition report entry when Setar report data exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('hasStructuredNutritionReport')
    expect(source).toContain('@tap="openNutritionReportPage"')
    expect(source).toContain('/pages/recipe-nutrition-report/index')
    expect(source).not.toContain('nutritionReportUrl?: string')
    expect(source).not.toContain('v-if="recipe.nutritionReportUrl"')
  })

  it('does not download uploaded PDF nutrition reports from recipe detail', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain('function openNutritionReport()')
    expect(source).not.toContain('uni.downloadFile')
    expect(source).not.toContain('uni.openDocument')
    expect(source).not.toContain("fileType: 'pdf'")
  })

  it('places the nutrition report entry below the nutrition analysis section', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    const analysisIndex = source.indexOf('class="nutrition-panel"')
    const reportIndex = source.indexOf('class="nutrition-report-card"')

    expect(analysisIndex).toBeGreaterThan(-1)
    expect(reportIndex).toBeGreaterThan(-1)
    expect(reportIndex).toBeGreaterThan(analysisIndex)
  })

  it('renders cover titles as bottom badges instead of top-left overlays', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('v-if="recipe.coverImageUrl && recipe.coverTitle"')
    expect(source).toContain('class="recipe-detail-cover-badge-gradient"')
    expect(source).toContain('class="recipe-detail-cover-title-badge"')
    expect(source).toContain('{{ recipe.coverTitle }}')
    expect(source).not.toContain('class="cover-title-overlay"')
    expect(source).not.toContain('.cover-title-overlay')
    expect(source).not.toContain('.cover-title-text')
  })

  it('uses customer-facing labels for nutrition sections', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('核心营养成分')
    expect(source).toContain('详细营养报告')
    expect(source).toContain('查看完整报告')
    expect(source).not.toContain('<text class="card-title">营养成分分析</text>')
    expect(source).not.toContain('<text class="report-title">营养报告</text>')
  })

  it('does not render dog-specific feeding recalculation on recipe detail', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain('按狗狗重算喂食量')
    expect(source).not.toContain('切换宠物后，饭量和阶段提醒会自动更新')
    expect(source).not.toContain('class="dog-fit-card"')
    expect(source).not.toContain('dogRecipeCalc')
    expect(source).not.toContain('calc-for-recipe')
  })

  it('registers the standalone nutrition report page', () => {
    const pagesJson = readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8')
    const reportPage = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-nutrition-report/index.vue'),
      'utf-8',
    )

    expect(pagesJson).toContain('pages/recipe-nutrition-report/index')
    expect(reportPage).toContain('完整营养报告')
    expect(reportPage).toContain('nutrientSections')
    expect(reportPage).toContain('macroRows')
  })

  it('keeps the standalone nutrition report aligned with the Setar publish report layout', () => {
    const reportPage = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-nutrition-report/index.vue'),
      'utf-8',
    )

    expect(reportPage).toContain('基础信息')
    expect(reportPage).toContain('食谱原料清单')
    expect(reportPage).toContain('ingredientRows')
    expect(reportPage).toContain('单位')
    expect(reportPage).toContain('下限')
    expect(reportPage).toContain('/1,000kcal')
    expect(reportPage).toContain('上限')
    expect(reportPage).toContain('食谱含量')
    expect(reportPage).toContain('干物质/100g')
    expect(reportPage).toContain('unit-cell')
    expect(reportPage).toContain('stacked-head')
    expect(reportPage).not.toContain('getStatusLabel')
    expect(reportPage).not.toContain('status-cell')
  })

  it('keeps standalone ingredient and macro report tables within the mobile viewport', () => {
    const reportPage = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-nutrition-report/index.vue'),
      'utf-8',
    )
    const ingredientSection = reportPage.match(/<view v-if="ingredientRows.length > 0" class="section">[\s\S]*?<view v-if="macroRows.length > 0 \|\| energyDensityRows.length > 0" class="section">/)?.[0] || ''
    const macroSection = reportPage.match(/<view v-if="macroRows.length > 0 \|\| energyDensityRows.length > 0" class="section">[\s\S]*?<view\s+v-for="section in nutrientSections"/)?.[0] || ''

    expect(ingredientSection).not.toContain('scroll-x')
    expect(macroSection).not.toContain('scroll-x')
    expect(reportPage).toContain('compact-report-table-wrap')
    expect(reportPage).toContain('compact-report-table')
    expect(reportPage).toMatch(/\.compact-report-table\s*\{[\s\S]*width: 100%;/)
    expect(reportPage).toMatch(/\.ingredient-name-cell\s*\{[\s\S]*flex: 1 1 0;[\s\S]*white-space: normal;/)
    expect(reportPage).toMatch(/\.amount-cell\s*\{[\s\S]*flex: 0 0 150rpx;/)
    expect(reportPage).toMatch(/\.percent-cell\s*\{[\s\S]*flex: 0 0 134rpx;/)
    expect(reportPage).toMatch(/\.macro-table \.nutrient-name-cell\s*\{[\s\S]*flex: 0 0 142rpx;/)
    expect(reportPage).toMatch(/\.macro-table \.report-number-cell\s*\{[\s\S]*flex: 1 1 0;/)
  })

  it('clarifies supplement nutrient targets as per kg food ingredient basis', () => {
    const recipeDetailSource = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const snapshotModalSource = readFileSync(
      resolve(process.cwd(), 'src/components/RecipeSnapshotModal.vue'),
      'utf-8',
    )

    expect(recipeDetailSource).toContain('每kg食材添加')
    expect(recipeDetailSource).not.toContain('每kg添加')
    expect(snapshotModalSource).toContain('每kg食材添加')
    expect(snapshotModalSource).not.toContain('每kg添加')
  })

  it('uses customer-facing bottom action button labels without a cart shortcut', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('自己制作')
    expect(source).toContain('订购成品')
    expect(source).not.toContain('现做成品')
    expect(source).not.toContain('/static/icons/cart-orange.png')
    expect(source).not.toContain('handleCartTap')
    expect(source).not.toContain('isInCart')
    expect(source).not.toContain('查看购物车')
    expect(source).not.toContain('移出购物车')
    expect(source).not.toContain('removeCartItem')
    expect(source).not.toContain('cart-glyph')
    expect(source).not.toContain('自己做')
    expect(source).not.toContain('我要自己做')
    expect(source).not.toContain('>成品<')
  })

  it('does not render a customer service entry on recipe detail', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain('<CustomerServiceFloatButton')
    expect(source).not.toContain("source-type=\"PRODUCT\"")
    expect(source).not.toContain("import CustomerServiceFloatButton")
  })

  it('renders food nutrition state labels separately from preparation methods', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('nutritionStateLabel?: string')
    expect(source).toContain('v-if="item.nutritionStateLabel"')
    expect(source).toContain('class="nutrition-state-tag"')
    expect(source).toContain('{{ item.nutritionStateLabel }}')
  })

  it('recognizes the precise recipe designer life stage labels in recipe detail', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain("'PUPPY_UNDER_14_WEEKS': '小于14周幼犬'")
    expect(source).toContain("'PUPPY_14_WEEKS_PLUS': '大于等于14周幼犬'")
    expect(source).toContain("'LOW_ACTIVITY_ADULT_OR_SENIOR': '低运动量成犬或老年犬'")
    expect(source).toContain("'HIGH_ACTIVITY_ADULT': '普通或高运动量成犬'")
    expect(source).toContain("'REPRODUCTION': '繁殖期'")
  })

  it('uses backend selected life-stage version metadata instead of the old header tag loop', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('v-for="stage in recipe.applicableLifeStages"')
    expect(source).toContain('availableLifeStageVersions')
    expect(source).toContain('lifeStageMatch')
  })

  it('orders the backend selected concrete recipe version', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('selectedRecipeIdForActions')
    expect(source).toContain('recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}')
  })

  it('uses a non-matched default life stage copy before dog-specific matched copy', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const copySource = source.match(
      /const lifeStageVersionCopy = computed\(\(\) => \{[\s\S]*?\n}\)/,
    )?.[0] || ''

    expect(source).toContain('当前狗狗档案没有完全匹配版本，已展示可用替代版本。')
    expect(copySource).toContain('recipe.value.lifeStageMatch?.message')
    expect(copySource).toContain('!isCurrentLifeStageMatched.value')
    expect(copySource.indexOf('recipe.value.lifeStageMatch?.message'))
      .toBeLessThan(copySource.indexOf('!isCurrentLifeStageMatched.value'))
    expect(copySource.indexOf('!isCurrentLifeStageMatched.value'))
      .toBeLessThan(copySource.indexOf('selectedDog.value'))
  })

  it('guards recipe detail response ordering before state writes and side effects', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const loadRecipeDetailSource = source.match(
      /function loadRecipeDetail\(\) \{[\s\S]*?\n}\n\nasync function preGenerateShareToken/,
    )?.[0] || ''

    expect(source).toContain('let recipeDetailRequestSeq = 0')
    expect(loadRecipeDetailSource).toContain('const currentRequestSeq = ++recipeDetailRequestSeq')
    expect(loadRecipeDetailSource).toContain('if (currentRequestSeq !== recipeDetailRequestSeq) {')
    expect(loadRecipeDetailSource.indexOf('if (currentRequestSeq !== recipeDetailRequestSeq) {'))
      .toBeLessThan(loadRecipeDetailSource.indexOf('recipe.value = {'))
    expect(loadRecipeDetailSource.indexOf('if (currentRequestSeq !== recipeDetailRequestSeq) {'))
      .toBeLessThan(loadRecipeDetailSource.indexOf('trackRecipeView(actionRecipeId, shareToken.value)'))
    expect(loadRecipeDetailSource.indexOf('if (currentRequestSeq !== recipeDetailRequestSeq) {'))
      .toBeLessThan(loadRecipeDetailSource.indexOf('updateShareInfo('))
    expect(loadRecipeDetailSource.indexOf('if (currentRequestSeq !== recipeDetailRequestSeq) {'))
      .toBeLessThan(loadRecipeDetailSource.indexOf('preGenerateShareToken()'))
    expect(loadRecipeDetailSource.indexOf('if (currentRequestSeq !== recipeDetailRequestSeq) {'))
      .toBeLessThan(loadRecipeDetailSource.indexOf('checkFavoriteStatus()'))
    expect(loadRecipeDetailSource).toContain('if (currentRequestSeq !== recipeDetailRequestSeq) return')
    expect(loadRecipeDetailSource).toContain('if (currentRequestSeq === recipeDetailRequestSeq) {')
    expect(loadRecipeDetailSource.indexOf('if (currentRequestSeq === recipeDetailRequestSeq) {'))
      .toBeLessThan(loadRecipeDetailSource.indexOf('uni.hideLoading()'))
  })
})

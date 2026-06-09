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
    expect(reportPage).toContain('标准下限')
    expect(reportPage).toContain('/1,000kcal')
    expect(reportPage).toContain('标准上限')
    expect(reportPage).toContain('食谱含量')
    expect(reportPage).toContain('/100gDM')
    expect(reportPage).not.toContain('能量密度 · {{ row.label }}')
    expect(reportPage).not.toContain('干物质/100g')
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

  it('shows recipe health tags without the health tag section label', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('</template>'))

    expect(templateSource).toContain('v-for="tag in recipe.targetHealthTags"')
    expect(templateSource).toContain('class="tag health-tag"')
    expect(templateSource).not.toContain('<text class="section-label">健康标签')
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

  it('lets customers switch the dog used for detail life-stage matching', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const selectDogSource = source.match(
      /function selectDogForDetail[\s\S]*?\n}\n\nfunction openLifeStageSelector/,
    )?.[0] || ''

    expect(templateSource).toContain('recipe-detail-dog-selector')
    expect(templateSource).toContain('v-for="dog in dogs"')
    expect(templateSource).toContain('recipe-detail-dog-avatar')
    expect(templateSource).toContain(':src="resolveDogAvatarSrc(dog.avatarUrl)"')
    expect(templateSource).toContain("@tap=\"selectDogForDetail(dog.id)\"")
    expect(templateSource).toContain("['recipe-detail-dog-chip', { active: dog.id === selectedDogId }]")
    expect(templateSource).not.toContain('匹配狗狗')
    expect(source).toContain("import { resolveDogAvatarSrc } from '../../utils/dog-avatar'")
    expect(source).toContain('function selectDogForDetail')
    expect(selectDogSource).toContain('uni.setStorageSync(\'dogId\', nextDogId)')
    expect(selectDogSource).toContain("selectedManualLifeStage.value = ''")
    expect(selectDogSource).toContain('loadRecipeDetail()')
  })

  it('uses the dog id from page options and backend match metadata before cached dog state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const mountedSource = source.match(/onMounted\(async \(\) => \{[\s\S]*?\n}\)/)?.[0] || ''
    const loadRecipeDetailSource = source.match(
      /function loadRecipeDetail\(\) \{[\s\S]*?\n}\n\nasync function preGenerateShareToken/,
    )?.[0] || ''
    const loadDogsSource = source.match(
      /async function loadDogsForDetail\(\)[\s\S]*?\n}\n\nasync function checkFavoriteStatus/,
    )?.[0] || ''

    expect(source).toContain("const initialDogId = ref('')")
    expect(mountedSource).toContain("initialDogId.value = currentPage.options?.dogId || ''")
    expect(mountedSource).toContain("dogId.value = initialDogId.value || uni.getStorageSync('dogId') || null")
    expect(loadRecipeDetailSource).toContain('const matchedDogId = res.data.lifeStageMatch?.dogId || res.data.lifeStageMatch?.matchedDogId')
    expect(loadRecipeDetailSource).toContain('syncSelectedDogFromMatch(matchedDogId)')
    expect(loadDogsSource).toContain('initialDogId.value || dogId.value || uni.getStorageSync(\'dogId\') || dogs.value[0].id')
    expect(source).toContain('function syncSelectedDogFromMatch')
  })

  it('places health tags directly under the recipe name before dog and life-stage controls', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const recipeNameIndex = templateSource.indexOf('class="recipe-name"')
    const tagsIndex = templateSource.indexOf('class="tags-row"')
    const dogSelectorIndex = templateSource.indexOf('class="recipe-detail-dog-selector"')
    const lifeStageIndex = templateSource.indexOf('class="life-stage-version-card"')

    expect(recipeNameIndex).toBeGreaterThan(-1)
    expect(tagsIndex).toBeGreaterThan(recipeNameIndex)
    expect(dogSelectorIndex).toBeGreaterThan(tagsIndex)
    expect(lifeStageIndex).toBeGreaterThan(dogSelectorIndex)
    expect(templateSource).not.toContain('recipe-detail-dog-selector-title')
    expect(templateSource).not.toContain('recipe-detail-dog-selector-current')
  })

  it('hands the selected dog from detail into DIY and finished-order flows', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const diySource = source.match(
      /function generateDiySheet\(\)[\s\S]*?\n}\n\nfunction goToOrder/,
    )?.[0] || ''
    const orderSource = source.match(
      /function goToOrder\(\)[\s\S]*?\n}\n\nfunction selectDogForDetail/,
    )?.[0] || ''

    expect(diySource).toContain("`dogId=${encodeURIComponent(selectedDogId.value)}`")
    expect(diySource).toContain("url: `/pages/recipe-diy/index?${query.join('&')}`")
    expect(orderSource).toContain("`dogId=${encodeURIComponent(selectedDogId.value)}`")
    expect(orderSource).toContain('lifeStage=${encodeURIComponent(recipe.value.selectedLifeStage)}')
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

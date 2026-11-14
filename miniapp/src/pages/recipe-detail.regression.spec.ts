import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readAllPagePaths } from '../../test-utils/pages-json'

describe('recipe detail nutrition report regressions', () => {
  it('renders the structured nutrition report entry when Setar report data exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('hasStructuredNutritionReport')
    // 2026-11-07：入口卡片抽成共享组件，点击事件从页面模板移进组件的 @open
    expect(source).toContain('<NutritionReportEntry @open="openNutritionReportPage" />')
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

    // 角标已上移到系列层级（合规词表引用），文案只来自 coverBadges；
    // 没配角标就不显示，不再回退 coverTitle
    expect(source).toContain('v-if="recipe.coverImageUrl && resolveCoverBadgeText(recipe)"')
    expect(source).toContain('class="recipe-detail-cover-badge-gradient"')
    expect(source).toContain('class="recipe-detail-cover-title-badge"')
    expect(source).toContain('{{ resolveCoverBadgeText(recipe) }}')
    expect(source).not.toContain('class="cover-title-overlay"')
    expect(source).not.toContain('.cover-title-overlay')
    expect(source).not.toContain('.cover-title-text')
  })

  it('uses customer-facing labels for nutrition sections', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const reportEntry = readFileSync(
      resolve(process.cwd(), 'src/components/recipe/NutritionReportEntry.vue'),
      'utf-8',
    )
      // 只认渲染节点：组件注释里也写着「营养报告」，断言整份源码就等于没断言
      // （2026-11-08 审核发现：把模板删掉，旧断言照样绿）
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')

    expect(source).toContain('核心营养成分')
    // 2026-11-07 老板定的文案：标题「营养报告」、按钮「查看报告」，
    // 副标题说清报告里有什么（氨基酸 / 脂肪酸 / 维生素 / 矿物质）
    expect(reportEntry).toContain('>营养报告</text>')
    expect(reportEntry).toContain('>查看报告</text>')
    expect(reportEntry).toContain(
      '>包含氨基酸、脂肪酸、维生素、矿物质在内的详细营养评估</text>',
    )
    expect(source).not.toContain('<text class="card-title">营养成分分析</text>')
    // 旧文案不能再回来
    expect(source).not.toContain('详细营养报告')
    expect(source).not.toContain('查看完整报告')
    expect(reportEntry).not.toContain('查看 Setar 生成的完整营养评估')
    // 那个没有信息量的「营养」方块标识已按老板要求去掉
    expect(source).not.toContain('class="report-icon"')
    expect(reportEntry).not.toContain('>营养</text>')
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
    const pagePaths = readAllPagePaths()
    const reportPage = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-nutrition-report/index.vue'),
      'utf-8',
    )

    expect(pagePaths).toContain('pages/recipe-nutrition-report/index')
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
    const nutrientRowsSource = readFileSync(
      resolve(process.cwd(), 'src/utils/supplement-nutrients.ts'),
      'utf-8',
    )
    const snapshotModalSource = readFileSync(
      resolve(process.cwd(), 'src/components/RecipeSnapshotModal.vue'),
      'utf-8',
    )

    // 2026-11-07：详情页的浓度口径收进共享工具，且文案统一成「每公斤食材添加」
    // 2026-11-08：接线也收成 `buildSupplementNutrientRowsFromItems(supplementItems)`
    // —— 原来在页面里自己 map，漏传 items 时整块永不渲染，而守卫只查函数名
    expect(recipeDetailSource).toContain(
      'buildSupplementNutrientRowsFromItems(supplementItems.value)',
    )
    expect(nutrientRowsSource).toContain('每公斤食材添加')
    expect(nutrientRowsSource).not.toContain('每kg添加')
    expect(snapshotModalSource).toContain('每kg食材添加')
    expect(snapshotModalSource).not.toContain('每kg添加')
  })

  it('★ 详情页不再列补剂产品，只列需额外补充的营养素（2026-11-07）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const template = source.slice(0, source.indexOf('<script setup'))

    // 板块标题与两列表头：营养素 / 添加浓度
    expect(template).toContain('需额外补充的营养素')
    expect(template).toContain('supplementNutrientRows')
    expect(template).toContain('营养素')
    expect(template).toContain('添加浓度')
    // 补剂产品名、添加时机（出锅前/冷却后）都不再出现在这一块
    expect(template).not.toContain('营养补充剂</text>')
    expect(template).not.toContain('supplement-method')
    expect(template).not.toContain('nutrient-target-value')
    expect(source).not.toContain('function getNutrientTargetText')
  })

  it('uses customer-facing bottom action button labels without a cart shortcut', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('自己做')
    expect(source).toContain('买成品')
    expect(source).not.toContain('现做成品')
    expect(source).not.toContain('/static/icons/cart-orange.png')
    expect(source).not.toContain('handleCartTap')
    expect(source).not.toContain('isInCart')
    expect(source).not.toContain('查看购物车')
    expect(source).not.toContain('移出购物车')
    expect(source).not.toContain('removeCartItem')
    expect(source).not.toContain('cart-glyph')
    expect(source).not.toContain('我要自己做')
    expect(source).not.toContain('>成品<')
  })

  it('does not render health tags on recipe detail', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('</template>'))

    expect(templateSource).not.toContain('v-for="tag in recipe.targetHealthTags"')
    expect(templateSource).not.toContain('class="tag health-tag"')
    expect(templateSource).not.toContain('class="tags-row"')
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

    // 2026-09-19：中文名统一收敛到 label-mapping，页面里不再自带第二份映射
    expect(source).toContain("getLifeStageLabel } from '../../utils/label-mapping'")
    expect(source).not.toContain("'PUPPY_UNDER_14_WEEKS': '幼犬版（14 周内）'")

    // 中文名的唯一来源仍然是 label-mapping，且覆盖设计器的全部阶段
    const labelMapping = readFileSync(
      resolve(process.cwd(), 'src/utils/label-mapping.ts'),
      'utf-8',
    )
    expect(labelMapping).toContain("'PUPPY_UNDER_14_WEEKS': '幼犬版（14 周内）'")
    expect(labelMapping).toContain("'PUPPY_14_WEEKS_PLUS': '幼犬版（14 周以上）'")
    expect(labelMapping).toContain("'LOW_ACTIVITY_ADULT_OR_SENIOR': '低活动成犬 / 老年版'")
    expect(labelMapping).toContain("'HIGH_ACTIVITY_ADULT': '成犬版'")
    expect(labelMapping).toContain("'REPRODUCTION': '繁殖期版'")
  })

  it('uses backend selected life-stage version metadata instead of the old header tag loop', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('v-for="stage in recipe.applicableLifeStages"')
    expect(source).toContain('availableLifeStageVersions')
    // 2026-09-19 精简：生命阶段卡不再展示"通俗补充说明"与"本品可选"两行
    expect(source).not.toContain('lifeStagePlainHint');
    expect(source).not.toContain('LIFE_STAGE_PLAIN_HINT');
    expect(source).not.toContain('availableLifeStageSummary');
    expect(templateSource).not.toContain('life-stage-version-plain');
    expect(templateSource).not.toContain('life-stage-version-options');

    /**
     * 2026-10-18：生命阶段卡改成**共享组件**（四页共用一份）。
     *
     * 原来这里断言的是"页面自己有 isLifeStageMismatch computed + 三串 matchType +
     * mismatch 样式" —— 那三条保证现在**移到了组件里**：
     *   `components/recipe/LifeStageVersionCard.spec.ts`
     * 页面这边的责任变成"**确实用了那个组件**、并且把后端结论传进去"。
     *
     * 意图没变（未匹配必须视觉区分），只是实现位置变了 —— 断言跟着搬。
     */
    expect(templateSource).toContain('<LifeStageVersionBar');
    expect(templateSource).toContain(':state="lifeStageState"');
    expect(templateSource).toContain(':current-label="selectedLifeStageLabel"');
    expect(templateSource).toContain('<LifeStageVersionSheet');
    // 页面不再自己判定"是否匹配"—— 判定只有一份（utils + 后端）
    expect(source).not.toContain('const isLifeStageMismatch = computed');

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

    // 2026-11-07：胶囊改用共享组件；详情页只放选择器，不显示六项读数
    expect(templateSource).toContain('recipe-detail-dog-selector')
    expect(templateSource).toContain('<DogContextPanel')
    expect(templateSource).toContain(':dogs="dogs"')
    expect(templateSource).toContain(':selected-id="selectedDogId"')
    expect(templateSource).toContain(':state="dogPanelState"')
    expect(templateSource).toContain('facts="none"')
    expect(templateSource).toContain(':panel="false"')
    expect(templateSource).toContain('@select="selectDogForDetail"')
    // 2026-11-07 复审修：原来写成了 goToCreateDog（本页只有 goCreateDog），
    // 空档案的「创建狗狗档案」点了没反应；这条断言之前把错名字钉死了。
    expect(templateSource).toContain('@create-dog="goCreateDog"')
    expect(templateSource).not.toContain('goToCreateDog')
    expect(templateSource).toContain('@retry="retryDogsLoad"')
    expect(source).toContain('function retryDogsLoad')
    expect(source).toContain("import DogContextPanel from '@/components/dog/DogContextPanel.vue'")
    // 六项读数不该出现在详情页：facts="none" 已由组件契约兜住（组件测试里断言）
    expect(templateSource).not.toContain('order-dog-chip')
    expect(templateSource).not.toContain('匹配狗狗')
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
    // 2026-11-15：初始化收进 resolveInitialDogId（优先级 URL > storage；锁版直接 null）
    expect(mountedSource).toContain('resolveInitialDogId({')
    expect(mountedSource).toContain('urlDogId: initialDogId.value')
    expect(loadRecipeDetailSource).toContain('resolveRecipeDetailDogId({')
    expect(loadRecipeDetailSource).toContain('const matchedDogId = res.data.lifeStageMatch?.dogId || res.data.lifeStageMatch?.matchedDogId')
    expect(loadRecipeDetailSource).toContain('syncSelectedDogFromMatch(matchedDogId)')
    expect(loadDogsSource).toContain('initialDogId.value || dogId.value || uni.getStorageSync(\'dogId\') || dogs.value[0].id')
    expect(source).toContain('function syncSelectedDogFromMatch')
  })

  it('places dog and life-stage controls directly under the recipe name (no health tags)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const recipeNameIndex = templateSource.indexOf('class="recipe-name"')
    const dogSelectorIndex = templateSource.indexOf('class="recipe-detail-dog-selector"')
    // 生命阶段卡已改成共享组件，这里按组件标签找位置
    const lifeStageIndex = templateSource.indexOf('<LifeStageVersionBar')

    expect(recipeNameIndex).toBeGreaterThan(-1)
    expect(dogSelectorIndex).toBeGreaterThan(recipeNameIndex)
    expect(lifeStageIndex).toBeGreaterThan(dogSelectorIndex)
    expect(templateSource).not.toContain('class="tags-row"')
    expect(templateSource).not.toContain('recipe-detail-dog-selector-title')
    expect(templateSource).not.toContain('recipe-detail-dog-selector-current')
  })

  it('hands the selected dog from detail into DIY and finished-order flows', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    // 首单路径修剪后，两条链路的目标路由分别由 buildDiyRoute() / buildOrderRoute()
    // 统一组装：既用于"已登录直接跳转"，也用于"登录后直达"，避免意图丢失。
    const diySource = source.match(
      /function buildDiyRoute\(\)[\s\S]*?\n}\n/,
    )?.[0] || ''
    const orderSource = source.match(
      /function buildOrderRoute\(\)[\s\S]*?\n}\n/,
    )?.[0] || ''

    expect(diySource).toContain("`dogId=${encodeURIComponent(selectedDogId.value)}`")
    expect(diySource).toContain("return `/pages/recipe-diy/index?${query.join('&')}`")
    expect(orderSource).toContain("`dogId=${encodeURIComponent(selectedDogId.value)}`")
    // 2026-11-02：只有顾客手动选过版本才把 lifeStage 带过去，并标 manual=true
    expect(orderSource).toContain('selectedManualLifeStage.value')
    expect(orderSource).toContain('manual=true')
    // 登录后直达：两条链路都必须把目标页作为 redirect 传下去
    const diyFlow = source.match(
      /function generateDiySheet\(\)[\s\S]*?\n}\n/,
    )?.[0] || ''
    const orderFlow = source.match(
      /function goToOrder\(\)[\s\S]*?\n}\n/,
    )?.[0] || ''
    expect(diyFlow).toContain('promptLoginAndRedirect(')
    expect(diyFlow).toContain('target')
    expect(orderFlow).toContain('promptLoginAndRedirect(')
    expect(orderFlow).toContain('target')
  })

  it('★ 不匹配时的文案说清"为什么"（2026-11-02 起由 life-stage-ui 承担）', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/utils/life-stage-ui.ts'),
      'utf-8',
      )
    // 说清原因，但不用系统词"不匹配/没有完全匹配版本"
    expect(code).toContain('这道菜没有适合')
    expect(code).toContain('幼犬配方与成犬不同')
    expect(code).not.toContain('没有完全匹配的版本')
  })

  it('only labels a life-stage version as matched when backend returns dog-specific match metadata', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    /**
     * 2026-10-18：判断"能不能说已匹配"的逻辑搬进了共享组件。
     * 页面的责任变成一件更简单的事：**把后端结论原样传进去**。
     */
    expect(source).not.toContain('hasDogSpecificLifeStageMatch')
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    expect(templateSource).toContain(':state="lifeStageState"')
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

  it('renders the compliant selling point right under the recipe name when present', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain('sellingPoint?: string')
    expect(templateSource).toContain('v-if="recipe.sellingPoint"')
    expect(templateSource).toContain('class="recipe-selling-point"')
    expect(templateSource).toContain('{{ recipe.sellingPoint }}')
    // 位置：紧跟在食谱名之后、狗狗选择器之前，不打乱既有信息顺序
    const nameIndex = templateSource.indexOf('class="recipe-name"')
    const sellingPointIndex = templateSource.indexOf('class="recipe-selling-point"')
    const dogSelectorIndex = templateSource.indexOf('class="recipe-detail-dog-selector"')
    expect(sellingPointIndex).toBeGreaterThan(nameIndex)
    expect(sellingPointIndex).toBeLessThan(dogSelectorIndex)
    // 无卖点时整块不渲染（不出现空占位）
    expect(templateSource).not.toContain('class="recipe-selling-point" v-else')
  });

  it('carries a manually chosen version into the DIY route too', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const diySource = source.match(/function buildDiyRoute\(\)[\s\S]*?\n}\n/)?.[0] || ''
    expect(diySource).toContain('selectedManualLifeStage.value')
    expect(diySource).toContain('manual=true')
  })

  it('loads the dog list before the recipe so the first render has a dog', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    const mounted = source.match(/onMounted\(async \(\) => \{[\s\S]*?\n}\)/)?.[0] || ''
    expect(mounted.indexOf('await loadDogsForDetail()')).toBeGreaterThan(-1)
    expect(mounted.indexOf('await loadDogsForDetail()')).toBeLessThan(
      mounted.indexOf('loadRecipeDetail()'),
    )
  })
})

describe('recipe detail reference price copy', () => {
  it('详情页参考价不再带"起"，并写清最终价以下单页为准', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    );
    const template = source.slice(0, source.indexOf('<script setup'));

    expect(template).toContain('约¥');
    expect(template).not.toContain('/100g起');
    expect(template).not.toContain("? '起'");
    // 两个分支（有/无狗狗档案）都要写清最终价以下单页为准
    // 价格按 1kg 起订量估算，且写清最终价以下单页为准
    expect(template).toContain(
      '按起订量估算 · 已含冷链配送 · 最终价格以下单页为准',
    );
    // 不能买成品（顾客自建食谱）时不展示价格条
    expect(template).toContain(
      'v-if="displayReferencePrice && canBuyFinishedFood"',
    );
  });
});
describe('recipe detail · pinRecipe 锁版入口（2026-11-15）', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
    'utf-8',
  )

  it('识别 pinRecipe=1', () => {
    expect(source).toContain("currentPage.options?.pinRecipe === '1'")
  })

  it('锁版时首次不用账号里的狗，请求也不带 dogId', () => {
    expect(source).toContain('resolveInitialDogId')
    expect(source).toContain('resolveRecipeDetailDogId')
    // 狗列表加载后不自动选狗；onMounted 补一次「无狗」请求
    expect(source).toContain('if (pinRecipe.value) {')
    expect(source).toContain('pinRecipe.value && !selectedDogId.value')
  })
})

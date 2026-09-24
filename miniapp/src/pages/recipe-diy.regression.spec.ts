import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('recipe diy regressions', () => {
  it('hides loading safely after navigating to the generated DIY sheet', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain('safeHideLoading()')
    expect(source).toContain('function safeHideLoading()')
    expect(source).toContain('fail: () => {}')
    expect(source).not.toContain('finally {\n    uni.hideLoading()')
  })

  it('defaults the selected dog from detail handoff before cached or first dog', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const mountedSource = source.match(/onMounted\(async \(\) => \{[\s\S]*?\n}\)/)?.[0] || ''
    const loadDogsSource = source.match(
      /async function loadDogs\(\)[\s\S]*?\n}\n\nasync function selectDog/,
    )?.[0] || ''

    expect(source).toContain("const initialDogId = ref('')")
    expect(mountedSource).toContain("initialDogId.value = options.dogId || ''")
    expect(loadDogsSource).toContain('const preferredDogId = initialDogId.value || uni.getStorageSync(\'dogId\') || \'\'')
    expect(loadDogsSource).toContain('const preferredDog = res.data.find((dog: Dog) => dog.id === preferredDogId) || res.data[0]')
    expect(loadDogsSource).toContain('await selectDog(preferredDog.id)')
  })

  it('offers a quick switch to the selected dog matched life-stage recipe version', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const switchSource = source.match(
      /async function switchToRecommendedLifeStage[\s\S]*?\n}\n/,
    )?.[0] || ''

    expect(templateSource).toContain('v-if="recommendedLifeStageOption"')
    expect(templateSource).toContain('@tap="switchToRecommendedLifeStage"')
    expect(templateSource).toContain("切换到{{ recommendedLifeStageOption.label }}")
    expect(source).toContain("const selectedLifeStage = ref('')")
    expect(source).toContain('availableLifeStageVersions?: RecipeLifeStageVersion[]')
    expect(source).toContain('const recommendedLifeStageOption = computed')
    expect(source).toContain('version.lifeStage === selectedDogRecipeLifeStage.value')
    expect(source).toContain('function resetDiyLifeStageDependentState')
    expect(switchSource).toContain('const option = recommendedLifeStageOption.value')
    expect(switchSource).toContain('selectedLifeStage.value = option.lifeStage')
    expect(switchSource).toContain('recipeId.value = option.recipeId')
    expect(switchSource).toContain('await loadRecipe()')
    expect(switchSource).toContain('await loadDogCalc(selectedDogId.value)')
    expect(switchSource).toContain('checkLifeStageMatch()')
  })

  /**
   * 2026-09-22：饭量说明与成品订购页对齐。
   * 原来这里是「饭量计算过程」+ 5 张计算卡（DER / 零食能量 / 鲜食能量 / 每日饭量 / 每餐饭量，
   * 带公式与中间值），对顾客做决定帮助很小；现在换成 3 条人话 + 一句观察建议。
   */
  it('explains daily intake with plain language instead of the calorie derivation cards', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    // 折叠入口与展开动作
    expect(templateSource).toContain('每日饭量是怎么算的？')
    expect(templateSource).toContain('@tap="toggleFeedingNote"')
    expect(source).toContain('const feedingNoteExpanded = ref(false)')
    expect(source).toContain('function toggleFeedingNote')

    // 3 条人话 + 观察建议仍保留
    expect(templateSource).toContain('算出它一天大概需要多少热量')
    expect(templateSource).toContain('做相应增减')
    expect(templateSource).toContain('就是每天的饭量')
    expect(templateSource).toContain('2-4 周')

    // 5 张计算卡与公式已下线
    expect(templateSource).not.toContain('每日能量需求 (DER)')
    expect(templateSource).not.toContain('每日零食能量')
    expect(templateSource).not.toContain('每日鲜食能量')
    expect(templateSource).not.toContain('每日饭量 = (鲜食能量 ÷ 食谱能量密度) × 1000')
    expect(templateSource).not.toContain('每餐饭量 = 每日饭量 ÷ 每日餐数')
    expect(source).not.toContain('showCalculationDetails')
  })

  /**
   * 2026-09-22：能量密度与「适用于」都不再展示（顾客做 DIY 决策用不到），
   * 顶部只保留食谱名 + 一句话卖点 + 营养标准背书卡。
   */
  it('keeps the top card to name, selling point and standard card only', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('能量密度')
    expect(templateSource).not.toContain('kcal/kg')
    expect(templateSource).not.toContain('适用于：')
    expect(templateSource).not.toContain('tags-row')
    expect(source).not.toContain('displayRecipeEnergyDensity')
    expect(source).not.toContain('recipeEnergyDensityKcalPerKg')

    // 卖点与营养标准卡保留
    expect(templateSource).toContain('recipe-selling-point')
    expect(templateSource).toContain('class="standard-card"')
  })

  /**
   * 2026-09-22：顶部补食谱封面，写法与 DIY 制作单页一致
   * （同一套 normalizeImageUrl + 无图占位态），并整幅贴到卡片上边缘。
   */
  it('shows the recipe cover at the very top, same as the DIY sheet page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain("import { normalizeImageUrl } from '../../utils/config'")
    expect(templateSource).toContain('class="recipe-cover-wrapper"')
    expect(templateSource).toContain(':src="normalizeImageUrl(recipe.coverImageUrl)"')
    expect(templateSource).toContain('mode="aspectFill"')
    // 无封面时的占位态
    expect(templateSource).toContain('recipe-cover-placeholder')
    expect(templateSource).toContain('食谱封面')

    // 封面在卡片最上方，位于食谱名之前
    expect(templateSource.indexOf('recipe-cover-wrapper')).toBeLessThan(
      templateSource.indexOf('recipe-name-wrapper'),
    )

    // 卡片去掉内边距让封面贴边，正文用内层容器留白
    expect(source).toContain('.recipe-info-section {\n  padding: 0;')
    expect(templateSource).toContain('class="recipe-info-body"')
    expect(source).toContain('.recipe-info-body {')

    // 封面高度与 DIY 制作单页一致
    expect(source).toContain('height: 400rpx')

    // 数据字段
    expect(source).toContain('coverImageUrl?: string')
  })

  it('mirrors the order dog selector and feeding context without purchase pricing copy', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    // 内部系统的「设计软件 Setar」不再展示给顾客
    expect(templateSource).not.toContain('设计软件')
    expect(source).not.toContain('formatRecipeFormulaSoftwareLabel')
    expect(source).not.toContain('recipeFormulaSoftwareLabel')

    // 狗狗选择器与成品订购页一致
    expect(templateSource).toContain('order-dog-scroll')
    expect(templateSource).toContain('order-dog-chip')
    expect(templateSource).toContain("['order-dog-chip', { active: dog.id === selectedDogId }]")
    expect(templateSource).toContain('@tap="selectDog(dog.id)"')
    expect(templateSource).toContain('order-dog-avatar')
    expect(templateSource).toContain('resolveDogAvatarSrc(dog.avatarUrl)')
    expect(templateSource).toContain('v-for="fact in dogProfileFacts"')
    expect(source).toContain('const dogProfileFacts = computed')
    expect(source).toContain("MALE: '弟弟'")
    expect(source).toContain("FEMALE: '妹妹'")

    // 档案 + 喂食参数合并为一行六项（不再另起「确定饭量」网格重复展示）
    expect(source).toContain("{ label: '每日餐次'")
    expect(source).toContain("{ label: '每日饭量'")
    expect(source).toContain("{ label: '每餐约'")
    expect(templateSource).not.toContain('dog-feeding-grid')
    expect(templateSource).not.toContain('每日参考')
    // 主食能量不展示
    expect(templateSource).not.toContain('主食能量')
    expect(source).not.toContain('dailyMainFoodEnergyText')

    // 六项参数照搬成品订购页：单行六列网格 + 卡片式单元格
    expect(templateSource).toContain('class="dog-profile-facts"')
    expect(source).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))')
    expect(source).toContain('border-top: 1rpx solid #e5e8d4')

    expect(templateSource).not.toContain('最低订购量')
    expect(templateSource).not.toContain('袋均价')
    expect(templateSource).not.toContain('确认订单')
  })

  it('uses configurable package plans for DIY sheets instead of purchase checkout pricing', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain('ORDER_CYCLE_OPTIONS')
    expect(source).toContain('buildDefaultPackagePlan')
    expect(source).toContain('getPackagePlanTotal(normalizedPackagePlan.value)')
    expect(source).toContain('packagePlanInlineSummaryText')
    expect(source).toContain('isCustomPackagePlan')
    expect(source).toContain('cancelCustomPackagePlan')
    expect(source).toContain('请先取消自定义分装后再切换配置天数')
    expect(source).toContain('packagePlan: JSON.stringify(normalizedPackagePlan.value)')
    expect(source).toContain('packageCount: totalPackages.value')
    expect(source).toContain('packageSpecG: getPrimaryPackageSpecG(normalizedPackagePlan.value)')
    expect(templateSource).toContain('快速选择备餐天数')
    expect(templateSource).toContain("{{ showPackageEditor ? '取消自定义' : '自定义分装' }}")
    expect(templateSource).toContain('v-for="(row, index) in packagePlan"')
    expect(templateSource).toContain('添加多个分装规格')
    expect(source).not.toContain('/orders/pricing/preview')
    expect(source).not.toContain('pricePreview')
    expect(source).not.toContain('minimumOrderMet')
    // 顾客自己做 → 没有最低起订量
    expect(source).not.toContain('最低起订量')
  })

  /**
   * 2026-09-22 按需求收敛：页面只保留「选狗 → 定天数/分装 → 生成」这条主线。
   */
  it('drops the "what you will get" block and the shelf-life foldout', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('你会拿到什么')
    expect(templateSource).not.toContain('what-you-get')
    expect(templateSource).not.toContain('保质期说明')
    expect(templateSource).not.toContain('shelf-life-notice')
    expect(source).not.toContain('showShelfLife')
    expect(source).not.toContain('toggleShelfLife')
  })

  /**
   * 本页不放客服入口；底部只有「生成制作单」一个按钮。
   */
  it('keeps the bottom bar to a single full-width action', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).not.toContain('CustomerServiceInlineButton')
    expect(templateSource).not.toContain('CustomerServiceInlineButton')
    expect(templateSource).not.toContain('bottom-bar-row')
    expect(source).toContain('.btn-generate {\n  width: 100%;')
    // 按钮不可用时仍会说明原因
    expect(templateSource).toContain('generateBlockReason')
  })

  /**
   * 补齐「加载失败 ≠ 没有档案」：失败时若显示成空态，顾客会重复建档。
   */
  it('separates dog list load failure from the empty state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain('const dogsLoadFailed = ref(false)')
    expect(source).toContain('async function retryDogsLoad')
    expect(source).toContain('dogsLoadFailed.value = true')
    expect(templateSource).toContain('v-if="dogsLoadFailed"')
    expect(templateSource).toContain('狗狗档案加载失败')
    expect(templateSource).toContain('避免重复建档')
    expect(templateSource).toContain('@tap="retryDogsLoad"')
  })

  /**
   * 营养标准改成可点开的背书卡（与食谱详情页/成品订购页同一展示方式）。
   */
  it('shows the nutrition standard as an explainable endorsement card', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).toContain('class="standard-card"')
    expect(templateSource).toContain('@tap="toggleStandardExplain"')
    expect(templateSource).toContain('符合 {{ recipeNutritionStandardLabel }}')
    expect(source).toContain('const nutritionStandardExplain = computed')
    expect(source).toContain('const standardExplainVisible = ref(false)')
    // 本地重复的映射函数已删除，统一走 utils/label-mapping
    expect(source).toContain('getNutritionStandardExplain, getNutritionStandardLabel')
    // 一句话卖点
    expect(templateSource).toContain('recipe-selling-point')
    expect(source).toContain('sellingPoint?: string')
  })

  /**
   * 2026-09-22：生命阶段提醒原来是「卡片确认一次 + 生成时再弹一次同义弹窗」，
   * 顾客会觉得"刚确认过又问一遍"，且弹窗的取消键正好是漏斗末端的放弃键。
   * 现在卡片确认即写留痕，本次不再弹窗；换狗或换生命阶段版本会重新提醒。
   */
  it('acknowledges the life-stage reminder once per dog without a second modal', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const dismissSource = source.match(
      /async function dismissWarning\(\)[\s\S]*?\n}\n/,
    )?.[0] || ''
    const generateSource = source.match(
      /async function generateSheet\(\)[\s\S]*?\n}\n/,
    )?.[0] || ''

    expect(source).toContain('const acknowledgedLifeStageDogIds = ref<string[]>([])')
    expect(source).toContain('const isLifeStageAcknowledged = computed')

    // 卡片确认时即写留痕
    expect(dismissSource).toContain('recordLifeStageAcknowledgement')
    expect(dismissSource).toContain("source: 'diy'")

    // 生成时若该狗已确认过，不再弹窗
    expect(generateSource).toContain('const alreadyAcknowledged')
    expect(generateSource).toContain('if (!alreadyAcknowledged)')
    expect(generateSource).toContain('confirmLifeStageMismatch')

    // 已确认的狗不再显示提醒卡片
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    expect(templateSource).toContain('!isLifeStageAcknowledged')

    // 换生命阶段版本＝换判定依据，重新提醒
    expect(source).toContain('acknowledgedLifeStageDogIds.value = []')
  })

  /**
   * 取消自定义分装会直接丢弃顾客填写的克数/袋数，先确认一次。
   */
  it('confirms before discarding a custom package plan', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain('取消自定义分装')
    expect(source).toContain('已恢复默认分装')
    expect(source).toContain('仍要取消')
    // ⚠️ cancelText 必须 ≤4 个汉字，否则微信既不显示弹窗也不报错（点了没反应）
    expect(source).toContain('继续编辑')
    // 互斥说明常驻，不靠点击失败解释
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    expect(templateSource).toContain('已启用自定义分装，上方天数选择暂不生效')
  })
})

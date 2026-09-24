import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('diy sheet layout regressions', () => {
  it('keeps the generated image preview constrained on real devices', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/ImagePreviewModal.vue'),
      'utf-8',
    )

    expect(source).toContain('class="preview-image-frame"')
    expect(source).toContain('mode="aspectFit"')
    expect(source).not.toContain('mode="widthFix"')
    expect(source).toMatch(/\.preview-image-frame\s*\{[\s\S]*height: 740rpx;[\s\S]*overflow: hidden;/)
    expect(source).toMatch(/\.preview-image\s*\{[\s\S]*width: 100%;[\s\S]*height: 100%;/)
  })

  it('renders the diy sheet canvas offscreen instead of hiding it from real devices', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('left: -9999px;')
    expect(source).toContain('position: fixed;')
    expect(source).not.toContain('visibility: hidden;')
  })

  it('exports the full diy sheet canvas from origin and logs actual image dimensions', () => {
    const canvasSource = readFileSync(
      resolve(process.cwd(), 'src/utils/print-canvas.ts'),
      'utf-8',
    )

    expect(canvasSource).toContain('x: 0')
    expect(canvasSource).toContain('y: 0')
    expect(canvasSource).toContain('uni.getImageInfo({')
    expect(canvasSource).toContain('actualSize')
  })

  it('exports a high-density png so saved diy sheet text remains sharp when zoomed', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const canvasSource = readFileSync(
      resolve(process.cwd(), 'src/utils/print-canvas.ts'),
      'utf-8',
    )

    expect(source).toContain('const PRINT_CANVAS_OUTPUT_SCALE = 2')
    expect(source).toContain('const PRINT_CANVAS_LOGICAL_WIDTH = 1200')
    expect(source).toContain('const PRINT_CANVAS_LOGICAL_HEIGHT = 1697')
    expect(source).toContain('const PRINT_CANVAS_OUTPUT_WIDTH = PRINT_CANVAS_LOGICAL_WIDTH * PRINT_CANVAS_OUTPUT_SCALE')
    expect(source).toContain(':width="PRINT_CANVAS_OUTPUT_WIDTH"')
    expect(source).toContain(':height="printCanvasOutputHeight"')
    // 高度按内容自适应
    expect(source).toContain('const printCanvasLogicalHeight = ref(PRINT_CANVAS_LOGICAL_HEIGHT)')
    expect(source).toContain('autoHeight: true')
    expect(source).toContain(':style="printCanvasStyle"')
    expect(source).toContain('const printCanvasStyle = computed(() => ({')
    expect(source).toContain('width: `${PRINT_CANVAS_OUTPUT_WIDTH}px`')
    expect(source).toContain('height: `${printCanvasOutputHeight.value}px`')
    expect(source).not.toContain('width: 1200px;')
    expect(source).not.toContain('height: 1697px;')
    expect(source).toContain('outputScale: PRINT_CANVAS_OUTPUT_SCALE')
    expect(canvasSource).toContain('outputScale?: number')
    expect(canvasSource).toContain('this.ctx.scale(this.outputScale, this.outputScale)')
    expect(canvasSource).toContain('destWidth: this.outputWidth')
    expect(canvasSource).toContain("fileType: 'png'")
  })

  it('prevents generating a DIY sheet image before page data is ready or while already generating', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const isPageDataLoaded = ref(false)')
    expect(source).toContain('const isGeneratingImage = ref(false)')
    expect(source).toContain(':disabled="!isPageDataLoaded || isGeneratingImage"')
    expect(source).toContain('if (!isPageDataLoaded.value || !recipe.value.name || !dog.value)')
  })

  it('allocates more width to the visible food-table preparation method column', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toMatch(/\.food-table \.name-col\s*\{\s*flex: 0\.95;/)
    expect(source).toMatch(/\.food-table \.recommend-col\s*\{\s*flex: 1\.15;/)
    expect(source).toMatch(/\.food-table \.method-col\s*\{\s*flex: 1\.6;/)
    expect(source).toMatch(/\.food-table \.actual-col\s*\{\s*flex: 0\.7;/)
  })

  it('keeps recommendation selection explicit in the spec modal', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const selectFnMatch = source.match(/function selectRecommendedProduct[\s\S]*?\n}\n/)

    expect(source).toContain('推荐购买渠道')
    expect(source).toContain('确认选择')
    expect(source).toMatch(/function selectRecommendedProduct[\s\S]*modalSelectedRpIndex\.value = Number\(rpIndex\)/)
    expect(selectFnMatch?.[0]).not.toContain('closeSpecModal()')
  })

  it('loads optimized product thumbnails lazily in the recommendation picker modal', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('getOptimizedProductImageUrl')
    expect(source).toContain(':src="getOptimizedProductImageUrl(rp.imageUrl)"')
    expect(source).toContain(':src="getOptimizedProductImageUrl(currentSpec.imageUrl)"')
    expect(source.match(/class="rp-card-image"[\s\S]{0,120}lazy-load/)?.[0]).toContain('lazy-load')
    expect(source.match(/class="spec-image"[\s\S]{0,120}lazy-load/)?.[0]).toContain('lazy-load')
  })

  /**
   * 2026-09-22：按需求把「去购买」从浅色描边改成实心金色，作为弹窗里最显眼的动作。
   * 「确认选择」仍是墨绿主按钮，两者靠颜色区分（金 = 去购买，墨绿 = 确认选择）。
   */
  /**
   * 2026-09-22 制作单页收敛：
   * 去掉生命阶段标签行、设计来源、三个建议板块；营养标准改用背书卡。
   */
  it('trims the top card to name plus the nutrition standard banner', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    // 生命阶段标签行删除
    expect(templateSource).not.toContain('life-stage-tag')
    expect(templateSource).not.toContain('class="tags-row"')
    // 设计来源不再出现在页面上
    expect(templateSource).not.toContain('设计来源')
    // 营养标准改成与 DIY 配置页同款的背书卡
    expect(templateSource).toContain('class="standard-card"')
    expect(templateSource).toContain('@tap="toggleStandardExplain"')
    expect(templateSource).toContain('符合 {{ recipeNutritionStandardLabel }}')
    expect(templateSource).toContain('犬营养标准')
    expect(source).toContain('const standardExplainVisible = ref(false)')
    expect(source).toContain('const nutritionStandardExplain = computed')
    expect(source).toContain("import { getNutritionStandardExplain } from '../../utils/label-mapping'")
  })

  it('drops the cooking / packaging / storage advice cards', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('烹饪建议')
    expect(templateSource).not.toContain('分装建议')
    expect(templateSource).not.toContain('储存&保质期')
    expect(templateSource).not.toContain('不建议微波、烤、煎等高温烹饪')
    expect(templateSource).not.toContain('-18℃冷冻保存6个月')
  })

  /**
   * 制作清单里的狗狗信息 / 制作信息改成「标签 + 数值」卡片网格，
   * 不再是一整行用 | 串起来的句子。
   */
  it('renders dog and making info as labelled fact cards', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).toContain('class="purchase-facts"')
    expect(templateSource).toContain('class="purchase-facts-grid"')
    expect(templateSource).toContain('class="purchase-fact-label"')
    expect(templateSource).toContain('v-for="fact in dogPurchaseFacts"')
    expect(templateSource).toContain('v-for="fact in makingPurchaseFacts"')
    expect(source).toContain('const dogPurchaseFacts = computed')
    expect(source).toContain('const makingPurchaseFacts = computed')
    // 制作信息只留三个数：每餐重量 / 总餐数 / 总净重
    expect(source).toContain("{ label: '每餐重量'")
    expect(source).toContain("{ label: '总餐数'")
    expect(source).toContain("{ label: '总净重'")
    expect(source).toContain('const totalMealCount = computed')
    expect(source).not.toContain("{ label: '制作周期'")
    expect(source).not.toContain("{ label: '分装规格'")
    expect(source).not.toContain("{ label: '采购量'")
    expect(source).not.toContain("{ label: '净食材'")
    // 旧的句子式信息块已移除
    expect(templateSource).not.toContain('dog-info-summary')
    expect(templateSource).not.toContain('making-info-summary')
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
  })

  /**
   * 补剂入口文案改为「购买预分装补剂」。
   */
  it('labels the supplement entry as pre-packed supplements', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).toContain('购买预分装补剂')
    expect(templateSource).not.toContain('一键购买补剂')
  })

  /**
   * 底部操作栏：打印 / 保存 / 分享 三个等宽动作，分享按钮重新绘制。
   */
  /**
   * 2026-09-22：底部固定栏收敛为「购买补剂 / 保存 / 分享」。
   * 原来的「打印」+「保存制作单」合并成一个「保存」，由顾客选保存为图片还是存到收藏夹。
   */
  it('renders the bottom bar as buy, save and an icon-only share action', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    // 保存（合并后）与购买补剂同在固定栏
    expect(templateSource).toContain('@tap="handleSaveMenu"')
    expect(templateSource).toContain('@tap="handleBuySupplements"')
    expect(templateSource).toContain('class="action-btn buy"')
    expect(templateSource).toContain('购买预分装补剂')
    expect(templateSource).toContain('class="action-btn secondary"')
    expect(templateSource).not.toContain('生成图片')
    expect(templateSource).not.toContain('保存制作单')
    expect(templateSource).not.toContain('>打印<')

    // 保存入口给出两个选项
    expect(source).toContain('function handleSaveMenu')
    expect(source).toContain("itemList: ['保存为图片', '保存到收藏夹']")
    expect(source).toContain('已保存到我的制作单')

    // 分享：不再用 ShareButton 组件，也没有中文，图标由 CSS 画出
    expect(templateSource).not.toContain('<ShareButton')
    expect(source).not.toContain("import ShareButton from")
    expect(templateSource).toContain('class="action-btn share"')
    expect(templateSource).toContain('open-type="share"')
    expect(templateSource).not.toContain('share-glyph')
    expect(templateSource).toContain('class="share-icon-tray"')
    expect(templateSource).toContain('class="share-icon-shaft"')
    expect(templateSource).toContain('class="share-icon-head"')
    expect(source).toContain('.action-btn.share {')
    expect(source).toContain('.share-icon-tray {')

    // 保存与购买视觉区分
    expect(source).toContain('.action-btn.buy {')
    expect(source).not.toContain('.action-btn.success {')
  })

  it('highlights the purchase button as a solid gold call to action', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const purchaseButtonBlock = source.match(/\.btn-purchase-sm\s*\{[\s\S]*?\}/)?.[0] || ''
    const confirmButtonBlock = source.match(/\.spec-action-btn-primary\s*\{[\s\S]*?\}/)?.[0] || ''

    // 实心金色 + 白字 + 胶囊圆角 + 高度不低于 68rpx
    expect(purchaseButtonBlock).toContain('background: linear-gradient(140deg, #c79a55 0%, #a97c33 100%)')
    expect(purchaseButtonBlock).toContain('color: #fffdf7')
    expect(purchaseButtonBlock).toContain('border-radius: 999rpx')
    expect(purchaseButtonBlock).toContain('font-weight: 700')
    expect(purchaseButtonBlock).toContain('height: 68rpx')
    // 不再是原来的浅色描边
    expect(purchaseButtonBlock).not.toContain('background: #fbfcf7')
    expect(purchaseButtonBlock).not.toContain('border: 2rpx solid #e5e8d4')

    // 确认选择保持墨绿主按钮，两者不同色
    expect(confirmButtonBlock).toContain('background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%)')
    expect(confirmButtonBlock).toContain('color: #f3eddd')
  })

  it('copies configured recommendation purchase links instead of opening product mini programs', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const handlePurchaseStart = source.indexOf('function handlePurchase(')
    const handlePurchaseEnd = source.indexOf('function getRecipeLossRate')
    const handlePurchaseBlock = source.slice(handlePurchaseStart, handlePurchaseEnd)

    expect(source).toContain('v-if="rp.purchaseLink?.url"')
    expect(source).toContain('v-if="currentSpec.purchaseLink?.url"')
    expect(handlePurchaseBlock).toContain('uni.setClipboardData({')
    expect(handlePurchaseBlock).toContain('data: url')
    expect(handlePurchaseBlock).not.toContain('uni.navigateToMiniProgram')
  })

  it('marks pricing previews as DIY sheet usage so procurement source plans do not block sheet generation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain("pricingPurpose: 'DIY_SHEET'")
  })

  it('shows selected product names and actionable replacement hints in food and supplement rows', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('selectedProductDisplayText')
    expect(source).toContain('formatSelectedProductDisplayText(')
    expect(source).toContain('formatRecommendationActionLabel(')
    expect(source).toContain('choiceLabel')
    expect(source).toContain('recommend-badge')
    expect(source).toContain('recommend-badge-replace')
    expect(source).toContain('white-space: nowrap')
    expect(source).toContain('text-decoration: none')
    expect(source).toContain('.recommend-main')
    expect(source.match(/\.recommend-main\s*\{[\s\S]*?\}/)?.[0]).toContain('color: #26261f')
    expect(source).not.toContain('recommend-link')
    expect(source).not.toContain('brand-link')
    expect(source).toMatch(/class="recommend-badge"[\s\S]{0,180}@tap\.stop="showSpecModal\(item\)"/)
    expect(source).toContain('#f6efe0')
    expect(source).toContain('#8a6b33')
    expect(source).not.toContain('getRecommendationEntryDisplayText(hasSpecDetail)')
    expect(source).not.toContain('点击查看')
    expect(source).not.toContain('function getFoodRecommendationDisplayText')
    expect(source).not.toContain('function getSupplementSpecDisplayText')
  })

  it('does not fall back to standard ingredient fields for food selected products', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const foodBlock = source.match(/const foodItemsDetailed = computed\(\(\) => \{[\s\S]*?\n\}\)\n\n\/\/ 补剂类详细数据/)?.[0] || ''

    expect(foodBlock).toContain('formatFoodSelectedProductDisplayText(selectedRp, item)')
    expect(foodBlock).not.toContain('formatSelectedProductDisplayText(selectedRp || item, item.name)')
    expect(foodBlock).toContain('const purchaseLink = selectedRp?.purchaseLink || undefined')
    expect(foodBlock).toContain('productModel: selectedRp?.productModel')
    expect(foodBlock).toContain('purchaseChannel: selectedRp?.purchaseChannel')
    expect(source).toContain('const selectedProductDisplayText = formatSelectedProductDisplayText(selectedRp || item, item.name)')
  })

  it('passes food recommended product images into the single-product detail modal', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const foodBlock = source.match(/const foodItemsDetailed = computed\(\(\) => \{[\s\S]*?\n\}\)\n\n\/\/ 补剂类详细数据/)?.[0] || ''

    expect(foodBlock).toContain('imageUrl: selectedRp?.imageUrl')
  })

  it('keeps life-stage warning visible on the generated DIY sheet', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('生命阶段提醒')
    expect(source).toContain('{{ lifeStageReminderText }}')
    expect(source).toContain('../../utils/life-stage-match')
    // 2026-09-19：结论由后端给出，制作单不再自己算
    expect(source).toContain('fetchLifeStageMatch')
    expect(source).toContain('isLifeStageMismatch')
    expect(source).not.toContain('resolveDogRecipeLifeStage(')
    expect(source).not.toContain('isRecipeLifeStageMatch(')
    // 拿不到后端结论时不得静默放行
    expect(source).toContain('lifeStageCheckFailed')
    // 制作单是结果页：提醒只作展示，不再要求确认（避免同一个提醒反复打断）
    expect(source).not.toContain('dismissWarning')
    expect(source).not.toContain('我已知晓')
  })

  it('uses net food weight for supplement nutrient totals and current storage copy', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('supplementNutrientBaseWeightG.value')
    // 储存文案：三张建议大卡已删，压缩成图片上的一行
    expect(source).toContain('0-4℃ 冷藏保存 3 天')
    expect(source).not.toContain('0-5℃')
  })

  it('falls back to recipe food items when pricing preview cannot provide ingredient details', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain("import {\n  buildFallbackFoodIngredientItems,")
    expect(source).toContain('collectFoodIngredientIdsForRecommendations(')
    expect(source).toContain('const packagePlanTotal = computed(() => getPackagePlanTotal(packagePlan.value))')
    expect(source).toContain('const totalFoodNetWeightG = computed(() => packagePlanTotal.value.totalGrams || dailyIntakeG.value * cycleDays.value)')
    expect(source).toContain('const foodSourceItems = computed(() => {')
    expect(source).toContain('return buildFallbackFoodIngredientItems(recipe.value.items || [], totalFoodNetWeightG.value)')
    expect(source).toContain('...foodSourceItems.value.map((item: any) => buildPurchaseListItem(item))')
    expect(source).toContain('return foodSourceItems.value')
  })

  it('carries recipe nutrition state labels into food rows and print rows', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('formatNutritionStateForDisplay')
    expect(source).toContain('nutritionStateLabel: formatNutritionStateForDisplay(item)')
    expect(source).toContain('item.preparationMethod || item.nutritionStateLabel || \'-\'')
    expect(source).toContain('item.nutritionStateLabel ? `${item.ingredientName}（${item.nutritionStateLabel}）` : item.ingredientName')
  })

  it('keeps diy sheets free of customer-facing price preview warnings', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain('pricePreview.value = null')
    expect(source).toContain("pricingPurpose: 'DIY_SHEET'")
    expect(source).not.toContain('getDiySheetPricePreviewWarning')
    expect(source).not.toContain('pricePreviewWarning')
    expect(templateSource).not.toContain('价格预览')
    expect(templateSource).not.toContain('preview-warning-summary')
  })

  it('syncs custom package plans into the diy sheet page, share path, and saved image', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain("import { getPackagePlanTotal, type PackagePlanItem } from '../../utils/order-package-plan'")
    expect(source).toContain('const packagePlan = ref<PackagePlanItem[]>([])')
    expect(source).toContain('function parsePackagePlanParam')
    expect(source).toContain('packagePlan.value = parsePackagePlanParam(options.packagePlan)')
    expect(source).toContain('function buildLegacyPackagePlan')
    expect(source).toContain('const packagePlanSummaryText = computed')
    expect(source).toContain('const packagePlanSubText = computed')
    expect(source).toContain('packagePlan: packagePlan.value')
    // 分装大卡已从图片移除，改为「制作信息」里的字段
    expect(source).not.toContain('packagePlan: packagePlanSummaryText.value')
    expect(source).not.toContain('packageSub: packagePlanSubText.value')
    expect(source).toContain('...dogPurchaseFacts.value,')
    expect(source).toContain('...makingPurchaseFacts.value')
    expect(source).toContain('{ columns: 6 }')
    expect(source).toContain('packagePlan=${encodeURIComponent(JSON.stringify(packagePlan.value))}')
    // 分装信息不再以长文案呈现，也不在制作信息里重复
    expect(templateSource).not.toContain('packagePlanSubText')
    expect(templateSource).not.toContain('分装：{{ packagePlanSummaryText }}')
    // 总袋数不展示
    expect(templateSource).not.toContain('共 ')
  })

  it('saves the package plan with the persisted DIY sheet payload', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const autoSaveSource = source.match(
      /async function autoSaveDiySheet\(\)[\s\S]*?\n}\n\nasync function loadRecipe/,
    )?.[0] || ''
    const manualSaveSource = source.match(
      /async function handleSave\(\)[\s\S]*?\n}\n\n\/\/ 分享配置/,
    )?.[0] || ''

    expect(autoSaveSource).toContain('packagePlan: packagePlan.value')
    expect(manualSaveSource).toContain('packagePlan: packagePlan.value')
  })

  /**
   * 2026-09-22：设计来源（内部系统名）在页面和制作单图片上都不再出现。
   */
  it('removes the internal design source from both the page and the saved image', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('设计来源')
    expect(templateSource).not.toContain('{{ recipe.designSource }}')
    expect(source).not.toContain('displayRecipeFormulaSoftwareLabel')
    expect(source).not.toContain('formulaSource')
    expect(source).not.toContain('formatRecipeFormulaSoftwareLabel')
  })

  it('renders the saved diy sheet image as a cooking-first share card', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const canvasSource = readFileSync(
      resolve(process.cwd(), 'src/utils/print-canvas.ts'),
      'utf-8',
    )

    expect(source).toContain('builder.drawBrandHeader({')
    expect(source).toContain("brand: '赛文的食堂'")
    expect(source).not.toContain("brand: 'seven 的厨房'")
    expect(source).toContain("logoPath: '/static/logo.png'")
    // 图片上不再有卖点与营养标准 Banner（页面保留）
    expect(source).not.toContain('drawSellingPoint')
    expect(source).not.toContain('drawStandardBanner')
    expect(canvasSource).not.toContain('drawSellingPoint')
    expect(canvasSource).not.toContain('drawStandardBanner')
    expect(source).not.toContain('drawShareSummaryCards')
    // 适用阶段标签不再进图片
    expect(source).not.toContain('stages: recipe.value.applicableLifeStages')
    expect(source).toContain("['原料名称', '已选商品', getFoodPrepAmountHeaderForPrint(), '制备方法']")
    expect(source).toContain('`${item.netAmountStr} / ${item.actualAmountStr}`')
    expect(source).toContain('item.recommendedPrintText')
    // 目标补充量 排在 添加总量 之前
    expect(source).toContain("['补剂名称', '已选商品 / 规格', '目标补充量', '添加总量']")
    expect(source).not.toContain("['补剂名称', '已选商品 / 规格', '添加总量', '目标补充量']")
    expect(source).toContain('builder.drawSupplementNotice(')
    expect(source).toContain('营养补充剂的添加总量与已选商品严格匹配')
    expect(source).not.toContain('drawImportantTipsSection')
    expect(source).toContain("builder.drawSectionTitle('储存提示')")
    expect(source).not.toContain("['原料名称', DIY_SHEET_FOOD_RECOMMENDATION_LABEL, '制备方法', '采购量']")
    expect(source).not.toContain("['原料名称', '备料量', '制备方法', DIY_SHEET_FOOD_RECOMMENDATION_LABEL]")
    expect(source).not.toContain('builder.drawTags(tags)')
    expect(source).not.toContain('builder.drawInfoCard([')

    expect(canvasSource).toContain('drawBrandHeader(options:')
    expect(canvasSource).toContain('private drawAvatarFallbackLogo(')
    expect(canvasSource).toContain('private drawSchnauzerAvatarPlaceholder(')
    expect(canvasSource).toContain('this.drawAvatarFallbackLogo(options.logoPath, avatarX, avatarY, avatarSize)')
    expect(canvasSource).toContain('品牌logo头像占位')
    expect(canvasSource).toContain("console.warn('[PrintCanvas] 绘制狗狗头像失败，使用品牌logo占位:', error)")
    expect(canvasSource).not.toContain('this.drawSchnauzerAvatarPlaceholder(avatarX, avatarY, avatarSize)')
    expect(canvasSource).not.toContain('使用占位头像')
    // 品牌徽标：白底胶囊 + 墨绿字，logo 才能看得清
    expect(canvasSource).toContain('const logoSize = 42')
    expect(canvasSource).toContain('const brandGap = 10')
    expect(canvasSource).toContain('const badgeHeight = 58')
    expect(canvasSource).toContain('const badgePadX = 18')
    expect(canvasSource).toContain("this.ctx.setFillStyle('rgba(255,255,255,0.95)')")
    expect(canvasSource).toContain("this.ctx.setFillStyle('#1e3a2f')")
    expect(canvasSource).toContain('头像徽章')
    expect(canvasSource).toContain('简化毛发')
    expect(canvasSource).toContain('微笑嘴巴')
    expect(canvasSource).not.toContain('眉毛')
    expect(canvasSource).not.toContain('胡须层次')
    expect(canvasSource).toContain('this.ctx.drawImage(')
    expect(canvasSource).toContain('options.logoPath,')
    expect(canvasSource).toContain('const brandCenterX = this.canvasWidth / 2')
    // 新版构建方法
    expect(canvasSource).toContain('drawFactCards(')
    expect(canvasSource).toContain('drawNote(text: string)')
    expect(canvasSource).toContain('autoHeight?: boolean')
    expect(canvasSource).toContain('drawSupplementNotice(text: string)')
    // 旧版大卡已下线
    expect(canvasSource).not.toContain('drawShareSummaryCards')
    expect(canvasSource).not.toContain('drawImportantTipsSection')
    expect(canvasSource).not.toContain('drawInfoCard')
    expect(canvasSource).not.toContain('drawTipsCards')
    // 配色换成品牌色
    expect(canvasSource).toContain('BORDER: \'#e5e8d4\'')
    expect(canvasSource).not.toContain('#1890ff')
  })

  it('uses the configured DIY sheet header background image when generating the saved image', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const canvasSource = readFileSync(
      resolve(process.cwd(), 'src/utils/print-canvas.ts'),
      'utf-8',
    )

    expect(source).toContain("const diySheetHeaderBgImageUrl = ref('')")
    expect(source).toContain('res.data.diySheetHeaderBgImageUrl')
    expect(source).toContain('resolveCanvasImageInfo(diySheetHeaderBgImageUrl.value)')
    expect(source).toContain('backgroundImage: headerBackground')

    expect(canvasSource).toContain('backgroundImage?: CanvasImageInfo')
    expect(canvasSource).toContain('private drawBrandHeaderBackground(')
    expect(canvasSource).toContain('this.drawCoverImage(options.backgroundImage')
    // 头部压暗层用品牌墨绿；没有底图时不叠加（底色本身就是品牌渐变）
    expect(canvasSource).toContain('if (!usedImage) {')
    expect(canvasSource).toContain("[0, 'rgba(23, 48, 38, 0.16)']")
    expect(canvasSource).toContain("[1, 'rgba(20, 40, 32, 0.74)']")
    expect(canvasSource).toContain('overlayStops.forEach')
    // 旧的蓝紫压暗层（会把品牌绿完全盖住）不能回来
    expect(canvasSource).not.toContain('26, 135, 219')
    expect(canvasSource).not.toContain('50, 75, 173')
    expect(canvasSource).not.toContain('88, 55, 151')
    // 海报式头部：品牌徽标缩小成顶部胶囊，主标题是整张图最大的一行
    expect(canvasSource).toContain('const logoSize = 42')
    expect(canvasSource).toContain('const headerHeight = 384')
    // 纵向按固定栅格排：头像行 / 标题 / 卖点 / 金线互不重叠
    expect(canvasSource).toContain('const avatarY = 150')
    expect(canvasSource).toContain('this.ctx.fillText(options.title, avatarX, 296)')
    expect(canvasSource).toContain('this.ctx.fillRect(avatarX, 356, 110, 5)')
    expect(canvasSource).toContain('this.FONT_SIZES.TITLE + 10')
    // 一句话卖点回到头部（金色小字，限一行）
    expect(canvasSource).toContain('sellingPoint?: string')
    expect(canvasSource).toContain('if (options.sellingPoint)')
    expect(canvasSource).toContain("this.ctx.setFillStyle('#e6d3a8')")
    expect(source).toContain('sellingPoint: recipe.value.sellingPoint')
    // 头部大图优先用食谱封面照片
    expect(source).toContain('const coverUrl = recipe.value.coverImageUrl')
    expect(source).toContain('resolveCanvasImageInfo(coverUrl)')
    expect(canvasSource).toContain('private roundRect(')
    expect(canvasSource).not.toContain('const logoSize = 58')
  })

  /**
   * 2026-09-22：损耗率继续算，但**不给顾客看这个词**。
   * 页面上这一列统一叫「建议采购量」（已含缩水余量），纸质制作单同口径。
   */
  it('presents the loss-inclusive amount as a suggested purchase amount', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const canvasSource = readFileSync(
      resolve(process.cwd(), 'src/utils/print-canvas.ts'),
      'utf-8',
    )

    // 页面与纸质单都不出现「损耗率 / 备料量（含 X% 损耗）」
    expect(templateSource).not.toContain('损耗率')
    expect(templateSource).not.toContain('制作损耗率')
    expect(source).not.toContain('备料量（含')
    expect(source).not.toContain('formatRecipeLossRatePercent()')

    // 统一叫「建议采购量」
    expect(templateSource).toContain('建议采购量')
    expect(source).toContain("return '净重/建议采购量'")
    // 一列两个数：净重 / 建议采购量
    expect(source).toContain('netAmountStr')
    expect(source).toContain('`${item.netAmountStr} / ${item.actualAmountStr}`')
    expect(source).toContain('function formatNetAmount')
    expect(source).toContain('getFoodPrepAmountHeaderForPrint()')
    expect(templateSource).toContain('建议采购合计')
    expect(templateSource).toContain('建议采购量已计算制作损耗')

    // 取整到「好买的量」
    expect(source).toContain('function formatPurchaseAmount')
    expect(source).toContain('return `${Math.ceil(amount / 5) * 5}g`')
    expect(source).toContain('function formatFoodPrepAmountForPrint')
    expect(source).toContain('return formatPurchaseAmount(amount)')

    // 图片上的建议卡已下线，储存提示改成一行文字
    expect(canvasSource).not.toContain('const sectionHeight = 176')
    expect(canvasSource).not.toContain('const tipMaxLines')
    expect(source).toContain('builder.drawSectionTitle(\'储存提示\')')
    expect(canvasSource).not.toContain("tip.content.join('；')")
    expect(canvasSource).not.toContain('tipMaxLines[index] || 2')
  })
})

/**
 * 自定义分装下的「真实覆盖天数」（2026-09-24）
 *
 * 背景：启用自定义分装后，食物总量由**包规**决定（recipe-diy 页也提示
 * 「上方天数选择暂不生效」）。若补剂下单页仍拿用户选的天数，
 * 会显示错误的天量，服务端「总天数 ≤ 效期安全线」的校验也会跟着算错。
 */
describe('制作单：自定义分装下的真实覆盖天数', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
    'utf-8',
  )

  it('按「总袋数 ÷ 每天餐数」反推覆盖天数（一餐一袋）', () => {
    expect(source).toContain('effectiveCycleDays')
    expect(source).toContain('packagePlanTotal.value.totalPackages')
    expect(source).toMatch(/bags \/ meals/)
  })

  it('⚠️ 不能退回「总重 ÷ 每日摄入」—— 那会隐含用户按配方每餐克数喂', () => {
    // 实测：30袋×100g、配方建议140g/餐 → 总重口径算 11 天，用户实际吃 15 天。
    // 补剂配的是整批食物，食物吃多久补剂就吃多久，所以必须按袋数算。
    const days = source.slice(
      source.indexOf('const effectiveCycleDays'),
      source.indexOf('const effectiveCycleDays') + 900,
    )
    expect(days).toContain('totalPackages')
  })

  it('交给补剂下单页的是真实天数，不是用户选的 cycleDays', () => {
    expect(source).toMatch(/cycleDays:\s*effectiveCycleDays\.value/)
  })

  it('每日摄入缺失时退回用户选的天数，不会算出 0 天', () => {
    expect(source).toMatch(/intake <= 0[\s\S]{0,40}return cycleDays\.value/)
  })
})

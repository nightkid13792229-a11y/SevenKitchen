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
    expect(source).toContain(':height="PRINT_CANVAS_OUTPUT_HEIGHT"')
    expect(source).toContain(':style="printCanvasStyle"')
    expect(source).toContain('const printCanvasStyle = computed(() => ({')
    expect(source).toContain('width: `${PRINT_CANVAS_OUTPUT_WIDTH}px`')
    expect(source).toContain('height: `${PRINT_CANVAS_OUTPUT_HEIGHT}px`')
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

  it('keeps purchase buttons visually secondary to the confirm selection action', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const purchaseButtonBlock = source.match(/\.btn-purchase-sm\s*\{[\s\S]*?\}/)?.[0] || ''
    const confirmButtonBlock = source.match(/\.spec-action-btn-primary\s*\{[\s\S]*?\}/)?.[0] || ''

    expect(purchaseButtonBlock).toContain('background: #fff')
    expect(purchaseButtonBlock).toContain('color: #6f4fc8')
    expect(purchaseButtonBlock).toContain('border: 2rpx solid #d8cff7')
    expect(purchaseButtonBlock).not.toContain('linear-gradient')
    expect(confirmButtonBlock).toContain('background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)')
    expect(confirmButtonBlock).toContain('color: #fff')
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
    expect(source.match(/\.recommend-main\s*\{[\s\S]*?\}/)?.[0]).toContain('color: #333')
    expect(source).not.toContain('recommend-link')
    expect(source).not.toContain('brand-link')
    expect(source).toMatch(/class="recommend-badge"[\s\S]{0,180}@tap\.stop="showSpecModal\(item\)"/)
    expect(source).toContain('#fff7e6')
    expect(source).toContain('#d46b08')
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
    expect(source).toContain('resolveDogRecipeLifeStage')
    expect(source).toContain('selectedDogRecipeLifeStage')
    expect(source).toContain('isRecipeLifeStageMatch(')
  })

  it('uses net food weight for supplement nutrient totals and current storage copy', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('supplementNutrientBaseWeightG.value')
    expect(source).toContain('0-4℃冷藏保存3天')
    expect(source).not.toContain('0-5℃冷藏保存3天')
  })

  it('falls back to recipe food items when pricing preview cannot provide ingredient details', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain("import {\n  buildFallbackFoodIngredientItems,")
    expect(source).toContain('collectFoodIngredientIdsForRecommendations(')
    expect(source).toContain('const totalFoodNetWeightG = computed(() => dailyIntakeG.value * cycleDays.value)')
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

  it('keeps the diy sheet readable by showing a warning when supplement pricing preview fails', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const pricePreviewWarning = ref(\'\')')
    expect(source).toContain('pricePreviewWarning.value = \'\'')
    expect(source).toContain('pricePreview.value = null')
    expect(source).toContain('pricePreviewWarning.value = getDiySheetPricePreviewWarning(error)')
    expect(source).toContain('<view v-if="pricePreviewWarning" class="preview-warning-summary">')
    expect(source).toContain('{{ pricePreviewWarning }}')
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
    expect(source).toContain("brand: 'Seven的厨房'")
    expect(source).not.toContain("brand: 'seven 的厨房'")
    expect(source).toContain("logoPath: '/static/logo.png'")
    expect(source).toContain('builder.drawShareSummaryCards({')
    expect(source).toContain("formulaStandard: getNutritionStandardLabel(recipe.value.nutritionStandard)")
    expect(source).toContain('formulaSource: recipe.value.designSource')
    expect(source).toContain("['原料名称', '已选商品', getFoodPrepAmountHeaderForPrint(), '制备方法']")
    expect(source).toContain("formatFoodPrepAmountForPrint(item.actualAmount)")
    expect(source).toContain('item.recommendedPrintText')
    expect(source).toContain("['补剂名称', '已选商品 / 规格', '添加总量', '目标补充量']")
    expect(source).toContain('builder.drawSupplementNotice(')
    expect(source).toContain('营养补充剂的添加总量与已选商品严格匹配')
    expect(source).toContain('builder.drawImportantTipsSection([')
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
    expect(canvasSource).toContain('const logoSize = 58')
    expect(canvasSource).toContain('const brandGap = 8')
    expect(canvasSource).toContain('const brandBadgeHeight = 66')
    expect(canvasSource).toContain('const brandBadgePaddingX = 16')
    expect(canvasSource).toContain("this.ctx.setFillStyle('rgba(255,255,255,0.66)')")
    expect(canvasSource).toContain("this.ctx.setFillStyle('#2f3337')")
    expect(canvasSource).toContain('头像徽章')
    expect(canvasSource).toContain('简化毛发')
    expect(canvasSource).toContain('微笑嘴巴')
    expect(canvasSource).not.toContain('眉毛')
    expect(canvasSource).not.toContain('胡须层次')
    expect(canvasSource).toContain('this.ctx.drawImage(options.logoPath')
    expect(canvasSource).toContain('const brandCenterX = this.canvasWidth / 2')
    expect(canvasSource).toContain('drawShareSummaryCards(options:')
    expect(canvasSource).toContain('formulaStandard: string')
    expect(canvasSource).toContain('formulaSource?: string')
    expect(canvasSource).toContain('drawSupplementNotice(text: string)')
    expect(canvasSource).toContain('drawImportantTipsSection(tips:')
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
    expect(canvasSource).toContain('const overlayStops = usedImage')
    expect(canvasSource).toContain("[0, 'rgba(26, 135, 219, 0.14)']")
    expect(canvasSource).toContain("[0.5, 'rgba(50, 75, 173, 0.10)']")
    expect(canvasSource).toContain("[1, 'rgba(88, 55, 151, 0.16)']")
    expect(canvasSource).toContain("[0, 'rgba(26, 135, 219, 0.52)']")
    expect(canvasSource).toContain('overlayStops.forEach')
    expect(canvasSource).toContain('const logoSize = 58')
    expect(canvasSource).not.toContain('const logoSize = 68')
    expect(canvasSource).not.toContain('const logoSize = 56')
  })

  it('keeps prep loss and storage guidance readable on the saved diy sheet image', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )
    const canvasSource = readFileSync(
      resolve(process.cwd(), 'src/utils/print-canvas.ts'),
      'utf-8',
    )

    expect(source).toContain('getFoodPrepAmountHeaderForPrint()')
    expect(source).toContain('formatRecipeLossRatePercent()')
    expect(source).toContain('备料量（含${formatRecipeLossRatePercent()}损耗）')
    expect(source).toContain('return `${amount.toFixed(1)}g`')
    expect(source).not.toContain('return `${amount.toFixed(1)}g（含损耗）`')

    expect(canvasSource).toContain('const sectionHeight = 176')
    expect(canvasSource).toContain('const cardHeight = 116')
    expect(canvasSource).toContain('const cardY = this.currentY + 50')
    expect(canvasSource).toContain('const tipContentY = cardY + 44')
    expect(canvasSource).toContain('const tipLineHeight = 15')
    expect(canvasSource).toContain('const tipMaxLines = [2, 2, 3]')
    expect(canvasSource).toContain("tip.content.join('\\n')")
    expect(canvasSource).not.toContain("tip.content.join('；')")
    expect(canvasSource).toContain('tipMaxLines[index] || 2')
  })
})

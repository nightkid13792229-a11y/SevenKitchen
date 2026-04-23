import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('diy sheet layout regressions', () => {
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

  it('keeps life-stage warning visible on the generated DIY sheet', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain('生命阶段提醒')
    expect(source).toContain('{{ lifeStageReminderText }}')
    expect(source).toContain('../../utils/life-stage-match')
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
    expect(source).toContain("brand: 'seven 的厨房'")
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
    expect(canvasSource).toContain('private drawSchnauzerAvatarPlaceholder(')
    expect(canvasSource).toContain('左耳')
    expect(canvasSource).toContain('胡须')
    expect(canvasSource).toContain('this.ctx.drawImage(options.logoPath')
    expect(canvasSource).toContain('const brandCenterX = this.canvasWidth / 2')
    expect(canvasSource).toContain('drawShareSummaryCards(options:')
    expect(canvasSource).toContain('formulaStandard: string')
    expect(canvasSource).toContain('formulaSource?: string')
    expect(canvasSource).toContain('drawSupplementNotice(text: string)')
    expect(canvasSource).toContain('drawImportantTipsSection(tips:')
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
    expect(canvasSource).toContain('const cardHeight = 104')
    expect(canvasSource).toContain('const tipMaxLines = [2, 2, 3]')
    expect(canvasSource).toContain('tipMaxLines[index] || 2')
  })
})

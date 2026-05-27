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

  it('uses the product ordering copy on the bottom action button', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('自己做')
    expect(source).toContain('订购成品')
    expect(source).not.toContain('我要自己做')
    expect(source).not.toContain('>成品<')
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
})

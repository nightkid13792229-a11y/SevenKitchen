import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('recipe detail nutrition report regressions', () => {
  it('only renders the nutrition report entry when a report URL exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('nutritionReportUrl?: string')
    expect(source).toContain('v-if="recipe.nutritionReportUrl"')
    expect(source).toContain('@tap="openNutritionReport"')
  })

  it('downloads and opens uploaded PDF reports through the miniapp document viewer', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('function openNutritionReport()')
    expect(source).toContain('uni.downloadFile')
    expect(source).toContain('recipe.value.nutritionReportUrl')
    expect(source).toContain('uni.openDocument')
    expect(source).toContain("fileType: 'pdf'")
    expect(source).toContain("title: '报告打开失败'")
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

  it('uses customer-facing labels for nutrition sections', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('核心营养成分')
    expect(source).toContain('详细营养报告')
    expect(source).not.toContain('<text class="card-title">营养成分分析</text>')
    expect(source).not.toContain('<text class="report-title">营养报告</text>')
  })
})

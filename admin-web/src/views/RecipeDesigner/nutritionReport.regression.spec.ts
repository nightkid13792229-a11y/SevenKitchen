import { describe, expect, it } from 'vitest'
import reportDrawerSource from '@/views/RecipeDesigner/components/NutritionReportDrawer.vue?raw'
import readinessDrawerSource from '@/views/RecipeDesigner/components/LaunchReadinessDrawer.vue?raw'
import helperSource from '@/utils/recipeDesigner/nutritionReport.ts?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typesSource from '@/types/recipeDesigner.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('营养报告 · 类型与 API 契约', () => {
  it('上线检查概要新增 reportGenerated / reportStale', () => {
    expect(typesSource).toContain('reportGenerated: boolean')
    expect(typesSource).toContain('reportStale: boolean')
    expect(typesSource).toContain('reportAvailable: boolean')
  })

  it('定义持久化营养报告信封与发布口径报告结构', () => {
    for (const field of [
      'export interface DraftNutritionReportEnvelope',
      'export interface DraftNutritionReport {',
      'export interface DraftNutritionReportIngredientRow',
      'export interface DraftNutritionReportMacroRow',
      'export interface DraftNutritionReportEnergyDensityRow',
      'export interface DraftNutritionReportNutrientSection',
      'draftId: string',
      'generatedAt: string | null',
      'revision: number | null',
      'stale: boolean',
      'report: DraftNutritionReport | null',
      'ingredientRows: DraftNutritionReportIngredientRow[]',
      'macroRows: DraftNutritionReportMacroRow[]',
      'energyDensityRows: DraftNutritionReportEnergyDensityRow[]',
      'nutrientSections: Record<string, DraftNutritionReportNutrientSection>'
    ]) {
      expect(typesSource).toContain(field)
    }
  })

  it('API 提供 GET / POST 两个方法，使用同一路径', () => {
    expect(apiSource).toContain(
      'getDraftNutritionReport: (draftId: string): Promise<DraftNutritionReportEnvelope>'
    )
    expect(apiSource).toContain(
      'generateDraftNutritionReport: (draftId: string): Promise<DraftNutritionReportEnvelope>'
    )
    expect(apiSource).toContain(
      'api.get(`/recipe-designer/drafts/${draftId}/nutrition-report`)'
    )
    expect(apiSource).toContain(
      'api.post(`/recipe-designer/drafts/${draftId}/nutrition-report`)'
    )
  })
})

describe('营养报告抽屉', () => {
  const drawer = clean(reportDrawerSource)

  it('展示生成时间，过期时给出明确警告', () => {
    expect(drawer).toContain('formatDateTime(props.snapshot?.generatedAt)')
    expect(drawer).toContain('v-if="showMeta"')
    expect(drawer).toContain('生成时间')
    expect(drawer).toContain('v-if="isStale"')
    expect(drawer).toContain('报告已过期')
    expect(drawer).toContain('重新生成')
  })

  it('渲染原料 / 宏量 / 能量密度 / 营养素分区四块', () => {
    expect(drawer).toContain('v-for="row in ingredientRows"')
    expect(drawer).toContain('row.ingredientName')
    expect(drawer).toContain('row.amountLabel')
    expect(drawer).toContain('row.weightPercentLabel')

    expect(drawer).toContain('v-for="row in macroRows"')
    expect(drawer).toContain('row.dryMatterLabel')
    expect(drawer).toContain('row.energyPercentLabel')

    expect(drawer).toContain('v-for="row in energyDensityRows"')
    expect(drawer).toContain(
      'orderEnergyDensityRows(report.value?.energyDensityRows ?? [])'
    )

    expect(drawer).toContain('v-for="section in nutrientSections"')
    expect(drawer).toContain('section.dryMatterHeader')
    expect(drawer).toContain('v-for="row in section.rows"')
    expect(drawer).toContain('nutrientRowStatusClass(row.status)')
  })

  it('加载 / 错误 / 空报告都有可交互状态，且不跳转路由', () => {
    expect(drawer).toContain('props.loading')
    expect(drawer).toContain('el-skeleton')
    expect(drawer).toContain('props.error')
    expect(drawer).toContain("emit('retry')")
    expect(drawer).toContain('还没有生成营养报告')

    expect(drawer).not.toContain('useRouter')
    expect(drawer).not.toContain('router.push')
    expect(drawer).toContain('v-model="visible"')
  })
})

describe('上线检查 · 营养报告动作', () => {
  const readiness = clean(readinessDrawerSource)
  const helper = clean(helperSource)

  it('报告行用三种动作替代纯文本值', () => {
    expect(readiness).toContain('v-if="row.key === \'reportAvailable\'"')
    expect(readiness).toContain('@click="openNutritionReport"')
    expect(readiness).toContain(
      'resolveNutritionReportAction(readiness.value.summary)'
    )

    expect(helper).toContain("label: '生成营养报告'")
    expect(helper).toContain("label: '查看营养报告'")
    expect(helper).toContain("label: '报告已过期，重新生成'")
  })

  it('查看走 GET、生成走 POST，生成后刷新上线检查', () => {
    const fnIndex = readiness.indexOf('async function openNutritionReport()')
    expect(fnIndex).toBeGreaterThan(-1)
    const fnEnd = readiness.indexOf('\n}\n', fnIndex)
    expect(fnEnd).toBeGreaterThan(fnIndex)
    const block = readiness.slice(fnIndex, fnEnd)

    expect(block).toContain('recipeDesignerApi.getDraftNutritionReport(props.draftId)')
    expect(block).toContain(
      'recipeDesignerApi.generateDraftNutritionReport(props.draftId)'
    )
    expect(block).toContain('reportDrawerVisible.value = true')
    expect(block).toContain('await loadReadiness()')
    expect(block.indexOf('generateDraftNutritionReport')).toBeLessThan(
      block.indexOf('await loadReadiness()')
    )
  })

  it('挂载营养报告抽屉并支持加载失败重试', () => {
    expect(readiness).toContain(
      "import NutritionReportDrawer from './NutritionReportDrawer.vue'"
    )
    expect(readiness).toContain('v-model="reportDrawerVisible"')
    expect(readiness).toContain(':snapshot="reportSnapshot"')
    expect(readiness).toContain(':loading="reportLoading"')
    expect(readiness).toContain(':error="reportError"')
    expect(readiness).toContain('@retry="retryNutritionReport"')
    expect(readiness).toContain('async function retryNutritionReport()')
  })

  it('已通过清单仍在阻断项上方，不回归', () => {
    const passedIndex = readiness.indexOf('已通过')
    const blockerIndex = readiness.indexOf('阻断项')
    expect(passedIndex).toBeGreaterThan(-1)
    expect(blockerIndex).toBeGreaterThan(-1)
    expect(passedIndex).toBeLessThan(blockerIndex)
  })
})

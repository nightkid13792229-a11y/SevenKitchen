import { describe, expect, it } from 'vitest'
import macroSource from '@/views/RecipeDesigner/components/MacroCompositionPanel.vue?raw'
import assessmentSource from '@/views/RecipeDesigner/components/AssessmentPanel.vue?raw'
import typeSource from '@/utils/recipeDesigner/assessmentTypes.ts?raw'

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('宏量营养 · 可溶性 / 不可溶性纤维（2026-10-22）', () => {
  it('类型与宏量构成表都包含两个纤维细分', () => {
    const types = stripComments(typeSource)
    expect(types).toContain("| 'solubleFiber'")
    expect(types).toContain("| 'insolubleFiber'")

    const macro = stripComments(macroSource)
    expect(macro).toContain("key: 'solubleFiber'")
    expect(macro).toContain("name: '可溶性纤维'")
    expect(macro).toContain("key: 'insolubleFiber'")
    expect(macro).toContain("name: '不可溶性纤维'")
  })

  it('营养评估的宏量营养组直接渲染后端返回的纤维细分行', () => {
    const assessment = stripComments(assessmentSource)
    expect(assessment).toContain('v-for="row in group.rows"')
    expect(assessment).toContain('openDetail(row)')
    expect(assessment).toContain('contributors')
    expect(assessment).not.toContain('fiberBreakdown')
  })
})

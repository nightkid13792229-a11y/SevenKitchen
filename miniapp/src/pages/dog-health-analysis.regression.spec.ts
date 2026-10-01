import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * AI 健康分析与建议（2026-10-01，第七期）。
 *
 * 老板第 19–21 条：
 *   19. 健康分析与建议，选项都要涵盖 → 七项产出
 *   20. 边界把严一点，不做诊断只做初步分析
 *   21. 给顾客和营养师看；给顾客看的要有免责声明
 */
describe('健康分析 · 页面', () => {
  function readPage() {
    return readFileSync(
      resolve(process.cwd(), 'src/pages/dog-health/analysis.vue'),
      'utf-8',
    )
  }

  it('第 21 条：免责声明写死在界面里，不来自接口', () => {
    const page = readPage()

    expect(page).toContain('不构成诊断')
    expect(page).toContain('如有异常请咨询执业兽医')
    // 关键：这句话不能是接口返回的字段
    expect(page).not.toContain('data.disclaimer')
    expect(page).not.toContain('res.data.note')
  })

  it('每一项都露出"依据"，结论能倒查到条目', () => {
    const page = readPage()

    expect(page).toContain('item.citations')
    expect(page).toContain('依据')
  })

  it('记录不足时明说，而不是编一段话', () => {
    const page = readPage()

    expect(page).toContain('insufficientCount')
    expect(page).toContain('项因记录不足未给结论')
  })

  it('未开放时如实说明原因', () => {
    const page = readPage()

    expect(page).toContain('available === false')
    expect(page).toContain('健康分析待开放')
  })

  it('不出现任何诊断性措辞', () => {
    const page = readPage()

    expect(page).not.toContain('确诊')
    expect(page).not.toContain('你的狗得了')
    // 措辞统一引导到兽医
    expect(page).toContain('请咨询执业兽医')
  })
})

describe('健康分析 · 接线', () => {
  it('注册在 pages/dog-health 分包里', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'),
    )
    const subPackage = config.subPackages.find(
      (item: { root: string }) => item.root === 'pages/dog-health',
    )

    expect(subPackage.pages.map((page: { path: string }) => page.path)).toContain('analysis')
    const mainPages = config.pages.map((page: { path: string }) => page.path)
    expect(mainPages).not.toContain('pages/dog-health/analysis')
  })

  it('入口在健康管理页的快捷入口里', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('goHealthAnalysis')
    expect(page).toContain('健康分析')
  })

  it('API 层把七项与出处都暴露出来', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('/dogs/${dogId}/health-analysis?audience=')
    expect(api).toContain('suppressErrorToast: true')
  })
})

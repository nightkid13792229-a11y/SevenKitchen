import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ai recipe designer page', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/ai-recipe-designer/index.vue'), 'utf-8')
  const workbenchSource = readFileSync(resolve(process.cwd(), 'src/pages/staff-workbench/index.vue'), 'utf-8')
  const pagesConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'))

  it('starts from dog selection and does not ask for task type first', () => {
    expect(source).toContain('选择狗狗')
    expect(source).toContain('资料完整度检查')
    expect(source).not.toContain('选择任务类型')
    expect(source).not.toContain('严格达标模式')
  })

  it('shows the four result statuses from the design spec', () => {
    expect(source).toContain('可审核发布')
    expect(source).toContain('需人工审核')
    expect(source).toContain('受限草稿')
    expect(source).toContain('无法完成')
  })

  it('keeps the route and staff workbench entry admin-scoped', () => {
    expect(pagesConfig.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'pages/ai-recipe-designer/index',
          style: expect.objectContaining({ navigationBarTitleText: 'AI食谱设计' }),
        }),
      ]),
    )
    expect(workbenchSource).toContain('v-if="isAdmin"')
    expect(workbenchSource).toContain('goToAiRecipeDesigner')
    expect(workbenchSource).toContain("uni.navigateTo({ url: '/pages/ai-recipe-designer/index' })")
  })

  it('guards direct page access and distinguishes dog loading states', () => {
    expect(source).toContain('仅管理员可用')
    expect(source).toContain("user?.role === 'ADMIN'")
    expect(source).toContain('if (!isAuthorized.value)')
    expect(source).toContain('正在加载狗狗档案')
    expect(source).toContain('dogLoadError')
    expect(source).toContain('重新加载')
    expect(source).toContain('暂无狗狗档案')
  })
})

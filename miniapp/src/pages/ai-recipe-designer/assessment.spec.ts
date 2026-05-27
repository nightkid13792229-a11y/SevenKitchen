import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ai recipe designer page', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/ai-recipe-designer/index.vue'), 'utf-8')

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
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('recipe diy regressions', () => {
  it('hides loading safely after navigating to the generated DIY sheet', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain('safeHideLoading()')
    expect(source).toContain('function safeHideLoading()')
    expect(source).toContain('fail: () => {}')
    expect(source).not.toContain('finally {\n    uni.hideLoading()')
  })
})

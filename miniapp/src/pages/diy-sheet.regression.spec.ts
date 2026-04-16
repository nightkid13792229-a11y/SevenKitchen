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
})

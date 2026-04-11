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
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(process.cwd(), 'src/pages/staff-recipes/index.vue'),
  'utf-8',
)

describe('staff recipes page', () => {
  it('uses the shared life-stage label mapping for recipe series stages', () => {
    expect(source).toContain("import { getLifeStageLabel } from '../../utils/label-mapping'")
    expect(source).toContain('{{ getLifeStageLabel(stage) }}')
    expect(source).not.toContain('function getLifeStageLabel(stage: string)')
  })

  it('does not offer a draft filter on the recipe management page', () => {
    expect(source).not.toContain("label: '草稿'")
  })

  it('previews covers at the same 16:9 ratio used by recipe covers', () => {
    expect(source).toContain('width: 240rpx')
    expect(source).toContain('height: 135rpx')
    expect(source).not.toContain('height: 200rpx')
    expect(source).toContain('mode="aspectFit"')
  })
})

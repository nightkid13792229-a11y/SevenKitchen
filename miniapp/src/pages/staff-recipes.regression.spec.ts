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
})

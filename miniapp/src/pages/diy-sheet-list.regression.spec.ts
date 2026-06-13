import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('diy sheet list regressions', () => {
  it('carries persisted package plans back into the DIY sheet page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet-list/index.vue'),
      'utf-8',
    )

    expect(source).toContain('packagePlan?: PackagePlanItem[]')
    expect(source).toContain('type PackagePlanItem')
    expect(source).toContain('packagePlan: JSON.stringify(sheet.packagePlan || [])')
    expect(source).toContain('packagePlan=${encodeURIComponent(params.packagePlan)}')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('breed health risk lookup page regressions', () => {
  it('registers a standalone breed health risk lookup page', () => {
    const pagesJson = readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8')

    expect(pagesJson).toContain('pages/breed-health-risk-lookup/index')
    expect(pagesJson).toContain('品种疾病风险查询')
  })

  it('uses breed search and the shared risk section', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/breed-health-risk-lookup/index.vue'),
      'utf-8',
    )

    expect(source).toContain('filterBreedsByKeyword')
    expect(source).toContain('dogApi.breeds()')
    expect(source).toContain('dogApi.breedHealthRisks')
    expect(source).toContain('BreedHealthRiskSection')
    expect(source).toContain('normalizeBreedHealthRiskResponse')
    expect(source).toContain('isBreedHealthRiskEndpointUnavailable')
    expect(source).toContain("resolveBreedHealthRiskEmptyText('unavailable')")
  })
})

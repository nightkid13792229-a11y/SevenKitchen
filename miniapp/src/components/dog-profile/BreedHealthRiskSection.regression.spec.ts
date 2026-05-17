import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('BreedHealthRiskSection regressions', () => {
  it('renders source urls in the expanded source metadata', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/BreedHealthRiskSection.vue'),
      'utf-8',
    )

    expect(source).toContain('资料来源')
    expect(source).toContain('source.sourceName')
    expect(source).toContain('source.title')
    expect(source).toContain('sourcePublisherText(source)')
    expect(source).toContain('source.url')
    expect(source).toContain('breed-risk-source__url')
    expect(source).toContain('word-break: break-all')
  })
})

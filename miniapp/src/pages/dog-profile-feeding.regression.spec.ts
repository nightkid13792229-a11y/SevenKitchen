import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dog-profile-feeding regressions', () => {
  it('orders activity choices from resting through city routine to active levels', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-feeding/index.vue'),
      'utf-8',
    )
    const optionsSource = source.match(/const activityLevelOptions = \[[\s\S]*?\n\]/)?.[0] || ''

    expect(optionsSource.indexOf("value: 'RESTING'")).toBeLessThan(
      optionsSource.indexOf("value: 'LOW'"),
    )
    expect(optionsSource.indexOf("value: 'LOW'")).toBeLessThan(
      optionsSource.indexOf("value: 'NORMAL'"),
    )
    expect(optionsSource.indexOf("value: 'NORMAL'")).toBeLessThan(
      optionsSource.indexOf("value: 'HIGH'"),
    )
    expect(source).toContain("activityLevel: 'LOW'")
    expect(source).toContain("profile.activityLevel || 'LOW'")
  })
})

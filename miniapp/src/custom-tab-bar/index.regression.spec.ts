import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('custom tab bar runtime regressions', () => {
  it('uses page show lifecycles instead of route polling to sync tab state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/custom-tab-bar/index.js'),
      'utf-8',
    )

    expect(source).toContain('pageLifetimes:')
    expect(source).toContain('show()')
    expect(source).toContain('this.refresh();')
    expect(source).not.toContain('setInterval(')
    expect(source).not.toContain('userLoginTrigger')
    expect(source).not.toContain("console.log('[TabBar] refresh() called'")
    expect(source).not.toContain("console.log('[TabBar] User from storage:'")
    expect(source).not.toContain("console.log('[TabBar] Current page route:'")
  })
})

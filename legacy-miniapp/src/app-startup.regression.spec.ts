import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('app startup regressions', () => {
  it('avoids verbose startup logging and caches runtime platform checks', () => {
    const appSource = readFileSync(
      resolve(process.cwd(), 'src/App.vue'),
      'utf-8',
    )
    const configSource = readFileSync(
      resolve(process.cwd(), 'src/utils/config.ts'),
      'utf-8',
    )

    expect(appSource).not.toContain('SevenKitchen Miniapp - App Launch')
    expect(appSource).not.toContain('[App Debug] Platform:')
    expect(appSource).not.toContain("console.log('App Show')")
    expect(configSource).toContain('let cachedDevicePlatform: string | null = null')
    expect(configSource).toContain('function getCachedDevicePlatform(): string {')
    expect(configSource).not.toContain('[Config Debug] Platform:')
    expect(configSource).not.toContain('[Config Debug] isRealDevice result:')
    expect(configSource).not.toContain('[Config Debug] isDevTools result:')
  })
})

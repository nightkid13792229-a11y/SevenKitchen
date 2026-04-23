import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('mp-weixin build asset regressions', () => {
  it('keeps tabbar static assets available in the generated mini program project', () => {
    const fixScript = readFileSync(
      resolve(process.cwd(), 'scripts/fix-components-injection.js'),
      'utf-8',
    )
    const previewScript = readFileSync(
      resolve(process.cwd(), 'scripts/mp-weixin-dev.sh'),
      'utf-8',
    )

    expect(fixScript).toContain("'tabbar'")
    expect(fixScript).toContain('syncStaticAssetDirectory')
    expect(fixScript).toContain('assertTabBarIconsExist')
    expect(fixScript).toContain("projectConfig.miniprogramRoot = './'")
    expect(fixScript).toContain('appJson.functionalPages = false')
    expect(fixScript).toContain('maxRetries')
    expect(previewScript).toContain('node scripts/fix-components-injection.js')
  })
})

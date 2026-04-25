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

  it('keeps staff feature pages in subpackages so the main package stays small', () => {
    const pagesConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'),
    )
    const mainPages = pagesConfig.pages.map((page: { path: string }) => page.path)
    const packageRoots = pagesConfig.subPackages.map(
      (subPackage: { root: string }) => subPackage.root,
    )

    expect(mainPages).toContain('pages/staff-workbench/index')
    expect(mainPages).not.toContain('pages/staff-purchasing/index')
    expect(mainPages).not.toContain('pages/staff-production/index')
    expect(packageRoots).toEqual(
      expect.arrayContaining([
        'pages/staff-inventory',
        'pages/staff-purchasing',
        'pages/staff-production',
        'pages/staff-orders',
        'pages/staff-shipping',
        'pages/staff-recipes',
      ]),
    )
  })
})

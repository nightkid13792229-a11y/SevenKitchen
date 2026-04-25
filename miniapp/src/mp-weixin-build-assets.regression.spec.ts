import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

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

  it('keeps staff-only modules inside their subpackages instead of the main package', () => {
    const staffInventoryPages = [
      'src/pages/staff-inventory/index.vue',
      'src/pages/staff-inventory/stocktake-create.vue',
    ].map(readSource)
    const staffPurchasingPages = [
      'src/pages/staff-purchasing/index.vue',
      'src/pages/staff-purchasing/detail.vue',
      'src/pages/staff-purchasing/preview.vue',
      'src/pages/staff-purchasing/record-form.vue',
      'src/pages/staff-purchasing/stock-create.vue',
      'src/pages/staff-purchasing/reimbursement/detail.vue',
      'src/pages/staff-purchasing/reimbursement/list.vue',
      'src/pages/staff-purchasing/reimbursement/submit.vue',
    ].map(readSource)
    const staffProductionPages = [
      'src/pages/staff-production/index.vue',
      'src/pages/staff-production/detail.vue',
      'src/pages/staff-production/print.vue',
      'src/pages/staff-production/print-label.vue',
    ].map(readSource)

    staffInventoryPages.forEach((source) => {
      expect(source).not.toContain('@/api/inventory')
      expect(source).not.toContain('../../api/inventory')
    })
    staffPurchasingPages.forEach((source) => {
      expect(source).not.toContain('@/api/purchasing')
      expect(source).not.toContain('@/constants/reimbursement')
      expect(source).not.toContain('../../api/purchasing')
      expect(source).not.toContain('../../constants/reimbursement')
    })
    staffProductionPages.forEach((source) => {
      expect(source).not.toContain('../../api/production')
      expect(source).not.toContain('../../api/label')
      expect(source).not.toContain('../../utils/canvas-printer')
      expect(source).not.toContain('../../utils/jcing-printer')
      expect(source).not.toContain('../../utils/label-renderer')
      expect(source).not.toContain('../../utils/label-print-items')
      expect(source).not.toContain('../../utils/format')
    })
  })

  it('removes generated no-dependency files that fail WeChat code quality scans', () => {
    const fixScript = readSource('scripts/fix-components-injection.js')

    expect(fixScript).toContain('removeCodeQualityNoDependencyFiles')
    expect(fixScript).toContain("'project.private.config.json'")
    expect(fixScript).toContain("'App.wxml'")
  })
})

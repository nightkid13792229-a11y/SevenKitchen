import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')
const requireScript = createRequire(import.meta.url)

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
    expect(fixScript).toContain('syncProjectConfig')
    expect(fixScript).toContain("miniprogramRoot: './'")
    expect(fixScript).toContain("'libVersion'")
    expect(fixScript).toContain('appJson.functionalPages = false')
    expect(fixScript).toContain('maxRetries')
    expect(previewScript).toContain('node scripts/fix-components-injection.js')
  })

  it('uses the stable esbuild minifier for mp-weixin production builds', () => {
    const packageJson = JSON.parse(readSource('package.json'))

    expect(packageJson.scripts['build:mp-weixin']).toContain('--minify esbuild')
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

  it('keeps heavyweight customer journey pages out of the main package', () => {
    const pagesConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'),
    )
    const mainPages = pagesConfig.pages.map((page: { path: string }) => page.path)
    const packageRoots = pagesConfig.subPackages.map(
      (subPackage: { root: string }) => subPackage.root,
    )

    expect(mainPages).toEqual(
      expect.arrayContaining([
        'pages/home/index',
        'pages/me/index',
        'pages/staff-workbench/index',
        'pages/login/index',
      ]),
    )
    expect(mainPages).not.toEqual(
      expect.arrayContaining([
        'pages/dog-create/index',
        'pages/dog-profile-overview/index',
        'pages/recipe-order/index',
        'pages/checkout/index',
        'pages/diy-sheet/index',
        'pages/order-detail/index',
      ]),
    )
    expect(packageRoots).toEqual(
      expect.arrayContaining([
        'pages/dog-create',
        'pages/dog-profile-overview',
        'pages/recipe-order',
        'pages/checkout',
        'pages/diy-sheet',
        'pages/order-detail',
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

  it('preserves source project config fields required by WeChat DevTools compiler', () => {
    const { syncProjectConfig } = requireScript('../scripts/fix-components-injection.js')

    const syncedConfig = syncProjectConfig(
      {
        miniprogramRoot: './',
        libVersion: '',
        appid: 'wx-generated',
        projectname: 'Generated',
        setting: {
          minified: true,
          ignoreDevUnusedFiles: true,
        },
      },
      {
        compileType: 'miniprogram',
        libVersion: '3.13.0',
        appid: 'wx2c1e8f1a2d7c2406',
        projectname: 'SevenKitchen',
      },
      {
        urlCheck: false,
        ignoreDevUnusedFiles: false,
      },
    )

    expect(syncedConfig).toMatchObject({
      miniprogramRoot: './',
      compileType: 'miniprogram',
      libVersion: '3.13.0',
      appid: 'wx2c1e8f1a2d7c2406',
      projectname: 'SevenKitchen',
      setting: {
        minified: true,
        urlCheck: false,
        ignoreDevUnusedFiles: false,
      },
    })
  })

  it('localizes subpackage-only helper modules out of the main package', () => {
    const { localizeSubpackageOnlyModules } = requireScript('../scripts/fix-components-injection.js')
    const distDir = mkdtempSync(resolve(tmpdir(), 'sevenkitchen-mp-weixin-'))
    const appJson = {
      pages: [{ path: 'pages/home/index' }],
      subPackages: [
        { root: 'pages/order-detail', pages: [{ path: 'index' }] },
        { root: 'pages/staff-production', pages: [{ path: 'print-label' }] },
      ],
    }

    const writeFixture = (path: string, source: string) => {
      const filePath = resolve(distDir, path)
      mkdirSync(resolve(filePath, '..'), { recursive: true })
      writeFileSync(filePath, source, 'utf-8')
    }

    writeFixture('pages/home/index.js', 'require("../../utils/api.js");')
    writeFixture(
      'pages/order-detail/index.js',
      'const orders = require("../../api/orders.js"); const plan = require("../../utils/order-package-plan.js");',
    )
    writeFixture(
      'pages/staff-production/utils/label-renderer.js',
      'const labels = require("../../../utils/label-mapping.js");',
    )
    writeFixture('utils/api.js', 'exports.request = function request() {};')
    writeFixture('utils/order-package-plan.js', 'exports.getPackagePlanTotal = function getPackagePlanTotal() {};')
    writeFixture('utils/label-mapping.js', 'const api = require("./api.js"); exports.api = api;')
    writeFixture('api/orders.js', 'const api = require("../utils/api.js"); exports.api = api;')

    localizeSubpackageOnlyModules(distDir, appJson, [
      'api/orders.js',
      'utils/label-mapping.js',
      'utils/order-package-plan.js',
    ])

    expect(readFileSync(resolve(distDir, 'pages/order-detail/index.js'), 'utf-8')).toContain(
      'require("./api/orders.js")',
    )
    expect(readFileSync(resolve(distDir, 'pages/order-detail/index.js'), 'utf-8')).toContain(
      'require("./utils/order-package-plan.js")',
    )
    expect(readFileSync(resolve(distDir, 'pages/order-detail/api/orders.js'), 'utf-8')).toContain(
      'require("../../../utils/api.js")',
    )
    expect(
      readFileSync(resolve(distDir, 'pages/staff-production/utils/label-renderer.js'), 'utf-8'),
    ).toContain('require("./label-mapping.js")')
    expect(
      readFileSync(resolve(distDir, 'pages/staff-production/utils/label-mapping.js'), 'utf-8'),
    ).toContain('require("../../../utils/api.js")')
    expect(existsSync(resolve(distDir, 'api/orders.js'))).toBe(false)
    expect(existsSync(resolve(distDir, 'utils/label-mapping.js'))).toBe(false)
    expect(existsSync(resolve(distDir, 'utils/order-package-plan.js'))).toBe(false)
    expect(existsSync(resolve(distDir, 'utils/api.js'))).toBe(true)
  })
})

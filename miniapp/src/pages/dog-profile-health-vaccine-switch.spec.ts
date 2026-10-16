import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stripComments } from '../architecture/source-text'

/**
 * 健康管理页 · 疫苗书签受远程开关控制（2026-10-16 上线前风险控制 B4）
 *
 * 这组是**页面接线**的钉子：逻辑本身（默认值、过滤、挂载判断）在
 * `src/utils/vaccine-feature.spec.ts` 里测；这里只保证页面真的用上了那套逻辑。
 *
 * 为什么用源码断言而不是挂载组件：这个小程序工程没有 @vue/test-utils，
 * 页面又是 uni-app 的（onLoad/onShow 那些生命周期在 node 里跑不起来）——
 * 同目录下的几个 `*.regression.spec.ts` 都是这么钉的。
 * ⚠️ 凡是"不许出现某写法"的断言，一律先 stripComments（见 source-text.ts 的教训）。
 */

const pageSource = () =>
  stripComments(
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    ),
  )

describe('健康管理页 · 疫苗书签按开关显示', () => {
  it('书签栏循环的是 visibleHealthTabs（不是写死的 HEALTH_TABS）', () => {
    const page = pageSource()

    expect(page).toContain('v-for="tab in visibleHealthTabs"')
    expect(page).not.toContain('v-for="tab in HEALTH_TABS"')
  })

  it('visibleHealthTabs 由开关算出来（关掉时只少「疫苗」一个）', () => {
    const page = pageSource()

    expect(page).toContain(
      'resolveVisibleHealthTabs(HEALTH_TABS, vaccineFeature.value)',
    )
  })

  it('初值是 fail-safe（关）：没问到后端之前绝不先把疫苗书签摆出来', () => {
    const page = pageSource()

    expect(page).toContain(
      'const vaccineFeature = ref<VaccineFeatureFlag>({ ...VACCINE_FEATURE_FAILSAFE })',
    )
    expect(page).toContain('VACCINE_FEATURE_FAILSAFE')
  })

  it('启动时（onLoad）就问开关，且未登录也能问（公开只读接口）', () => {
    const page = pageSource()

    expect(page).toContain('void loadVaccineFeatureFlag(true)')
    // 开关是独立的公开只读接口，不依赖登录态
    expect(page).toContain('fetchVaccineFeatureFlag')
  })

  it('回到页面时（onShow）再问一次，这样"老板刚关掉"能马上生效', () => {
    const page = pageSource()

    const at = page.indexOf('onShow(() => {')
    expect(at).toBeGreaterThan(0)
    const body = page.slice(at, at + 400)
    expect(body).toContain('void loadVaccineFeatureFlag()')
  })
})

describe('健康管理页 · 关掉时不发任何疫苗请求', () => {
  it('疫苗板块只能通过 shouldMountVaccineSection 挂载（关掉 = 不挂载 = 不发请求）', () => {
    const page = pageSource()

    expect(page).toContain(
      'v-else-if="shouldMountVaccineSection(activeHealthTab, vaccineFeature)"',
    )
    // 不能再有"只看书签是不是疫苗"的挂载条件（那样开关关掉时照样会去请求）
    expect(page).not.toContain(
      'v-else-if="activeHealthTab === \'vaccine\'"',
    )
  })

  it('页面自己一个疫苗接口都不调（疫苗请求全在 VaccineTab 里，靠不挂载来挡）', () => {
    const page = pageSource()

    expect(page).not.toContain('vaccineApi')
    expect(page).not.toContain('/vaccine-plan')
    expect(page).not.toContain('/vaccines')
  })
})

describe('健康管理页 · 已经停在疫苗书签上时被关掉', () => {
  it('优雅退回第一个书签，并说一句为什么（不白屏、不报错）', () => {
    const page = pageSource()

    const at = page.indexOf('() => vaccineFeature.value.enabled')
    expect(at).toBeGreaterThan(0)
    const body = page.slice(at, at + 900)

    expect(body).toContain("activeHealthTab.value !== 'vaccine'")
    expect(body).toContain('visibleHealthTabs.value[0]')
    expect(body).toContain('switchHealthTab(fallback ? fallback.key : \'medical\')')
    expect(body).toContain('uni.showToast')
  })

  it('退回走 switchHealthTab（不是 selectHealthTab）：开关不能被"还有没保存的记录"挡住', () => {
    const page = pageSource()

    const at = page.indexOf('() => vaccineFeature.value.enabled')
    const body = page.slice(at, at + 900)

    expect(body).toContain('switchHealthTab(')
    expect(body).not.toContain('selectHealthTab(')
  })
})

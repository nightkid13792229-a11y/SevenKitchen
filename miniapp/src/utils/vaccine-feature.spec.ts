/**
 * 疫苗板块的远程开关（2026-10-16 上线前风险控制 B4）
 *
 * 老板的原话是"出事能先关掉"。这组用例盯三件事：
 *   ① **拉不到开关时按"关"** —— 宁可少一个功能，也不要给错建议 ✓
 *      （这是本文件里最重要的断言：默认值反了，断网时家长就会看到
 *        可能算错的接种建议 ✗）
 *   ② 关掉时「疫苗」书签**不出现**，其余书签一个不少、顺序不变
 *   ③ 关掉时**不挂载**疫苗板块 —— 它的三个请求都在挂载钩子里发，
 *      不挂载 = 一个疫苗接口都不请求 ✓
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  VACCINE_FEATURE_FAILSAFE,
  VACCINE_TAB_KEY,
  fetchVaccineFeatureFlag,
  readVaccineFeatureFlag,
  resolveVisibleHealthTabs,
  shouldMountVaccineSection,
} from './vaccine-feature'

/** 页面里那份书签表（照抄 HEALTH_TABS 的形状） */
const HEALTH_TABS = [
  { key: 'medical', label: '就诊' },
  { key: 'checkup', label: '体检' },
  { key: 'vaccine', label: '疫苗' },
  { key: 'weight', label: '体重' },
]

const ON = { enabled: true, notice: '' }
const OFF = { enabled: false, notice: '疫苗功能维护中' }

describe('疫苗开关 · 接口返回怎么解析', () => {
  it('code=0 且 enabled 明确为 true → 开', () => {
    expect(
      readVaccineFeatureFlag({
        code: 0,
        message: 'Success',
        data: { enabled: true, notice: '  维护中  ' },
      }),
    ).toEqual({ enabled: true, notice: '维护中' })
  })

  it('enabled=false → 关（notice 照原样带回来，好给顾客一句解释）', () => {
    expect(
      readVaccineFeatureFlag({
        code: 0,
        message: 'Success',
        data: { enabled: false, notice: '疫苗功能维护中' },
      }),
    ).toEqual({ enabled: false, notice: '疫苗功能维护中' })
  })

  it('必须**明确**是 true 才算开：看不懂的一律算关', () => {
    const weird = [
      { code: 0, data: { enabled: 'true' } },
      { code: 0, data: { enabled: 1 } },
      { code: 0, data: { enabled: null } },
      { code: 0, data: {} },
      { code: 0, data: null },
      { code: 0 },
      { code: 400, data: { enabled: true } },
      { code: 500, data: { enabled: true } },
      null,
      undefined,
      'not-json',
    ]

    for (const payload of weird) {
      expect(readVaccineFeatureFlag(payload)).toEqual(VACCINE_FEATURE_FAILSAFE)
    }
  })

  it('notice 不是字符串 → 空串（不把对象塞进界面）', () => {
    expect(
      readVaccineFeatureFlag({ code: 0, data: { enabled: true, notice: {} } }),
    ).toEqual({ enabled: true, notice: '' })
  })
})

describe('疫苗开关 · 书签怎么过滤', () => {
  it('开着 → 四个书签原样（顺序都不变）', () => {
    expect(resolveVisibleHealthTabs(HEALTH_TABS, ON)).toEqual(HEALTH_TABS)
  })

  it('关掉 → 「疫苗」不出现，其余三个一个不少、顺序不变', () => {
    const visible = resolveVisibleHealthTabs(HEALTH_TABS, OFF)

    expect(visible.map((tab) => tab.key)).toEqual([
      'medical',
      'checkup',
      'weight',
    ])
    expect(visible.some((tab) => tab.key === VACCINE_TAB_KEY)).toBe(false)
    // 原表不能被改（否则开着的那一帧也会少一个书签）
    expect(HEALTH_TABS).toHaveLength(4)
  })

  it('默认值（拉不到）就是关 → 书签里没有疫苗', () => {
    expect(
      resolveVisibleHealthTabs(HEALTH_TABS, VACCINE_FEATURE_FAILSAFE),
    ).toHaveLength(3)
  })
})

describe('疫苗开关 · 关掉时不发任何疫苗请求', () => {
  it('关掉时**不挂载**疫苗板块（它的计划/记录/抗体请求全在挂载钩子里）', () => {
    expect(shouldMountVaccineSection(VACCINE_TAB_KEY, OFF)).toBe(false)
    expect(shouldMountVaccineSection(VACCINE_TAB_KEY, VACCINE_FEATURE_FAILSAFE)).toBe(
      false,
    )
  })

  it('开着时照旧挂载（一切照常）', () => {
    expect(shouldMountVaccineSection(VACCINE_TAB_KEY, ON)).toBe(true)
  })

  it('别的书签本来就不挂载疫苗板块', () => {
    for (const key of ['medical', 'checkup', 'weight']) {
      expect(shouldMountVaccineSection(key, ON)).toBe(false)
    }
  })
})

describe('疫苗开关 · 真的去问后端（接口失败 = 关）', () => {
  const uniMock = {
    request: vi.fn(),
    showToast: vi.fn(),
    getStorageSync: vi.fn(() => ''),
    setStorageSync: vi.fn(),
    removeStorageSync: vi.fn(),
    getDeviceInfo: vi.fn(() => ({ platform: 'devtools' })),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).uni = uniMock
  })

  afterEach(() => {
    delete (globalThis as any).uni
  })

  it('问的是公开只读接口 /health/vaccine-feature（GET）', async () => {
    uniMock.request.mockImplementation((options: any) => {
      options.success({
        statusCode: 200,
        data: { code: 0, message: 'Success', data: { enabled: true, notice: '' } },
      })
      return Promise.resolve()
    })

    await expect(fetchVaccineFeatureFlag()).resolves.toEqual(ON)
    expect(uniMock.request).toHaveBeenCalledTimes(1)
    const options = uniMock.request.mock.calls[0][0]
    expect(String(options.url)).toContain('/health/vaccine-feature')
    expect(options.method).toBe('GET')
    // 开关是启动时后台问一句，不许弹 toast 打扰顾客 ✗
    expect(uniMock.showToast).not.toHaveBeenCalled()
  })

  it('🔴 请求失败 → 保留书签但不挂载板块，并给重试提示', async () => {
    uniMock.request.mockImplementation((options: any) => {
      options.fail({ errMsg: 'request:fail timeout' })
      return Promise.resolve()
    })

    const flag = await fetchVaccineFeatureFlag()
    expect(flag.enabled).toBe(false)
    expect(flag.failed).toBe(true)
    expect(flag.notice).toContain('重试')
    expect(VACCINE_FEATURE_FAILSAFE.enabled).toBe(false)
    expect(uniMock.showToast).not.toHaveBeenCalled()
  })

  it('后端挂了（500 / 业务码非 0）→ 也不抛错，保留书签并重试', async () => {
    uniMock.request.mockImplementation((options: any) => {
      options.success({
        statusCode: 500,
        data: { code: 500, message: 'Internal server error', data: null },
      })
      return Promise.resolve()
    })

    const flag = await fetchVaccineFeatureFlag()
    expect(flag.enabled).toBe(false)
    expect(flag.failed).toBe(true)
  })
})

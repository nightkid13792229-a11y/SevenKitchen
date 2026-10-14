import { describe, expect, it, vi } from 'vitest'
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  STALE_PAGE_MANUAL_REFRESH_MESSAGE,
  STALE_PAGE_RELOADING_MESSAGE,
  isStalePageFileError,
  recoverFromStalePageFile,
  type ChunkLoadRecoveryDeps,
} from '../chunkLoadRecovery'

/**
 * 2026-10-15 老板报的「食谱设计列表点生命阶段进不去配方编辑器」回归。
 *
 * 事故实况（nginx access.log，01:36:19）：部署把编辑器那一页的 JS 换成了新指纹，
 * 而老板的标签页还是部署前打开的 —— 一点生命阶段，浏览器去要旧指纹的文件得到 404，
 * 页面切换被静默中止，界面上"点了没反应"。刷新后又好了。
 *
 * 这组测试锁住三件事：
 *   ① 认得出这类"页面文件过期"的错误（各浏览器文案不同）
 *   ② 第一次失败：带着用户本来要去的地址整体刷新（刷新即拿到新指纹）
 *   ③ 冷却期内的第二次失败：只提示手动刷新，绝不无限刷新
 *   ④ 别的错误（例如接口报错）一律不碰，不能被这套逻辑吞掉
 */
function createDeps(overrides: Partial<ChunkLoadRecoveryDeps> = {}) {
  const storage = new Map<string, number>()
  const reload = vi.fn<(target: string) => void>()
  const notify = vi.fn<(level: 'info' | 'error', message: string) => void>()
  const deps: ChunkLoadRecoveryDeps = {
    readLastReloadAt: () => storage.get('at') ?? 0,
    writeLastReloadAt: (at) => storage.set('at', at),
    now: () => 1_000_000,
    reload,
    notify,
    ...overrides,
  }
  return { deps, storage, reload, notify }
}

const TARGET = '/recipe-designer/series/s1/drafts/d1'

describe('部署后旧标签页点不动页面（页面文件过期）自愈', () => {
  it('认得各浏览器"模块文件取不到"的报错文案', () => {
    expect(
      isStalePageFileError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://x/assets/Editor-BDxbaiQd.js'
        )
      )
    ).toBe(true)
    expect(
      isStalePageFileError(new Error('Importing a module script failed.'))
    ).toBe(true)
    expect(isStalePageFileError(new Error('Loading chunk 12 failed.'))).toBe(true)
    expect(
      isStalePageFileError(new Error('Request failed with status code 500'))
    ).toBe(false)
    expect(isStalePageFileError(undefined)).toBe(false)
  })

  it('第一次失败：提示 + 带着用户本来要去的地址整体刷新', () => {
    const { deps, reload, notify } = createDeps()

    const outcome = recoverFromStalePageFile(
      new Error('Failed to fetch dynamically imported module: /assets/Editor-BDxbaiQd.js'),
      TARGET,
      deps
    )

    expect(outcome).toBe('reloaded')
    expect(reload).toHaveBeenCalledTimes(1)
    // 关键：刷新的地址必须是用户点的那一页，不能把人丢回列表页
    expect(reload).toHaveBeenCalledWith(TARGET)
    expect(notify).toHaveBeenCalledWith('info', STALE_PAGE_RELOADING_MESSAGE)
  })

  it('刷新后仍然失败：冷却期内只提示手动刷新，不再刷新（防死循环）', () => {
    const { deps, reload, notify } = createDeps()
    const error = new Error('Failed to fetch dynamically imported module: /assets/Editor-BDxbaiQd.js')

    expect(recoverFromStalePageFile(error, TARGET, deps)).toBe('reloaded')
    // 刷新后页面重新启动，同一次会话内紧接着又失败
    const second = recoverFromStalePageFile(
      error,
      TARGET,
      { ...deps, now: () => 1_000_000 + CHUNK_RELOAD_COOLDOWN_MS - 1 }
    )

    expect(second).toBe('advised')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenLastCalledWith('error', STALE_PAGE_MANUAL_REFRESH_MESSAGE)
  })

  it('刷新冷却期过去后再遇到同样问题，仍然自动救一次', () => {
    const { deps, reload } = createDeps()
    const error = new Error('Importing a module script failed.')

    recoverFromStalePageFile(error, TARGET, deps)
    const later = recoverFromStalePageFile(error, TARGET, {
      ...deps,
      now: () => 1_000_000 + CHUNK_RELOAD_COOLDOWN_MS,
    })

    expect(later).toBe('reloaded')
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('不是"页面文件过期"的错误一律不处理（不刷新、不提示）', () => {
    const { deps, reload, notify } = createDeps()

    const outcome = recoverFromStalePageFile(
      new Error('Request failed with status code 500'),
      TARGET,
      deps
    )

    expect(outcome).toBe('ignored')
    expect(reload).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})

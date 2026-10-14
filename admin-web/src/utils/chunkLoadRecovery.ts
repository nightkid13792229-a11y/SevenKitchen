/**
 * 「页面文件已过期」自愈（2026-10-15 老板报的"点生命阶段进不去配方编辑器"）。
 *
 * 背景：后台是单页应用，每个页面都是按需下载的独立 JS 文件，**文件名里带内容指纹**。
 * 部署脚本会先清空服务器目录再上传新构建 —— 旧指纹的文件随之消失。
 * 此时**部署前就已经打开的标签页**手里拿的还是旧指纹清单：
 * 用户一点某个还没下载过的页面（例如从"食谱设计"点进配方编辑器），
 * 浏览器就去要一个已经被删掉的文件 → 404 → 页面切换被静默中止
 * —— 界面表现就是"点了没反应"，手动刷新一下又好了。
 *
 * 线上实证（nginx access.log，老板这台机器 154.26.176.104）：
 *   01:36:19 在 /recipe-designer 点进编辑器时，同时 404 了
 *   Editor-BDxbaiQd.js / Editor-CxpH-8QB.css / preparationBasis-BtZMrIEZ.js
 *   —— 正是配方编辑器那一页要用的三个文件，而服务器上此刻已经是另一批指纹。
 *
 * 策略：认出这类"页面文件取不到"的错误后，**带着用户原本要去的地址整体刷新一次**，
 * 刷新会拿到最新指纹清单，用户点的那一页照常打开（不必再点第二次）。
 * 但万一新版本本身有问题，刷新也救不回来 —— 所以用时间戳做冷却，
 * 冷却期内的第二次失败只提示手动刷新，绝不无限刷新。
 *
 * 逻辑放在 utils 里、依赖全部注入，是为了能在 vitest（node 环境）里回归：
 * 这条 bug 只在"部署 + 旧标签页"这个组合下出现，靠手点很难复现。
 */

/** 记录上次自动刷新时间；放 sessionStorage 里，按标签页隔离 */
export const CHUNK_RELOAD_STORAGE_KEY = 'admin_web_chunk_reload_at'

/** 冷却期：短于这个间隔说明"刷了也没用"，改为提示手动刷新 */
export const CHUNK_RELOAD_COOLDOWN_MS = 10000

/**
 * 各浏览器对"模块文件取不到"的报错文案不一样，这里把已知的都收进来：
 *   Chrome/Edge: Failed to fetch dynamically imported module: ...
 *   Safari:      Importing a module script failed.
 *   webpack 时代遗留 + 部分内嵌浏览器: Loading chunk 3 failed.
 */
const CHUNK_LOAD_ERROR_PATTERN =
  /dynamically imported module|importing a module script failed|loading chunk \w+ failed|failed to fetch/i

export const STALE_PAGE_RELOADING_MESSAGE = '系统已更新到新版本，正在刷新…'
export const STALE_PAGE_MANUAL_REFRESH_MESSAGE =
  '页面文件更新失败，请手动刷新浏览器（⌘R / Ctrl+R）'

export type ChunkLoadRecoveryOutcome =
  /** 不是"页面文件过期"这类错误，不处理 */
  | 'ignored'
  /** 已带着目标地址整体刷新 */
  | 'reloaded'
  /** 冷却期内，只提示手动刷新 */
  | 'advised'

export interface ChunkLoadRecoveryDeps {
  /** 上次自动刷新的时间戳（秒/毫秒均可，与 now() 同单位）；没有记录返回 0 */
  readLastReloadAt: () => number
  writeLastReloadAt: (at: number) => void
  now: () => number
  /** 带着用户原本要去的地址整体刷新（空地址则刷新当前页） */
  reload: (targetPath: string) => void
  notify: (level: 'info' | 'error', message: string) => void
}

/** 是不是"页面文件已过期/取不到"这类错误 */
export function isStalePageFileError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? '')
  return CHUNK_LOAD_ERROR_PATTERN.test(message)
}

/**
 * 处理一次路由/模块加载错误。
 *
 * @param error      路由抛出的错误
 * @param targetPath 用户本来要去的地址（如 /recipe-designer/series/x/drafts/y）
 */
export function recoverFromStalePageFile(
  error: unknown,
  targetPath: string,
  deps: ChunkLoadRecoveryDeps
): ChunkLoadRecoveryOutcome {
  if (!isStalePageFileError(error)) return 'ignored'

  const now = deps.now()
  const lastReloadAt = Number(deps.readLastReloadAt())

  if (
    Number.isFinite(lastReloadAt) &&
    lastReloadAt > 0 &&
    now - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS
  ) {
    deps.notify('error', STALE_PAGE_MANUAL_REFRESH_MESSAGE)
    return 'advised'
  }

  deps.writeLastReloadAt(now)
  deps.notify('info', STALE_PAGE_RELOADING_MESSAGE)
  deps.reload(targetPath)
  return 'reloaded'
}

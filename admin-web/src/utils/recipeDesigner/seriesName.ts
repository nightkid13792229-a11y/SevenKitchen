/**
 * 食谱设计器系列名称工具。
 *
 * 新建系列时不再让营养师先起名（他们往往要等配方设计完才知道叫什么），
 * 后端又要求 name 必填，所以先写一个带「未命名」前缀的临时名称；
 * 发布前再强制改成正式名称。
 */
export const TEMPORARY_SERIES_NAME_PREFIX = '未命名'
export const SERIES_NAME_MAX_LENGTH = 60

export interface BuildTemporarySeriesNameOptions {
  dogName?: string | null
  now?: Date
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalStamp(now: Date): string {
  return `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

/**
 * 生成临时系列名，例如：
 *   未命名系列 · 10-21 22:15
 *   未命名系列 · 旺财 · 10-21 22:15
 *
 * 狗名过长时退回不带狗名的版本，保证不超过后端 60 字符限制。
 */
export function buildTemporarySeriesName(
  options: BuildTemporarySeriesNameOptions = {}
): string {
  const now = options.now ?? new Date()
  const stamp = formatLocalStamp(now)
  const dogName = String(options.dogName ?? '').trim()
  const baseName = `${TEMPORARY_SERIES_NAME_PREFIX}系列 · ${stamp}`
  if (!dogName) return baseName

  const withDogName = `${TEMPORARY_SERIES_NAME_PREFIX}系列 · ${dogName} · ${stamp}`
  return withDogName.length <= SERIES_NAME_MAX_LENGTH ? withDogName : baseName
}

/** 是否仍是临时名称（发布前需要改名） */
export function isTemporarySeriesName(name?: string | null): boolean {
  return String(name ?? '')
    .trim()
    .startsWith(TEMPORARY_SERIES_NAME_PREFIX)
}

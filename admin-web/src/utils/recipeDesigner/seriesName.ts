/**
 * 食谱设计器系列名称工具。
 *
 * 新建系列时不再让营养师先起名（他们往往要等配方设计完才知道叫什么），
 * 后端又要求 name 必填，所以先写一个带「未命名」前缀的临时名称；
 * 发布前再强制改成正式名称。
 *
 * 2026-10-29：后端在 10-27 加了「名称最多 12 个字（标签印不下）」的硬限制，
 * 原临时名「未命名系列 · 10-21 22:15」有 19 个字，导致新建直接被拦。
 * 临时名同样按 12 个字生成：`未命名1021-2215`，保留到分钟的唯一性；
 * 狗名不再塞进临时名（卡片上本来就有狗狗标签），否则一定超长。
 */
export const TEMPORARY_SERIES_NAME_PREFIX = '未命名'

/** 与后端 `RECIPE_NAME_MAX_LENGTH` 保持一致：标签一行只放得下 12 个字 */
export const SERIES_NAME_MAX_LENGTH = 12

export interface BuildTemporarySeriesNameOptions {
  now?: Date
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** MMDD-HHmm，例如 1021-2215（9 个字，加上前缀正好 12 个字） */
function formatCompactStamp(now: Date): string {
  return `${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`
}

/**
 * 生成临时系列名，例如：
 *   未命名1021-2215
 */
export function buildTemporarySeriesName(
  options: BuildTemporarySeriesNameOptions = {}
): string {
  const now = options.now ?? new Date()
  return `${TEMPORARY_SERIES_NAME_PREFIX}${formatCompactStamp(now)}`
}

/** 是否仍是临时名称（发布前需要改名） */
export function isTemporarySeriesName(name?: string | null): boolean {
  return String(name ?? '')
    .trim()
    .startsWith(TEMPORARY_SERIES_NAME_PREFIX)
}

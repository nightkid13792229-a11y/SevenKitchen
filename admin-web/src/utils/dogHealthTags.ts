/**
 * 营养师端健康档案页的纯逻辑（2026-10-01 自查补）。
 *
 * 为什么抽出来：这一页原来把「标签纠错」的算法直接写在组件里，
 * 而 admin-web 的 vitest 只跑 node 环境下的纯函数 spec（没有 jsdom / test-utils），
 * 组件里的逻辑就一条都测不到 —— 可"健康标签纠错"是老板第 24 条明确要的功能，
 * 改错了直接影响 AI 引用哪些知识条目，不能不测。
 *
 * 这里只放**不依赖 Vue 与接口**的部分：标签合并、可加标签、增删改的下一步状态、
 * 时间格式化。组件负责取数与呈现，算法一律走这里。
 */

export interface HealthTagOverrides {
  added: string[]
  removed: string[]
}

/** 复制一份修正记录，避免调用方误改原对象 */
export function cloneHealthTagOverrides(overrides?: Partial<HealthTagOverrides> | null): HealthTagOverrides {
  return {
    added: [...(overrides?.added || [])],
    removed: [...(overrides?.removed || [])],
  }
}

/**
 * 最终用于检索的标签：派生标签 − 人工删除 + 人工添加。
 *
 * 一律转小写（检索侧按小写比较）、去重、排序 —— 与后端
 * `dog.healthTagOverrides` 的应用顺序保持一致（先派生、后修正）。
 */
export function buildEffectiveHealthTags(
  derivedTags: string[] = [],
  overrides: HealthTagOverrides = { added: [], removed: [] },
): string[] {
  const set = new Set<string>(
    (derivedTags || []).map((tag) => String(tag).toLowerCase()),
  )
  ;(overrides.removed || []).forEach((tag) => set.delete(String(tag).toLowerCase()))
  ;(overrides.added || []).forEach((tag) => set.add(String(tag).toLowerCase()))
  return [...set].sort()
}

/** 可以从词表里加、且当前还没有的标签 */
export function listAddableHealthTags(
  vocabulary: string[] = [],
  derivedTags: string[] = [],
  overrides: HealthTagOverrides = { added: [], removed: [] },
): string[] {
  const existing = new Set<string>([
    ...(derivedTags || []).map((tag) => String(tag).toLowerCase()),
    ...(overrides.added || []).map((tag) => String(tag).toLowerCase()),
  ])
  return (vocabulary || []).filter((tag) => !existing.has(String(tag).toLowerCase()))
}

/** 人工加一个标签：统一小写；若它本来在"人工删除"里，要同时撤销那次删除 */
export function applyAddHealthTag(
  overrides: HealthTagOverrides,
  rawTag: string,
): HealthTagOverrides {
  const tag = String(rawTag || '').trim().toLowerCase()
  if (!tag) {
    return cloneHealthTagOverrides(overrides)
  }

  const added = overrides.added.includes(tag)
    ? [...overrides.added]
    : [...overrides.added, tag]

  return {
    added,
    removed: overrides.removed.filter((item) => item.toLowerCase() !== tag),
  }
}

/**
 * 删掉一个**派生**标签（模板里派生标签的关闭按钮走这里）。
 *
 * 语义与改造前一致：记进"人工删除"，这样即使系统下次又派生出它也不会出现；
 * 若这个标签恰好也在"人工添加"里（先人工加、后来系统也派生出了它），
 * 一并把那条人工添加撤掉 —— **删除优先**。
 *
 * 人工添加的标签要走 applyRemoveAddedHealthTag，那条路不留删除记录。
 * 两者分开是有意的：留下一条关于"人工添加"的删除记录，会把系统本来
 * 就该派生的标签也一起按住，反而更难恢复。
 */
export function applyRemoveHealthTag(
  overrides: HealthTagOverrides,
  rawTag: string,
): HealthTagOverrides {
  const tag = String(rawTag || '').trim()
  const normalized = tag.toLowerCase()

  const added = overrides.added.filter((item) => item.toLowerCase() !== normalized)
  const removed = overrides.removed.some((item) => item.toLowerCase() === normalized)
    ? [...overrides.removed]
    : [...overrides.removed, tag]

  return { added, removed }
}

/** 撤销"人工添加"（不写入删除记录） */
export function applyRemoveAddedHealthTag(
  overrides: HealthTagOverrides,
  rawTag: string,
): HealthTagOverrides {
  const normalized = String(rawTag || '').trim().toLowerCase()
  return {
    added: overrides.added.filter((item) => item.toLowerCase() !== normalized),
    removed: [...overrides.removed],
  }
}

/**
 * 顶部那行"健康信息最近更新"（老板第 25 条）。
 *
 * 营养师进来第一眼要看出"有没有新东西"，所以：
 * 没有值或值不合法一律显示 `—`，不显示 `Invalid Date`。
 */
export function formatHealthUpdatedAt(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

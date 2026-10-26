import { normalizePreparationMethodText } from '@/utils/preparationMethodText'

export interface PreparationMethodCommit {
  value: string | null
  text: string
}

/**
 * 输入框里应显示的文字。
 *
 * 后端会同时回传 preparationMethodLabel；编辑框优先显示人能看懂的名称，
 * 没有名称时才回退到原始值（例如历史数据里残留的裸 ID）。
 *
 * 2026-10-26 Phase 3：旧字典 ID 已回填，不再需要前端传字典选项做兜底。
 */
export function resolvePreparationMethodDisplayText(
  value?: string | null,
  label?: string | null
): string {
  const labelText = String(label ?? '').trim()
  if (labelText) return labelText

  return String(value ?? '').trim()
}

/**
 * 把用户输入解析成要保存的值。
 *
 * 这个字段统一保存自由文本；字典只用于老数据展示兜底。
 */
export function resolvePreparationMethodCommitText(
  rawText: string | null | undefined
): PreparationMethodCommit {
  const text = normalizePreparationMethodText(String(rawText ?? ''))
  if (!text) {
    return { value: null, text: '' }
  }

  return { value: text, text }
}

/**
 * 历史下拉：按最后一段过滤，最多返回 3 条。
 *
 * 例：输入「牛里脊/生/去」→ 匹配历史「牛里脊/生/去油」；
 * 输入为空 → 返回最近 3 条。
 */
export function filterPreparationHistory(
  texts: string[],
  query: string | null | undefined,
  limit = 3
): string[] {
  const queryText = String(query ?? '').trim()
  const segments = queryText.split(/[\/、,，]/)
  const keyword = (segments[segments.length - 1] ?? '').trim().toLowerCase()
  const matched = keyword
    ? texts.filter((text) => text.toLowerCase().includes(keyword))
    : texts
  return matched.slice(0, limit)
}

/**
 * 下拉最终展示：有关键词时优先匹配；匹配不到就退回最近 3 条。
 *
 * 这个字段的诉求是「看看这个原料上次怎么写的」，不是搜索框。
 * 输入框里已有整句时，按整句过滤很容易一条都不剩；兜底保证历史始终可见。
 */
export function resolvePreparationHistorySuggestions(
  texts: string[],
  query: string | null | undefined,
  limit = 3
): string[] {
  const matched = filterPreparationHistory(texts, query, limit)
  return matched.length > 0 ? matched : texts.slice(0, limit)
}

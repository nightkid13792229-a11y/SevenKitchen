import {
  normalizePreparationMethodText,
  splitPreparationMethodSegments
} from '@/utils/preparationMethodText'

export interface PreparationMethodOption {
  id: string
  name: string
}

export interface PreparationMethodCommit {
  value: string | null
  text: string
}

/**
 * 输入框里应显示的文字。
 *
 * 历史数据里 preparationMethod 可能是字典 id；后端会同时回传
 * preparationMethodLabel。编辑框优先显示人能看懂的名称，没有名称时
 * 才回退到原始值（例如 AI 直接写入的整句预处理）。
 */
export function resolvePreparationMethodDisplayText(
  value?: string | null,
  label?: string | null,
  options: PreparationMethodOption[] = []
): string {
  const labelText = String(label ?? '').trim()
  if (labelText) return labelText

  const raw = String(value ?? '').trim()
  if (!raw) return ''

  // 历史数据里 preparationMethod 可能还是字典 id；前端拿到选项时兜底显示名称。
  return options.find((option) => option.id === raw)?.name ?? raw
}

/**
 * 把用户输入解析成要保存的值。
 *
 * 2026-10-26 起不再把「与字典名称完全一致」的文字保存成字典 id：
 * 这个字段统一保存自由文本，字典只用于老数据展示兜底。
 */
export function resolvePreparationMethodCommitText(
  rawText: string | null | undefined,
  _options: PreparationMethodOption[] = []
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
 * 下拉建议：多段文字只按最后一段过滤，方便在「去皮、切」后面继续补写。
 */
export function filterPreparationMethodOptions(
  options: PreparationMethodOption[],
  query: string | null | undefined,
  limit = 20
): PreparationMethodOption[] {
  const segments = splitPreparationMethodSegments(String(query ?? ''))
  const keyword = (segments[segments.length - 1] ?? '').toLowerCase()
  const matched = keyword
    ? options.filter((option) =>
        String(option.name ?? '').toLowerCase().includes(keyword)
      )
    : options
  return matched.slice(0, limit)
}

/**
 * 选中下拉建议时，只替换输入框里的最后一段，保留前面已经写好的预处理。
 *
 * 例：输入「去皮、切」选中「切块」→「去皮、切块」；
 * 输入「去皮、」选中「去骨」→「去皮、去骨」（末尾顿号表示要追加）。
 */
export function applyPreparationMethodSuggestion(
  currentText: string | null | undefined,
  suggestionName: string | null | undefined
): string {
  const name = normalizePreparationMethodText(String(suggestionName ?? ''))
  const current = String(currentText ?? '')
  const segments = splitPreparationMethodSegments(current)

  if (!name) {
    return normalizePreparationMethodText(current)
  }
  if (segments.length === 0) {
    return name
  }
  if (/[、,，]\s*$/.test(current)) {
    return [...segments, name].join('、')
  }

  const next = [...segments]
  next[next.length - 1] = name
  return next.join('、')
}

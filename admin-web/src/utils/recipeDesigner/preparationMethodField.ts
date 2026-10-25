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
  label?: string | null
): string {
  return String(label ?? '').trim() || String(value ?? '').trim()
}

/**
 * 把用户输入解析成要保存的值。
 *
 * - 与字典名称完全一致 → 保存字典 id（保留字典改名后自动跟随的能力）；
 * - 其余情况 → 保存归一化后的自由文本（逗号统一成顿号，与后端一致）。
 */
export function resolvePreparationMethodCommitText(
  rawText: string | null | undefined,
  options: PreparationMethodOption[]
): PreparationMethodCommit {
  const text = normalizePreparationMethodText(String(rawText ?? ''))
  if (!text) {
    return { value: null, text: '' }
  }

  const exact = options.find(
    (option) => String(option.name ?? '').trim() === text
  )
  if (exact) {
    return { value: exact.id, text: String(exact.name ?? '').trim() }
  }

  return { value: text, text }
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

/**
 * 食谱名称的字数口径（2026-11-19）。
 *
 * 后端 `backend/src/domain/recipe-designer/series-name.ts` 硬上限 12 个字：
 * 生产标签 70×100mm、标题 5mm 单行不换行，扣掉左右边距只装得下 12 个全角字，
 * 第 13 个字是真的印不出来。所以前端必须和后端同口径，不能"先让用户填、
 * 提交了再报错"。
 *
 * 这里只做前端提示与默认名生成，最终仍由后端拦。
 */
export const RECIPE_NAME_MAX_LENGTH = 12

/** 按"字"数算，不是按 UTF-16 长度：中文、数字、符号、emoji 都算 1 个字。 */
export function countRecipeNameLength(name: string): number {
  return [...String(name ?? '').trim()].length
}

/** 按"字"截断，不切断 emoji / 生僻字。 */
export function truncateRecipeName(name: string, max = RECIPE_NAME_MAX_LENGTH): string {
  return [...String(name ?? '').trim()].slice(0, max).join('')
}

export function isRecipeNameWithinLimit(name: string): boolean {
  return countRecipeNameLength(name) <= RECIPE_NAME_MAX_LENGTH
}

/**
 * 顾客新建食谱的默认名：「狗狗名 MM/DD」。
 *
 * 2026-11-19 之前是「狗狗名 的鲜食食谱 MM/DD」，固定 14 个字 —— 12 字上限
 * 上线后顾客点「开始设计」100% 被后端退回，等于自助设计用不了。
 * 现在固定压到 12 字以内：
 *   · 正常狗狗名（≤6 字）→ `好久 11/19`
 *   · 名字太长时先去掉日期保住狗狗名，再按 12 字截断
 */
export function buildCustomerRecipeDefaultName(
  dogName: string | null | undefined,
  date?: Date,
): string {
  const current = date || new Date()
  const base = truncateRecipeName(String(dogName ?? '').trim() || '爱犬')
  const mm = String(current.getMonth() + 1).padStart(2, '0')
  const dd = String(current.getDate()).padStart(2, '0')
  const withDate = `${base} ${mm}/${dd}`
  if (isRecipeNameWithinLimit(withDate)) return withDate
  return truncateRecipeName(base)
}

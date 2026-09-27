/**
 * 体重单位换算（公斤 / 斤）
 *
 * 背景：体重输入框原先**屏幕上不写单位**，只有占位文字「例如 12.5」。
 * 而国内顾客习惯按「斤」报体重 —— 把 25 斤填成 25，系统会当成 25 公斤，
 * 热量直接翻倍；反过来填 12.5 斤当成 12.5 公斤也会偏大。这是算量与报价的入口，
 * 一旦错就是整份配方的量错。
 *
 * 设计原则：**内部数据一律以公斤存储**，只在输入框这一层换算。
 * 这样下游所有逻辑（校验、提交、体重记录、热量计算）都不需要改动，
 * 也不存在「斤」漏进数据库的可能。
 */

export type WeightUnit = 'KG' | 'JIN'

/** 1 斤 = 0.5 公斤 */
export const KG_PER_JIN = 0.5

/** 档案允许的体重上限（公斤），与后端校验保持一致 */
export const MAX_WEIGHT_KG = 200

export function getWeightUnitLabel(unit: WeightUnit): string {
  return unit === 'JIN' ? '斤' : '公斤'
}

export function getWeightUnitSuffix(unit: WeightUnit): string {
  return unit === 'JIN' ? '斤' : 'kg'
}

/** 校验失败时的提示，按当前单位给出可理解的区间 */
export function getWeightRangeHint(unit: WeightUnit): string {
  return unit === 'JIN'
    ? `请输入 0 到 ${MAX_WEIGHT_KG * 2} 之间的有效体重`
    : `请输入 0 到 ${MAX_WEIGHT_KG} 之间的有效体重`
}

/** 去掉多余的小数位与尾随 0：25.00 → '25'，12.50 → '12.5' */
function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Math.round(value * 100) / 100)
}

/**
 * 把内部存储的公斤文本换算成输入框要显示的文本。
 *
 * 非数字输入原样返回：顾客正在打字（或粘贴了奇怪内容）时不要把内容抹掉，
 * 否则会出现「越打字越乱」的观感。
 */
export function formatWeightForInput(
  kgInput: string | number | null | undefined,
  unit: WeightUnit,
): string {
  if (kgInput === null || kgInput === undefined) return ''
  const text = String(kgInput).trim()
  if (!text) return ''

  const kg = Number(text)
  if (!Number.isFinite(kg)) return text

  return trimNumber(unit === 'JIN' ? kg / KG_PER_JIN : kg)
}

/**
 * 把输入框里的文本（按当前单位）换算成内部存储用的公斤文本。
 *
 * 输入为空或非数字时返回空字符串 —— 由已有的校验逻辑去提示，不在这里报错。
 */
export function parseWeightInputToKg(
  rawInput: string | number | null | undefined,
  unit: WeightUnit,
): string {
  if (rawInput === null || rawInput === undefined) return ''
  const text = String(rawInput).trim()
  if (!text) return ''

  const value = Number(text)
  if (!Number.isFinite(value)) return ''

  return trimNumber(unit === 'JIN' ? value * KG_PER_JIN : value)
}

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

/** 档案允许的体重上限（公斤），与后端 MAX_DOG_WEIGHT_KG 保持一致。
 *  2026-09-28：从 200 收紧到 130 —— 历史上最重的犬只约 155 kg，
 *  200 这个上限形同虚设，明显不可能的数值应当直接拦下。 */
export const MAX_WEIGHT_KG = 130

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

/**
 * 双向单位回显：把「内部公斤值」换算成当前**另一个**单位显示出来。
 *
 * 例：顾客输入 43、当前单位是公斤 → 显示「= 86 斤」；
 *     顾客输入 43、当前单位是斤   → 显示「= 21.5 公斤」。
 *
 * 这是唯一保留的体重提示（2026-09-28 老板决定）：
 * **只给客观的单位换算，不做任何「偏大/偏小/是不是填错」的判断**——
 * 系统无法区分顾客是真的填错了，还是养的就是串串/茶杯犬，
 * 给出错误提醒比不提醒更伤信任。
 */
export function formatWeightEcho(
  weightKgInput: string | number | null | undefined,
  currentUnit: WeightUnit,
): string {
  const weightKg = Number(weightKgInput)
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return ''
  }

  const otherUnit: WeightUnit = currentUnit === 'KG' ? 'JIN' : 'KG'
  const otherText = formatWeightForInput(weightKg, otherUnit)
  if (!otherText) {
    return ''
  }

  return `= ${otherText} ${otherUnit === 'JIN' ? '斤' : '公斤'}`
}

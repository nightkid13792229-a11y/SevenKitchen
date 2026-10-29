/**
 * AI 添加原料的线路决议。
 *
 * 线路只有两个值：食材 / 补剂。真正决定线路的只有两个来源——已存在的草稿、
 * 已有的原料，它们**锁定**；在此之外，**用户手选**说了算。入口带来的 `line`
 * 只用来决定「进页面第一刻先高亮哪一条」，用户点过之后就退场，否则
 * `?line=supplement` 会让闸门卡上的「改回食材」变成死路。
 *
 * 规则只此一份，页面只负责展示与传输入。
 */
export type IngredientLine = 'FOOD' | 'SUPPLEMENT'

export type LineSource = 'USER' | 'ENTRY' | 'DRAFT' | 'INGREDIENT'

export interface LineEntryInput {
  /** 已有的草稿类型（草稿存在时由它说了算）。 */
  draftType?: string | null
  /** 已有的原料类型（编辑入口从这里来）。 */
  ingredientType?: string | null
  /** 入口带来的预选（URL 参数），只认 FOOD / SUPPLEMENT。 */
  entryLine?: string | null
  /** 用户在这半页里点过的选择。 */
  userPick?: IngredientLine | null
}

export interface LineDecision {
  line: IngredientLine | null
  source: LineSource | null
  locked: boolean
  notice: string | null
  rejected: boolean
}

/** 顶部标签文案：只说业务词，不出现 FOOD / SUPPLEMENT。 */
export const LINE_LABELS: Record<IngredientLine, string> = {
  FOOD: '食材线',
  SUPPLEMENT: '补剂线'
}

/** 本页面只处理食材与补剂；包装不属于这里。 */
const PACKAGING_NOTICE = '这份记录是包装原料，这个页面不处理包装。'
const DRAFT_NOTICE = '已按草稿类型纠正'
const INGREDIENT_NOTICE = '已按原料类型纠正'

/** 只认两个值：其它（含空串、包装、脏数据）一律当作「没说」。 */
function toLine(value: string | null | undefined): IngredientLine | null {
  return value === 'FOOD' || value === 'SUPPLEMENT' ? value : null
}

/** 有值但不是食材/补剂：例如包装。空值不算拒绝，只算「没有」。 */
function isUnsupportedType(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false
  }
  return toLine(value) === null
}

/** 用户/入口这次实际想要的那条线；都没有时返回 null。 */
function askedLine(input: LineEntryInput): IngredientLine | null {
  return toLine(input.userPick ?? null) ?? toLine(input.entryLine ?? null)
}

export function resolveLineEntry(input: LineEntryInput): LineDecision {
  const draftType = input.draftType ?? null
  const ingredientType = input.ingredientType ?? null

  // 包装：不属于这个页面，直接给错误卡，绝不能落到食材逻辑里。
  if (isUnsupportedType(draftType) || isUnsupportedType(ingredientType)) {
    return {
      line: null,
      source: null,
      locked: true,
      notice: PACKAGING_NOTICE,
      rejected: true
    }
  }

  const draftLine = toLine(draftType)
  if (draftLine) {
    const asked = askedLine(input)
    return {
      line: draftLine,
      source: 'DRAFT',
      locked: true,
      notice: asked && asked !== draftLine ? DRAFT_NOTICE : null,
      rejected: false
    }
  }

  const ingredientLine = toLine(ingredientType)
  if (ingredientLine) {
    const asked = askedLine(input)
    return {
      line: ingredientLine,
      source: 'INGREDIENT',
      locked: true,
      notice: asked && asked !== ingredientLine ? INGREDIENT_NOTICE : null,
      rejected: false
    }
  }

  const userLine = toLine(input.userPick ?? null)
  if (userLine) {
    return {
      line: userLine,
      source: 'USER',
      locked: false,
      notice: null,
      rejected: false
    }
  }

  const entryLine = toLine(input.entryLine ?? null)
  if (entryLine) {
    return {
      line: entryLine,
      source: 'ENTRY',
      locked: false,
      notice: null,
      rejected: false
    }
  }

  return {
    line: null,
    source: null,
    locked: false,
    notice: null,
    rejected: false
  }
}

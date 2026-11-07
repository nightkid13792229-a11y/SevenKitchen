/**
 * 把模型写过的草稿合回表单。
 *
 * 关键：**只按后端给的 applied 清单回写**。
 * 模型返回的是整份草稿（大部分是把它收到的原值抄回来），靠"比对前后差值"判断谁变了
 * 是错的——用户在模型思考期间手填的值会被判成"变了"，于是被回显的旧值冲掉。
 * 后端写草稿时就知道自己动了哪几个字段，直接用那份清单，零歧义。
 */
export type DraftRecord = Record<string, unknown>

export interface AgentDraftPayload {
  /** 模型跑完时草稿的样子 */
  draft?: DraftRecord
  /** 真正被写进去的字段路径（如 brand、servingNutrients.minerals.zinc） */
  applied?: string[]
}

/**
 * 按 applied 把值合进表单。表单里没有的字段一律忽略。
 * 营养档案按项合并，不清空其它项。
 */
export function applyAgentDraft(
  form: DraftRecord,
  payload: AgentDraftPayload
): string[] {
  const draft = payload.draft ?? {}
  const applied = payload.applied ?? []
  const touched: string[] = []

  for (const path of applied) {
    if (path.startsWith('servingNutrients.')) {
      const fieldPath = path.slice('servingNutrients.'.length)
      const nutrients = draft.servingNutrients
      if (!nutrients || typeof nutrients !== 'object') {
        continue
      }
      const value = (nutrients as DraftRecord)[fieldPath]
      if (typeof value !== 'number') {
        continue
      }
      const target = form.servingNutrients
      if (!target || typeof target !== 'object') {
        continue
      }
      ;(target as DraftRecord)[fieldPath] = value
      touched.push(path)
      continue
    }

    if (!Object.prototype.hasOwnProperty.call(form, path)) {
      continue
    }
    const value = draft[path]
    if (value === undefined || value === null) {
      continue
    }
    form[path] = value
    touched.push(path)
  }

  return touched
}

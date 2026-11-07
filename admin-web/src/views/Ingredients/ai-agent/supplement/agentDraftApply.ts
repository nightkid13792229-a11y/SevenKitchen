/**
 * 把模型改过的草稿合回表单。
 *
 * 关键点：**只认模型真正改过的那几个字段**。
 * 模型返回的是"整份草稿"，里面大部分字段只是把它收到的原值又抄了回来；
 * 如果整份覆盖，用户在等待期间手填的内容就会被悄悄冲掉。
 */
export type DraftRecord = Record<string, unknown>

/** 从"发出去的"和"还回来的"两份草稿里，挑出模型真正动过的字段。 */
export function pickChangedFields(
  sent: DraftRecord,
  returned: DraftRecord
): DraftRecord {
  const changed: DraftRecord = {}

  for (const [key, next] of Object.entries(returned ?? {})) {
    const before = sent?.[key]

    if (key === 'servingNutrients') {
      const diff = pickChangedFields(
        (before ?? {}) as DraftRecord,
        (next ?? {}) as DraftRecord
      )
      if (Object.keys(diff).length > 0) {
        changed[key] = diff
      }
      continue
    }

    if (JSON.stringify(before) !== JSON.stringify(next)) {
      changed[key] = next
    }
  }

  return changed
}

/**
 * 把变更合进表单。表单里没有的字段一律忽略——模型不该能改它看不见的东西。
 * 营养档案按项合并，不清空其它项。
 */
export function mergeAgentDraft(form: DraftRecord, changed: DraftRecord): string[] {
  const applied: string[] = []

  for (const [key, value] of Object.entries(changed ?? {})) {
    if (!(key in form) || value === null || value === undefined) {
      continue
    }

    if (key === 'servingNutrients' && typeof value === 'object') {
      Object.assign(form.servingNutrients as DraftRecord, value as DraftRecord)
      applied.push(key)
      continue
    }

    form[key] = value
    applied.push(key)
  }

  return applied
}

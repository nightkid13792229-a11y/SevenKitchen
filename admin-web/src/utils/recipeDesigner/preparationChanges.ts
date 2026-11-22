import type { AgentMessage } from '@/api/recipeDesigner'

export interface PreparationChange {
  itemId: string
  itemName: string
  before: string
  after: string
  source: 'DRAFT' | 'HISTORY'
}

function readChanges(message: AgentMessage): PreparationChange[] {
  if (message.role !== 'TOOL' || message.toolName !== 'edit_recipe') return []
  try {
    const data = JSON.parse(message.content)?.data
    const results = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : []
    return results
      .map((result: any) => result?.preparationChange)
      .filter(
        (change: any): change is PreparationChange =>
          Boolean(change?.itemId) &&
          typeof change?.before === 'string' &&
          typeof change?.after === 'string'
      )
  } catch {
    return []
  }
}

/**
 * 累计整段对话里的预处理变更，而不是只取最后一条 edit_recipe。
 *
 * 原因：AI 连续改多条原料时，后一条可能没有预处理变化；只取最后一条会让
 * 前一条的确认卡突然消失。这里按 itemId 保留最新一次，直到用户处理。
 */
export function collectPreparationChanges(
  messages: AgentMessage[]
): PreparationChange[] {
  const byItem = new Map<string, PreparationChange>()

  for (const message of messages) {
    for (const change of readChanges(message)) {
      if (!change.before.trim() || !change.after.trim()) continue
      if (change.before.trim() === change.after.trim()) continue
      byItem.set(change.itemId, {
        itemId: change.itemId,
        itemName: String(change.itemName ?? '原料'),
        before: String(change.before),
        after: String(change.after),
        source: change.source === 'HISTORY' ? 'HISTORY' : 'DRAFT'
      })
    }
  }

  return [...byItem.values()]
}

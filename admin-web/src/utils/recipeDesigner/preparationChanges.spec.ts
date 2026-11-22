import { describe, expect, it } from 'vitest'
import type { AgentMessage } from '@/api/recipeDesigner'
import { collectPreparationChanges } from './preparationChanges'

function tool(content: unknown, seq = 1): AgentMessage {
  return {
    id: `m-${seq}`,
    seq,
    role: 'TOOL',
    toolName: 'edit_recipe',
    content: JSON.stringify(content),
    createdAt: '2026-11-22T00:00:00.000Z'
  } as AgentMessage
}

function editResult(change: Record<string, unknown> | null) {
  return {
    ok: true,
    data: [
      {
        op: 'update_item',
        ok: true,
        message: '已更新',
        ...(change ? { preparationChange: change } : {})
      }
    ]
  }
}

describe('collectPreparationChanges', () => {
  it('后面的编辑没有预处理变化时，前面的确认卡不会消失', () => {
    const changes = collectPreparationChanges([
      tool(
        editResult({
          itemId: 'item-1',
          itemName: '猪里脊',
          before: '牛霖/生/去油',
          after: '生/去筋膜切块',
          source: 'DRAFT'
        }),
        1
      ),
      tool(
        editResult({
          itemId: 'item-2',
          itemName: '大米',
          before: '生',
          after: '生',
          source: 'DRAFT'
        }),
        2
      )
    ])

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      itemId: 'item-1',
      itemName: '猪里脊',
      after: '生/去筋膜切块'
    })
  })

  it('同一原料多次变化只保留最新一条', () => {
    const changes = collectPreparationChanges([
      tool(
        editResult({
          itemId: 'item-1',
          itemName: '猪里脊',
          before: 'A',
          after: 'B',
          source: 'DRAFT'
        }),
        1
      ),
      tool(
        editResult({
          itemId: 'item-1',
          itemName: '猪里脊',
          before: 'B',
          after: 'C',
          source: 'DRAFT'
        }),
        2
      )
    ])

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ before: 'B', after: 'C' })
  })

  it('兼容 data.results，忽略坏 JSON 和无变化项', () => {
    const messages = [
      tool(
        {
          ok: true,
          data: {
            results: [
              {
                op: 'update_item',
                preparationChange: {
                  itemId: 'item-1',
                  itemName: '鸡胸',
                  before: 'A',
                  after: 'B',
                  source: 'HISTORY'
                }
              },
              {
                op: 'set_weight',
                preparationChange: {
                  itemId: 'item-2',
                  itemName: '南瓜',
                  before: 'A',
                  after: 'A',
                  source: 'DRAFT'
                }
              }
            ]
          }
        },
        1
      ),
      {
        id: 'bad',
        seq: 2,
        role: 'TOOL',
        toolName: 'edit_recipe',
        content: '{bad',
        createdAt: '2026-11-22T00:00:00.000Z'
      } as AgentMessage
    ]

    const changes = collectPreparationChanges(messages)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.source).toBe('HISTORY')
  })
})

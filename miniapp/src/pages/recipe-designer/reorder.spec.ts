import { describe, expect, it } from 'vitest'
import {
  buildReorderedItems,
  getChangedSortOrderUpdates,
  moveItem,
} from './reorder'

describe('recipe designer item reorder helpers', () => {
  it('moves an item only when the drag is committed', () => {
    const items = [
      { id: 'item-1', sortOrder: 0, name: '鸡胸' },
      { id: 'item-2', sortOrder: 1, name: '牛肉' },
      { id: 'item-3', sortOrder: 2, name: '南瓜' },
    ]

    expect(moveItem(items, 0, 2).map((item) => item.id)).toEqual([
      'item-2',
      'item-3',
      'item-1',
    ])
    expect(items.map((item) => item.id)).toEqual(['item-1', 'item-2', 'item-3'])
  })

  it('normalizes committed sort order while saving only changed rows', () => {
    const beforeItems = [
      { id: 'item-1', sortOrder: 0, name: '鸡胸' },
      { id: 'item-2', sortOrder: 1, name: '牛肉' },
      { id: 'item-3', sortOrder: 2, name: '南瓜' },
      { id: 'item-4', sortOrder: 3, name: '菠菜' },
    ]

    const afterItems = buildReorderedItems(beforeItems, [
      'item-1',
      'item-3',
      'item-2',
      'item-4',
    ])

    expect(afterItems.map((item) => [item.id, item.sortOrder])).toEqual([
      ['item-1', 0],
      ['item-3', 1],
      ['item-2', 2],
      ['item-4', 3],
    ])
    expect(getChangedSortOrderUpdates(beforeItems, afterItems)).toEqual([
      { id: 'item-3', sortOrder: 1 },
      { id: 'item-2', sortOrder: 2 },
    ])
  })
})

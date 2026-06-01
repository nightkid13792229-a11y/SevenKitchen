import { describe, expect, it } from 'vitest'
import {
  buildHistoryItemAddPayload,
  commitRedoRecipeDesignerHistory,
  commitUndoRecipeDesignerHistory,
  createAddItemHistoryEntry,
  createRecipeDesignerHistoryState,
  createRemoveItemHistoryEntry,
  createReorderItemsHistoryEntry,
  createUpdateItemHistoryEntry,
  getRedoRecipeDesignerHistoryEntry,
  getUndoRecipeDesignerHistoryEntry,
  pushRecipeDesignerHistoryEntry,
  recordHistoryItemIdReplacement,
  resolveHistoryItemId,
  resolveHistoryOrderIds,
  snapshotRecipeDesignerItem,
} from './editor-history'

describe('recipe designer editor history', () => {
  it('stores undo history, clears redo history on new edits, and limits history depth', () => {
    let state = createRecipeDesignerHistoryState()
    state = pushRecipeDesignerHistoryEntry(
      state,
      createUpdateItemHistoryEntry({
        itemId: 'item-1',
        itemName: '鸡胸',
        before: { weightG: 90 },
        after: { weightG: 110 },
      }),
      2,
    )
    state = commitUndoRecipeDesignerHistory(state, getUndoRecipeDesignerHistoryEntry(state)!)
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(1)

    state = pushRecipeDesignerHistoryEntry(
      state,
      createUpdateItemHistoryEntry({
        itemId: 'item-2',
        itemName: '鸭胸',
        before: { weightG: 70 },
        after: { weightG: 80 },
      }),
      2,
    )
    state = pushRecipeDesignerHistoryEntry(
      state,
      createUpdateItemHistoryEntry({
        itemId: 'item-3',
        itemName: '牛肉',
        before: { weightG: 50 },
        after: { weightG: 60 },
      }),
      2,
    )

    expect(state.redoStack).toHaveLength(0)
    expect(state.undoStack.map((entry) => entry.label)).toEqual(['调整鸭胸用量', '调整牛肉用量'])
  })

  it('moves entries between undo and redo stacks only after an action succeeds', () => {
    let state = createRecipeDesignerHistoryState()
    const entry = createRemoveItemHistoryEntry(
      snapshotRecipeDesignerItem({
        id: 'item-1',
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-1',
        name: '鸡胸',
        weightG: 90,
        sortOrder: 0,
      }),
    )

    state = pushRecipeDesignerHistoryEntry(state, entry)
    expect(getUndoRecipeDesignerHistoryEntry(state)).toBe(entry)

    state = commitUndoRecipeDesignerHistory(state, entry)
    expect(getUndoRecipeDesignerHistoryEntry(state)).toBeUndefined()
    expect(getRedoRecipeDesignerHistoryEntry(state)).toBe(entry)

    state = commitRedoRecipeDesignerHistory(state, entry)
    expect(getUndoRecipeDesignerHistoryEntry(state)).toBe(entry)
    expect(getRedoRecipeDesignerHistoryEntry(state)).toBeUndefined()
  })

  it('maps deleted and restored item ids for later history entries', () => {
    let state = createRecipeDesignerHistoryState()
    state = recordHistoryItemIdReplacement(state, 'old-item-id', 'new-item-id')
    state = recordHistoryItemIdReplacement(state, 'new-item-id', 'latest-item-id')

    expect(resolveHistoryItemId(state, 'old-item-id')).toBe('latest-item-id')
    expect(resolveHistoryOrderIds(state, ['old-item-id', 'other-item-id'])).toEqual([
      'latest-item-id',
      'other-item-id',
    ])
  })

  it('builds add-item payloads from item snapshots for undoing deletions and redoing additions', () => {
    const snapshot = snapshotRecipeDesignerItem({
      id: 'item-1',
      ingredient: { id: 'ingredient-1', name: '鸡胸' },
      nutritionFood: { id: 'food-1', name: 'Chicken breast' },
      weightG: 90,
      includeInAssessment: false,
      preparationMethod: '熟制',
      nutrientTargetKey: 'CA',
      nutrientTargetValue: 1.2,
      sortOrder: 3,
    })

    expect(buildHistoryItemAddPayload(snapshot)).toEqual({
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      weightG: 90,
      includeInAssessment: false,
      preparationMethod: '熟制',
      nutrientTargetKey: 'CA',
      nutrientTargetValue: 1.2,
      sortOrder: 3,
    })
  })

  it('creates distinct history entry labels for add, remove, update, and reorder operations', () => {
    const snapshot = snapshotRecipeDesignerItem({
      id: 'item-1',
      name: '鸡胸',
      nutritionFoodId: 'food-1',
      weightG: 90,
    })

    expect(createAddItemHistoryEntry(snapshot).label).toBe('添加鸡胸')
    expect(createRemoveItemHistoryEntry(snapshot).label).toBe('删除鸡胸')
    expect(
      createUpdateItemHistoryEntry({
        itemId: 'item-1',
        itemName: '鸡胸',
        before: { includeInAssessment: true },
        after: { includeInAssessment: false },
      }).label,
    ).toBe('调整鸡胸评估开关')
    expect(createReorderItemsHistoryEntry(['a', 'b'], ['b', 'a']).label).toBe('调整原料排序')
  })
})

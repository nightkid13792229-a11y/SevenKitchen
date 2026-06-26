import type { SupplementTargetPayload } from '../../api/recipe-designer'

export const RECIPE_DESIGNER_HISTORY_LIMIT = 20

export interface RecipeDesignerHistoryItemPatch {
  weightG?: number
  includeInAssessment?: boolean
  preparationMethod?: string | null
  nutrientTargetKey?: string | null
  nutrientTargetValue?: number | null
  supplementTargets?: SupplementTargetPayload[] | null
  sortOrder?: number
}

export interface RecipeDesignerHistoryItemSnapshot extends RecipeDesignerHistoryItemPatch {
  id: string
  name?: string
  ingredientName?: string
  ingredientId?: string
  nutritionFoodId?: string
}

export type RecipeDesignerHistoryEntry =
  | {
      kind: 'update-item'
      label: string
      itemId: string
      itemName: string
      before: RecipeDesignerHistoryItemPatch
      after: RecipeDesignerHistoryItemPatch
    }
  | {
      kind: 'add-item'
      label: string
      item: RecipeDesignerHistoryItemSnapshot
    }
  | {
      kind: 'remove-item'
      label: string
      item: RecipeDesignerHistoryItemSnapshot
    }
  | {
      kind: 'reorder-items'
      label: string
      beforeOrderIds: string[]
      afterOrderIds: string[]
    }

export interface RecipeDesignerHistoryState {
  undoStack: RecipeDesignerHistoryEntry[]
  redoStack: RecipeDesignerHistoryEntry[]
  itemIdMap: Record<string, string>
}

export function createRecipeDesignerHistoryState(): RecipeDesignerHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    itemIdMap: {},
  }
}

export function pushRecipeDesignerHistoryEntry(
  state: RecipeDesignerHistoryState,
  entry: RecipeDesignerHistoryEntry,
  limit = RECIPE_DESIGNER_HISTORY_LIMIT,
): RecipeDesignerHistoryState {
  const boundedUndoStack = [...state.undoStack, entry].slice(-Math.max(1, limit))
  return {
    ...state,
    undoStack: boundedUndoStack,
    redoStack: [],
  }
}

export function getUndoRecipeDesignerHistoryEntry(state: RecipeDesignerHistoryState) {
  return state.undoStack[state.undoStack.length - 1]
}

export function getRedoRecipeDesignerHistoryEntry(state: RecipeDesignerHistoryState) {
  return state.redoStack[state.redoStack.length - 1]
}

export function commitUndoRecipeDesignerHistory(
  state: RecipeDesignerHistoryState,
  entry: RecipeDesignerHistoryEntry,
): RecipeDesignerHistoryState {
  return {
    ...state,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, entry],
  }
}

export function commitRedoRecipeDesignerHistory(
  state: RecipeDesignerHistoryState,
  entry: RecipeDesignerHistoryEntry,
): RecipeDesignerHistoryState {
  return {
    ...state,
    undoStack: [...state.undoStack, entry].slice(-RECIPE_DESIGNER_HISTORY_LIMIT),
    redoStack: state.redoStack.slice(0, -1),
  }
}

export function recordHistoryItemIdReplacement(
  state: RecipeDesignerHistoryState,
  previousItemId: string,
  nextItemId: string,
): RecipeDesignerHistoryState {
  if (!previousItemId || !nextItemId || previousItemId === nextItemId) return state
  return {
    ...state,
    itemIdMap: {
      ...state.itemIdMap,
      [previousItemId]: nextItemId,
    },
  }
}

export function resolveHistoryItemId(state: RecipeDesignerHistoryState, itemId: string): string {
  let currentId = itemId
  const visited = new Set<string>()

  while (state.itemIdMap[currentId] && !visited.has(currentId)) {
    visited.add(currentId)
    currentId = state.itemIdMap[currentId]
  }

  return currentId
}

export function resolveHistoryOrderIds(state: RecipeDesignerHistoryState, itemIds: string[]) {
  return itemIds.map((itemId) => resolveHistoryItemId(state, itemId))
}

export function snapshotRecipeDesignerItem(item: Record<string, any>): RecipeDesignerHistoryItemSnapshot {
  const ingredientId = firstString(item.ingredientId, item.ingredient?.id)
  const nutritionFoodId = firstString(item.nutritionFoodId, item.nutritionFood?.id)
  const itemName = firstString(item.name, item.ingredientName, item.ingredient?.name, item.nutritionFoodName, item.nutritionFood?.name)

  return {
    id: String(item.id || ''),
    ...(itemName ? { name: itemName } : {}),
    ...(item.ingredientName ? { ingredientName: String(item.ingredientName) } : {}),
    ...(ingredientId ? { ingredientId } : {}),
    ...(nutritionFoodId ? { nutritionFoodId } : {}),
    weightG: toFiniteNumber(item.weightG, 0),
    includeInAssessment: item.includeInAssessment !== false,
    ...(item.preparationMethod !== undefined ? { preparationMethod: item.preparationMethod ?? null } : {}),
    ...(item.nutrientTargetKey !== undefined ? { nutrientTargetKey: item.nutrientTargetKey ?? null } : {}),
    ...(item.nutrientTargetValue !== undefined
      ? { nutrientTargetValue: item.nutrientTargetValue === null ? null : toFiniteNumber(item.nutrientTargetValue, 0) }
      : {}),
    ...(item.supplementTargets !== undefined ? { supplementTargets: cloneSupplementTargets(item.supplementTargets) } : {}),
    sortOrder: toFiniteNumber(item.sortOrder, 0),
  }
}

export function buildHistoryItemAddPayload(snapshot: RecipeDesignerHistoryItemSnapshot) {
  if (!snapshot.nutritionFoodId) {
    throw new Error('Cannot restore recipe designer item without nutritionFoodId')
  }

  return {
    ...(snapshot.ingredientId ? { ingredientId: snapshot.ingredientId } : {}),
    nutritionFoodId: snapshot.nutritionFoodId,
    weightG: toFiniteNumber(snapshot.weightG, 0),
    includeInAssessment: snapshot.includeInAssessment !== false,
    ...(snapshot.preparationMethod !== undefined ? { preparationMethod: snapshot.preparationMethod ?? undefined } : {}),
    ...(snapshot.nutrientTargetKey !== undefined ? { nutrientTargetKey: snapshot.nutrientTargetKey ?? undefined } : {}),
    ...(snapshot.nutrientTargetValue !== undefined && snapshot.nutrientTargetValue !== null
      ? { nutrientTargetValue: snapshot.nutrientTargetValue }
      : {}),
    ...(Array.isArray(snapshot.supplementTargets)
      ? { supplementTargets: cloneSupplementTargets(snapshot.supplementTargets) || [] }
      : {}),
    ...(snapshot.sortOrder !== undefined ? { sortOrder: toFiniteNumber(snapshot.sortOrder, 0) } : {}),
  }
}

export function createUpdateItemHistoryEntry(params: {
  itemId: string
  itemName?: string
  before: RecipeDesignerHistoryItemPatch
  after: RecipeDesignerHistoryItemPatch
}): RecipeDesignerHistoryEntry {
  const itemName = params.itemName || '原料'
  return {
    kind: 'update-item',
    label: buildUpdateItemLabel(itemName, params.before, params.after),
    itemId: params.itemId,
    itemName,
    before: compactHistoryPatch(params.before),
    after: compactHistoryPatch(params.after),
  }
}

export function createAddItemHistoryEntry(item: RecipeDesignerHistoryItemSnapshot): RecipeDesignerHistoryEntry {
  return {
    kind: 'add-item',
    label: `添加${getSnapshotItemName(item)}`,
    item,
  }
}

export function createRemoveItemHistoryEntry(item: RecipeDesignerHistoryItemSnapshot): RecipeDesignerHistoryEntry {
  return {
    kind: 'remove-item',
    label: `删除${getSnapshotItemName(item)}`,
    item,
  }
}

export function createReorderItemsHistoryEntry(
  beforeOrderIds: string[],
  afterOrderIds: string[],
): RecipeDesignerHistoryEntry {
  return {
    kind: 'reorder-items',
    label: '调整原料排序',
    beforeOrderIds: [...beforeOrderIds],
    afterOrderIds: [...afterOrderIds],
  }
}

function compactHistoryPatch(patch: RecipeDesignerHistoryItemPatch): RecipeDesignerHistoryItemPatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as RecipeDesignerHistoryItemPatch
}

function buildUpdateItemLabel(
  itemName: string,
  before: RecipeDesignerHistoryItemPatch,
  after: RecipeDesignerHistoryItemPatch,
) {
  if (before.weightG !== undefined || after.weightG !== undefined) return `调整${itemName}用量`
  if (before.includeInAssessment !== undefined || after.includeInAssessment !== undefined) {
    return `调整${itemName}评估开关`
  }
  return `调整${itemName}`
}

function getSnapshotItemName(item: RecipeDesignerHistoryItemSnapshot) {
  return item.name || item.ingredientName || '原料'
}

function firstString(...values: unknown[]) {
  const found = values.find((value) => typeof value === 'string' && value.trim())
  return typeof found === 'string' ? found.trim() : ''
}

function toFiniteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function cloneSupplementTargets(value: unknown): SupplementTargetPayload[] | null {
  if (!Array.isArray(value)) return value === null ? null : []
  return value
    .filter((target): target is Record<string, unknown> => Boolean(target) && typeof target === 'object')
    .map((target) => ({ ...target } as SupplementTargetPayload))
}

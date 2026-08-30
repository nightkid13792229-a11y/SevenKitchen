export interface ReorderableRecipeItem {
  id: string
  sortOrder?: number | null
}

export interface SortOrderUpdate {
  id: string
  sortOrder: number
}

export function moveItem<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...list]
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return [...list]
  }

  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  if (item === undefined) return [...list]
  next.splice(toIndex, 0, item)
  return next
}

export function buildReorderedItems<T extends ReorderableRecipeItem>(
  list: readonly T[],
  orderedIds: readonly string[],
): Array<T & { sortOrder: number }> {
  const itemById = new Map(list.map((item) => [item.id, item]))
  const orderedItems = orderedIds
    .map((itemId) => itemById.get(itemId))
    .filter((item): item is T => Boolean(item))
  const orderedIdSet = new Set(orderedItems.map((item) => item.id))
  const remainingItems = list.filter((item) => !orderedIdSet.has(item.id))

  return [...orderedItems, ...remainingItems].map((item, index) => ({
    ...item,
    sortOrder: index,
  }))
}

export function getChangedSortOrderUpdates<T extends ReorderableRecipeItem>(
  beforeItems: readonly T[],
  afterItems: readonly ReorderableRecipeItem[],
): SortOrderUpdate[] {
  const previousSortOrderById = new Map(
    beforeItems.map((item, index) => [item.id, toSortOrderNumber(item.sortOrder, index)]),
  )

  return afterItems
    .map((item, index) => ({
      id: item.id,
      sortOrder: toSortOrderNumber(item.sortOrder, index),
      previousSortOrder: previousSortOrderById.get(item.id),
    }))
    .filter((item) => item.previousSortOrder !== undefined && item.previousSortOrder !== item.sortOrder)
    .map(({ id, sortOrder }) => ({ id, sortOrder }))
}

function toSortOrderNumber(value: unknown, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

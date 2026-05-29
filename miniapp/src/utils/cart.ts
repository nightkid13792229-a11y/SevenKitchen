export interface CartItem {
  recipeId: string
  name: string
  coverImageUrl?: string
  description?: string
  energyDensityKcalPerKg?: number
  addedAt: string
}

const CART_STORAGE_KEY = 'sevenkitchen_cart_items'

function normalizeCartItem(item: any): CartItem | null {
  if (!item || typeof item !== 'object' || !item.recipeId) {
    return null
  }

  return {
    recipeId: String(item.recipeId),
    name: String(item.name || '未命名食谱'),
    coverImageUrl: item.coverImageUrl || '',
    description: item.description || '',
    energyDensityKcalPerKg: Number(item.energyDensityKcalPerKg) || 0,
    addedAt: item.addedAt || new Date().toISOString(),
  }
}

export function getCartItems(): CartItem[] {
  try {
    const raw = uni.getStorageSync(CART_STORAGE_KEY)
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map(normalizeCartItem).filter(Boolean) as CartItem[]
  } catch (error) {
    console.warn('[Cart] Failed to read cart items:', error)
    return []
  }
}

export function saveCartItems(items: CartItem[]): void {
  uni.setStorageSync(CART_STORAGE_KEY, JSON.stringify(items))
}

export function addCartItem(item: Omit<CartItem, 'addedAt'>): CartItem[] {
  const items = getCartItems()
  const nextItem: CartItem = {
    ...item,
    addedAt: new Date().toISOString(),
  }
  const nextItems = [
    nextItem,
    ...items.filter((existing) => existing.recipeId !== item.recipeId),
  ]
  saveCartItems(nextItems)
  return nextItems
}

export function removeCartItem(recipeId: string): CartItem[] {
  const nextItems = getCartItems().filter((item) => item.recipeId !== recipeId)
  saveCartItems(nextItems)
  return nextItems
}

export function clearCartItems(): void {
  saveCartItems([])
}

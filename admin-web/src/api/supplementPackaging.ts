import api from './index'

export type PackagingRole = 'POUCH' | 'DESICCANT' | 'LABEL'

export interface PackagingRule {
  id: string
  role: PackagingRole
  ingredientId: string
  ingredientName: string
  physicalForm: string | null
  unitPattern: string | null
  minAmount: number | null
  maxAmount: number | null
  priority: number
  enabled: boolean
  note: string | null
}

export interface PackagingIngredient {
  id: string
  name: string
  baseUnit: string
  unitDisplayLabel: string | null
  purchaseUnit: string
}

export interface PackingSummary {
  date: string
  capacity: number
  orderCount: number
  bagCount: number
  ingredientTotals: Array<{
    ingredientId: string
    name: string
    unit: string
    quantity: number
    orderCount: number
    onHand: number
    shortage: number
  }>
  packagingNeeds: Array<{
    role: PackagingRole
    name: string
    quantity: number
    configured: boolean
  }>
  missingPouchRules: string[]
  orders: Array<{
    id: string
    orderNo: string
    status: string
    bagCount: number
  }>
}

export const supplementPackagingApi = {
  listRules: (): Promise<PackagingRule[]> =>
    api.get('/admin/supplement-shop/packaging-rules'),
  listIngredients: (): Promise<PackagingIngredient[]> =>
    api.get('/admin/supplement-shop/packaging-ingredients'),
  upsertRule: (data: Partial<PackagingRule>): Promise<PackagingRule> =>
    api.put('/admin/supplement-shop/packaging-rules', data),
  deleteRule: (id: string): Promise<{ deleted: boolean }> =>
    api.delete(`/admin/supplement-shop/packaging-rules/${id}`),
  packingSummary: (date?: string): Promise<PackingSummary> =>
    api.get('/admin/supplement-shop/packing-summary', { params: { date } }),
}

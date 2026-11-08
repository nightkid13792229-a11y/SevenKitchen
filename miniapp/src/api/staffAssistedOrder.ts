import { request } from '../utils/api'

/**
 * 订单中心 · 代客下单（成品鲜食）专用接口。
 *
 * 与旧的 `staff-customer-service/assisted-order` 页面用的那组接口分开，
 * 是因为这一版要的东西不一样：食谱要能跨顾客挑、饭量和报价要能先算一遍。
 * 旧接口保持不动，等旧页面下线后自然废弃。
 */

export type AssistedRecipeOwnershipKind = 'WINDOW' | 'OWN_CUSTOM' | 'OTHER_CUSTOM'

export interface AssistedRecipeOwnership {
  kind: AssistedRecipeOwnershipKind
  customerId: string | null
  customerName: string | null
  dogId: string | null
  dogName: string | null
  breedName: string | null
}

export interface AssistedRecipeOption {
  id: string
  internalId?: string
  version: number
  name: string
  status: string
  sourceLabel: string
  coverImageUrl: string | null
  ownership: AssistedRecipeOwnership
  fit: {
    level: 'OK' | 'WARN'
    reasons: string[]
  }
}

export interface AssistedRecipeOptionsResult {
  items: AssistedRecipeOption[]
  total: number
}

export interface PortionPreview {
  dailyIntakeG: number
  perMealIntakeG: number
  mealsPerDay: number
  days: number
  totalG: number
  suggestedPackagePlan: Array<{ packageSpecG: number; packageCount: number }>
  minOrderG: number
}

export interface AssistedPricing {
  amountProduct: number
  amountShipping: number
  amountTotal: number
}

export interface AssistedOrderItemPayload {
  recipeId: string
  quantityG: number
  packageCount: number
  packageSpecG: number
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
  cycleDays: number
  dailyIntakeG?: number
}

export interface CreateAssistedOrderPayload {
  customerId: string
  dogId: string
  addressId?: string
  type?: 'FRESH_FOOD'
  targetProductionDate?: string | null
  actualAmount?: number
  amountAdjustReason?: string
  remark?: string
  recipeSource?: string
  items: AssistedOrderItemPayload[]
}

export interface CustomerAddressForAssist {
  id: string
  recipientName: string
  phone: string
  regionText: string
  detail: string
  isDefault: boolean
}

/** 搜顾客（包含无账号顾客，结果里 `isGuest` 为 true 的要标出来） */
export function searchCustomersForAssist(keyword: string) {
  return request<Array<Record<string, any>>>({
    url: '/staff/customer-service/customers/search',
    method: 'GET',
    data: { keyword },
  })
}

/** 代客下单可选的食谱：橱窗 + 全部定制（含别人家狗狗的） */
export function listAssistedRecipeOptions(
  dogId: string,
  params: { customerId: string; keyword?: string; page?: number; pageSize?: number },
) {
  return request<AssistedRecipeOptionsResult>({
    url: `/staff/customer-service/dogs/${dogId}/assisted-recipe-options`,
    method: 'GET',
    data: params,
  })
}

/** 饭量预览：按狗狗体重和食谱能量密度算每天吃多少克 */
export function previewPortion(dogId: string, recipeId: string, days: number) {
  return request<PortionPreview>({
    url: `/staff/customer-service/dogs/${dogId}/portion-preview`,
    method: 'GET',
    data: { recipeId, days },
  })
}

/** 员工报价预览（不落价格快照） */
export function previewAssistedPricing(payload: {
  customerId: string
  dogId: string
  addressId?: string
  items: AssistedOrderItemPayload[]
}) {
  return request<AssistedPricing>({
    url: '/staff/customer-service/orders/pricing-preview',
    method: 'POST',
    data: { ...payload, type: 'FRESH_FOOD' },
  })
}

/** 给顾客新增收货地址（无账号顾客只能由管理员代录） */
export function createCustomerAddress(
  customerId: string,
  payload: {
    recipientName: string
    phone: string
    region: { province: string; city: string; district: string }
    detail: string
    isDefault?: boolean
  },
) {
  return request<CustomerAddressForAssist>({
    url: `/staff/customer-service/customers/${customerId}/addresses`,
    method: 'POST',
    data: payload,
  })
}

/** 新建无账号顾客 */
export function createGuestCustomer(payload: {
  name: string
  phone?: string
  wechat?: string
  note?: string
}) {
  return request<{ customerId: string }>({
    url: '/admin/custom-recipe/guest-customers',
    method: 'POST',
    data: payload,
  })
}

/** 给无账号顾客建狗 */
export function createGuestDog(customerId: string, payload: Record<string, any>) {
  return request<{ dogId: string }>({
    url: `/admin/custom-recipe/guest-customers/${customerId}/dogs`,
    method: 'POST',
    data: payload,
  })
}

/** 下单（线下已收款） */
export function createAssistedOrder(payload: CreateAssistedOrderPayload) {
  return request<Record<string, any>>({
    url: '/staff/customer-service/orders/assisted',
    method: 'POST',
    data: { type: 'FRESH_FOOD', ...payload },
  })
}

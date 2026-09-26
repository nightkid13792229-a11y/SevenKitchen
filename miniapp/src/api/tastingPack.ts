/**
 * 试吃装（现货）API
 *
 * 试吃装是提前做好、放在库存里卖的现货：下单只扣库存，不排产。
 * 价格按下单时的**库存批次成本 × 试吃倍率**实时算出，
 * 报价接口会返回一个价格快照 ID，下单时只认这个 ID（前端改不了价）。
 */

import { request } from '../utils/api'

export interface TastingPackDish {
  id: string
  recipeId: string
  sortOrder: number
  name: string
  coverImageUrl: string | null
  sellingPoint: string | null
}

export interface TastingPack {
  id: string
  code: string
  name: string
  subtitle: string | null
  coverImageUrl: string | null
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  bagsPerRecipe: number
  packSpecG: number
  manualPrice: number | null
  maxSetsOverride: number | null
  totalNetWeightG: number
  totalPacks: number
  items: TastingPackDish[]
  /** 可售套数（不含过期批次） */
  availableSets: number
  /** 单次限购 */
  maxSetsPerOrder: number
  /** 一套实收 */
  unitPrice: number
  /** 一套划线价 */
  unitListPrice: number
  soldOut: boolean
}

export interface TastingPackStatus {
  enabled: boolean
  maxSetsPerOrder: number
}

export interface TastingPackQuote {
  snapshotId: string
  sets: number
  unitPrice: number
  unitListPrice: number
  amountProduct: number
  amountShipping: number
  amountTotal: number
  availableSets: number
  maxSetsPerOrder: number
}

/** 试吃装是否开放（首页据此决定要不要展示入口） */
export function fetchTastingPackStatus() {
  return request<TastingPackStatus>({
    url: '/tasting-packs/status',
    method: 'GET',
    suppressErrorToast: true,
  })
}

/** 试吃装货架 */
export function fetchTastingPacks() {
  return request<{ items: TastingPack[]; enabled: boolean }>({
    url: '/tasting-packs',
    method: 'GET',
    suppressErrorToast: true,
  })
}

/** 试吃装详情（按 id 或面客编号） */
export function fetchTastingPackDetail(idOrCode: string) {
  return request<{ enabled: boolean; pack: TastingPack | null }>({
    url: `/tasting-packs/${encodeURIComponent(idOrCode)}`,
    method: 'GET',
    suppressErrorToast: true,
  })
}

/** 生成购买报价（含价格快照） */
export function quoteTastingPack(params: {
  idOrCode: string
  sets: number
  addressId?: string | null
}) {
  return request<TastingPackQuote>({
    url: `/tasting-packs/${encodeURIComponent(params.idOrCode)}/quote`,
    method: 'POST',
    data: {
      sets: params.sets,
      addressId: params.addressId ?? null,
    },
    suppressErrorToast: true,
  })
}

/**
 * Inventory API
 * 员工端库存管理相关API调用
 */

import { request } from '../../../utils/api';

export type InventoryIngredientType = 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
export type InventoryStockStatus =
  | 'NO_POLICY'
  | 'SUFFICIENT'
  | 'LOW_STOCK'
  | 'NEEDS_REPLENISHMENT';
export type InventorySourceType =
  | 'KITCHEN_TASK'
  | 'PURCHASE_RECORD'
  | 'MANUAL_ADJUSTMENT'
  | 'STOCKTAKE';
export type InventoryStocktakeStatus = 'DRAFT' | 'SUBMITTED' | 'APPLIED' | 'REJECTED';

export interface InventoryOverviewItem {
  id: string;
  name: string;
  type: InventoryIngredientType;
  procurementStrategy: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';
  baseUnit: 'G' | 'ML' | 'PCS';
  stockUnitLabel: string;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  unitDisplayLabel?: string | null;
  purchaseChannel?: string | null;
  productModel?: string | null;
  procurementSkuId?: string;
  procurementSkuName?: string;
  currentPricePerPurchaseUnit: number;
  effectivePricePerPurchaseUnit?: number | null;
  currentStock: number;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  stockStatus: InventoryStockStatus;
  suggestedBaseQuantity: number;
  suggestedPurchaseQuantity: number;
  suggestedEstimatedCost: number;
  suggestedProductId?: string;
  suggestedProductName?: string;
}

export interface InventoryLedgerItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  procurementSkuId?: string | null;
  procurementSkuName?: string | null;
  deltaG: number;
  stockUnitLabel: string;
  sourceType: InventorySourceType;
  sourceId: string;
  sourceLabel: string;
  sourceDescription: string | null;
  quantityBeforeG: number | null;
  quantityAfterG: number | null;
  expectedQuantityG: number | null;
  countedQuantityG: number | null;
  createdAt: string;
}

export interface InventoryStocktakeLineItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientType?: string | null;
  procurementSkuId?: string | null;
  procurementSkuName?: string | null;
  stockUnitLabel: string;
  expectedQuantityG: number;
  countedQuantityG: number | null;
  deltaG: number | null;
  isCounted: boolean;
  countedAt?: string | null;
  withinTolerance: boolean | null;
}

export interface InventoryStocktakeItem {
  id: string;
  status: InventoryStocktakeStatus;
  note: string | null;
  createdAt: string;
  appliedAt: string | null;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  lineCount: number;
  countedCount?: number;
  varianceCount: number;
  totalAbsDeltaG: number;
  lines: InventoryStocktakeLineItem[];
}

export interface StocktakeDraftItem {
  id: string;
  status: InventoryStocktakeStatus;
  note: string | null;
  createdAt: string;
  lineCount: number;
  countedCount: number;
  lines: Array<{
    id: string;
    ingredientId: string;
    ingredientName: string;
    ingredientType?: string | null;
    stockUnitLabel: string;
    countedQuantityG: number | null;
    isCounted: boolean;
    countedAt?: string | null;
  }>;
}

export interface StocktakePreviewItem {
  id: string;
  status: InventoryStocktakeStatus;
  countedCount: number;
  skippedCount: number;
  withinCount: number;
  overCount: number;
  lines: Array<{
    ingredientId: string;
    ingredientName: string;
    ingredientType?: string | null;
    stockUnitLabel: string;
    expectedQuantityG: number;
    countedQuantityG: number | null;
    deltaG: number | null;
    isCounted: boolean;
    withinTolerance: boolean | null;
  }>;
}

export function getInventoryOverview(params?: {
  keyword?: string;
  type?: InventoryIngredientType;
  onlyNeedsReplenishment?: boolean;
}) {
  return request<InventoryOverviewItem[]>({
    url: '/staff/inventory/overview',
    method: 'GET',
    data: params,
  });
}

export function getInventoryLedger(params?: {
  ingredientId?: string;
  limit?: number;
}) {
  return request<InventoryLedgerItem[]>({
    url: '/staff/inventory/ledger',
    method: 'GET',
    data: params,
  });
}

export function getInventoryStocktakes(params?: { limit?: number }) {
  return request<InventoryStocktakeItem[]>({
    url: '/staff/inventory/stocktakes',
    method: 'GET',
    data: params,
  });
}

export function getStocktakeDraft() {
  return request<StocktakeDraftItem | null>({
    url: '/staff/inventory/stocktakes/draft',
    method: 'GET',
  });
}

export function startStocktake(note?: string) {
  return request<StocktakeDraftItem>({
    url: '/staff/inventory/stocktakes',
    method: 'POST',
    data: note ? { note } : {},
  });
}

export function getStocktake(id: string) {
  return request<StocktakeDraftItem | InventoryStocktakeItem>({
    url: `/staff/inventory/stocktakes/${id}`,
    method: 'GET',
  });
}

export function saveStocktakeLines(
  id: string,
  lines: Array<{ ingredientId: string; countedQuantityG: number | null }>,
) {
  return request<StocktakeDraftItem>({
    url: `/staff/inventory/stocktakes/${id}/lines`,
    method: 'PATCH',
    data: { lines },
  });
}

export function previewStocktake(id: string, confirmPartial = false) {
  return request<StocktakePreviewItem>({
    url: `/staff/inventory/stocktakes/${id}/preview`,
    method: 'GET',
    data: confirmPartial ? { confirmPartial: 'true' } : {},
  });
}

export function submitStocktake(id: string, note?: string) {
  return request<InventoryStocktakeItem>({
    url: `/staff/inventory/stocktakes/${id}/submit`,
    method: 'POST',
    data: { note },
  });
}

export function cancelStocktake(id: string) {
  return request<{ cancelled: boolean }>({
    url: `/staff/inventory/stocktakes/${id}`,
    method: 'DELETE',
  });
}

export function reviewStocktake(
  id: string,
  data: { approve: boolean; note?: string },
) {
  return request<InventoryStocktakeItem>({
    url: `/admin/inventory/stocktakes/${id}/review`,
    method: 'POST',
    data,
  });
}

export type InventoryAdjustmentCategory =
  | 'INTERNAL_USE'
  | 'EXPIRED'
  | 'DAMAGED'
  | 'OTHER';

export interface InventoryAdjustmentItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  stockUnitLabel: string;
  deltaG: number;
  category: InventoryAdjustmentCategory;
  reviewStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  costAmount: number | null;
  note: string | null;
  createdAt: string;
}

export function createInventoryAdjustment(data: {
  ingredientId: string;
  quantity: number;
  category: InventoryAdjustmentCategory;
  note?: string;
}) {
  return request<InventoryAdjustmentItem>({
    url: '/staff/inventory/adjustments',
    method: 'POST',
    data,
  });
}

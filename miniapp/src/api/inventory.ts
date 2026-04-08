/**
 * Inventory API
 * 员工端库存管理相关API调用
 */

import { request } from '../utils/api';

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
export type InventoryStocktakeStatus = 'DRAFT' | 'APPLIED';

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
  stockUnitLabel: string;
  expectedQuantityG: number;
  countedQuantityG: number;
  deltaG: number;
}

export interface InventoryStocktakeItem {
  id: string;
  status: InventoryStocktakeStatus;
  note: string | null;
  createdAt: string;
  appliedAt: string | null;
  lineCount: number;
  varianceCount: number;
  totalAbsDeltaG: number;
  lines: InventoryStocktakeLineItem[];
}

export interface CreateInventoryStocktakeLinePayload {
  ingredientId: string;
  countedQuantityG: number;
}

export interface CreateInventoryStocktakePayload {
  note?: string;
  applyImmediately?: boolean;
  lines: CreateInventoryStocktakeLinePayload[];
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

export function getInventoryStocktakes(params?: {
  limit?: number;
}) {
  return request<InventoryStocktakeItem[]>({
    url: '/staff/inventory/stocktakes',
    method: 'GET',
    data: params,
  });
}

export function createInventoryStocktake(data: CreateInventoryStocktakePayload) {
  return request<InventoryStocktakeItem>({
    url: '/staff/inventory/stocktakes',
    method: 'POST',
    data,
  });
}

export function applyInventoryStocktake(stocktakeId: string) {
  return request<InventoryStocktakeItem>({
    url: `/staff/inventory/stocktakes/${stocktakeId}/apply`,
    method: 'POST',
  });
}

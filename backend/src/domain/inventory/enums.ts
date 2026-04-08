/**
 * Inventory Domain Enums
 * Phase 8.13: Inventory Deduction
 */

export enum InventorySourceType {
  KITCHEN_TASK = 'KITCHEN_TASK',
  PURCHASE_RECORD = 'PURCHASE_RECORD',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  STOCKTAKE = 'STOCKTAKE',
}

export enum InventoryAdjustmentMode {
  DELTA = 'DELTA',
  SET = 'SET',
}

export enum InventoryStocktakeStatus {
  DRAFT = 'DRAFT',
  APPLIED = 'APPLIED',
}

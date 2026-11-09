/**
 * Inventory Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 * Phase 8.13: Inventory Deduction
 */

import { InventoryLedgerEntry } from './inventory-ledger-entry.entity';
import { InventorySourceType } from './enums';

export interface InventoryRepository {
  /**
   * Record multiple ledger entries atomically
   * Must handle unique constraint violations gracefully
   */
  recordEntries(entries: InventoryLedgerEntry[]): Promise<void>;

  /**
   * Check if a ledger entry already exists for the given source and ingredient
   * Used for idempotency check
   */
  existsBySourceAndIngredient(
    sourceType: InventorySourceType,
    sourceId: string,
    ingredientId: string,
  ): Promise<boolean>;

  /**
   * 同上，但把"第几次写入"算进去。
   * 采购撤回后再完成时，同一采购记录会有多个版本，不能只看来源+原料。
   */
  existsBySourceVersionAndIngredient(
    sourceType: InventorySourceType,
    sourceId: string,
    sourceVersion: number,
    ingredientId: string,
  ): Promise<boolean>;

  /**
   * Get current balance for an ingredient (derived from SUM(delta_g))
   * Returns 0 if no entries exist
   */
  getCurrentBalanceByIngredient(ingredientId: string): Promise<number>;

  /**
   * Get all ledger entries for a given source (for debugging/audit)
   */
  findBySource(
    sourceType: InventorySourceType,
    sourceId: string,
  ): Promise<InventoryLedgerEntry[]>;
}

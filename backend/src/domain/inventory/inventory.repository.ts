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

/**
 * Inventory Service
 * Phase 8.13: Inventory Deduction
 */

import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import type { InventoryRepository } from '../../domain/inventory/inventory.repository';
import { InventoryLedgerEntry, InventorySourceType } from '../../domain/inventory';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import { PackagingUnitStatus } from '../../domain/production/enums';
import { PRODUCTION_BATCH_REPOSITORY } from '../production/production.service';
import { randomUUID } from 'crypto';

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: InventoryRepository,
    @Inject(PRODUCTION_BATCH_REPOSITORY)
    private readonly productionRepository: ProductionBatchRepository,
  ) {}

  /**
   * Deduct inventory from a completed kitchen task
   * Phase 8.13: Uses actual_g from ingredientsUsageSnapshot
   * 
   * CRITICAL: Must be idempotent - same PackagingUnit cannot deduct twice
   */
  async deductFromKitchenTask(packagingUnitId: string): Promise<void> {
    // Step 1: Load PackagingUnit
    const unit = await this.productionRepository.findPackagingUnitById(
      packagingUnitId,
    );
    if (!unit) {
      throw new BadRequestException(
        `PackagingUnit not found: ${packagingUnitId}`,
      );
    }

    // Step 2: Validate status is COMPLETED
    if (unit.status !== PackagingUnitStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot deduct inventory: PackagingUnit status is ${unit.status}, must be COMPLETED`,
      );
    }

    // Step 3: Validate ingredientsUsageSnapshot exists
    if (!unit.ingredientsUsageSnapshot) {
      throw new BadRequestException(
        `Cannot deduct inventory: ingredientsUsageSnapshot is missing for PackagingUnit ${packagingUnitId}`,
      );
    }

    // Step 4: Check idempotency for each ingredient
    const snapshot = unit.ingredientsUsageSnapshot;
    const ingredientIds = Object.keys(snapshot);

    for (const ingredientId of ingredientIds) {
      const exists = await this.inventoryRepository.existsBySourceAndIngredient(
        InventorySourceType.KITCHEN_TASK,
        packagingUnitId,
        ingredientId,
      );

      if (exists) {
        // If any ingredient already has a deduction, skip the entire operation
        // This ensures idempotency at the PackagingUnit level
        this.logger.warn(
          `Inventory deduction already exists for PackagingUnit ${packagingUnitId}, ingredient ${ingredientId}. Skipping.`,
        );
        return; // Idempotent: return success if already deducted
      }
    }

    // Step 5: Create ledger entries from actual_g (NOT required_g)
    // CRITICAL: Snapshot integrity - we only use actual_g, never read Recipe table
    const ledgerEntries: InventoryLedgerEntry[] = [];

    for (const [ingredientId, usage] of Object.entries(snapshot)) {
      // Skip entries with zero or negative actual_g
      if (usage.actual_g <= 0) {
        this.logger.warn(
          `Skipping ingredient ${ingredientId}: actual_g is ${usage.actual_g} (must be positive)`,
        );
        continue;
      }

      const entry = new InventoryLedgerEntry(
        randomUUID(),
        ingredientId,
        -usage.actual_g, // NEGATIVE for deduction
        InventorySourceType.KITCHEN_TASK,
        packagingUnitId,
        new Date(),
      );

      ledgerEntries.push(entry);
    }

    if (ledgerEntries.length === 0) {
      this.logger.warn(
        `No valid ledger entries to create for PackagingUnit ${packagingUnitId}`,
      );
      return;
    }

    // Step 6: Record entries atomically
    // Repository handles unique constraint violations gracefully with skipDuplicates
    try {
      await this.inventoryRepository.recordEntries(ledgerEntries);
      this.logger.log(
        `Successfully deducted inventory for PackagingUnit ${packagingUnitId}: ${ledgerEntries.length} entries`,
      );
    } catch (error: any) {
      // Handle unique constraint violation (should not happen due to idempotency check, but be safe)
      if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
        this.logger.warn(
          `Unique constraint violation for PackagingUnit ${packagingUnitId}. Deduction may already exist.`,
        );
        // Idempotent: treat as success
        return;
      }
      throw error;
    }
  }

  /**
   * Get current inventory balance for an ingredient
   * Phase 8.13: Derived from ledger SUM(delta_g)
   */
  async getBalanceByIngredient(ingredientId: string): Promise<number> {
    return this.inventoryRepository.getCurrentBalanceByIngredient(ingredientId);
  }

  /**
   * Get all ledger entries for a PackagingUnit (for debugging/audit)
   */
  async getEntriesByPackagingUnit(
    packagingUnitId: string,
  ): Promise<InventoryLedgerEntry[]> {
    return this.inventoryRepository.findBySource(
      InventorySourceType.KITCHEN_TASK,
      packagingUnitId,
    );
  }
}

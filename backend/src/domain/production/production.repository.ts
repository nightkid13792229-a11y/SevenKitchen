/**
 * Production Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { ProductionBatch } from './production-batch.entity';
import { PackagingUnit } from './packaging-unit.entity';

export interface ProductionBatchRepository {
  findById(id: string): Promise<ProductionBatch | null>;
  findAll(): Promise<ProductionBatch[]>;
  findByProductionDate(date: Date): Promise<ProductionBatch[]>;
  findByStatus(status: string): Promise<ProductionBatch[]>;
  save(batch: ProductionBatch): Promise<ProductionBatch>;
  // Phase 8.11: Allocation lock
  allocateOrderItems(orderItemIds: string[], productionBatchId: string): Promise<number>;
  // Phase 8.12: Kitchen task operations
  findPackagingUnitById(id: string): Promise<PackagingUnit | null>;
  updatePackagingUnit(unit: PackagingUnit): Promise<PackagingUnit>;
  findBatchesByPackagingUnitStatus(status: string): Promise<ProductionBatch[]>;
  // Phase 8.14: Batch completion check (database-based, not domain-based)
  areAllUnitsCompleted(batchId: string): Promise<boolean>;
}


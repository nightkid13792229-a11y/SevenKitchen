/**
 * Production Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { ProductionBatch } from './production-batch.entity';
import { PackagingUnit } from './packaging-unit.entity';
import { OrderItem } from '../order/order-item.entity';

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
  // Delete production batch
  deallocateOrderItems(orderItemIds: string[]): Promise<void>;
  delete(batchId: string): Promise<void>;
  // Find order items by IDs
  findOrderItemsByIds(orderItemIds: string[]): Promise<OrderItem[]>;
  // Find first completed packaging unit for an order
  findFirstCompletedByOrderId(orderId: string): Promise<PackagingUnit | null>;
}


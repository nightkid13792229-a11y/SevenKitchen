/**
 * Production Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { ProductionBatch } from './production-batch.entity';

export interface ProductionBatchRepository {
  findById(id: string): Promise<ProductionBatch | null>;
  findByProductionDate(date: Date): Promise<ProductionBatch[]>;
  findByStatus(status: string): Promise<ProductionBatch[]>;
  save(batch: ProductionBatch): Promise<ProductionBatch>;
  // Phase 8.11: Allocation lock
  allocateOrderItems(orderItemIds: string[], productionBatchId: string): Promise<number>;
}

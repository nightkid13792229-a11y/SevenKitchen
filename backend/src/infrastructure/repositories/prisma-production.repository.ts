/**
 * Prisma Production Repository Implementation
 * Phase 8.10: Production & Packaging MVP
 */

import { Injectable, Logger } from '@nestjs/common';
import { ProductionBatchRepository } from '../../domain/production/production.repository';
import { ProductionBatch } from '../../domain/production/production-batch.entity';
import { PackagingUnit } from '../../domain/production/packaging-unit.entity';
import { ProductionBatchStatus } from '../../domain/production/enums';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaProductionRepository implements ProductionBatchRepository {
  private readonly logger = new Logger(PrismaProductionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProductionBatch | null> {
    const record = await this.prisma.productionBatch.findUnique({
      where: { id },
      include: { packagingUnits: true },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findByProductionDate(date: Date): Promise<ProductionBatch[]> {
    // Extract date part (YYYY-MM-DD) for comparison
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    const records = await this.prisma.productionBatch.findMany({
      where: {
        productionDate: {
          gte: dateStart,
          lte: dateEnd,
        },
      },
      include: { packagingUnits: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r: any) => this.mapToDomain(r));
  }

  async findByStatus(status: string): Promise<ProductionBatch[]> {
    const records = await this.prisma.productionBatch.findMany({
      where: { status: status as any },
      include: { packagingUnits: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r: any) => this.mapToDomain(r));
  }

  /**
   * Allocate OrderItems to a production batch (Phase 8.11)
   * Updates OrderItems with productionBatchId and allocatedAt atomically
   * Only updates items that are not yet allocated (productionBatchId is null)
   */
  async allocateOrderItems(
    orderItemIds: string[],
    productionBatchId: string,
  ): Promise<number> {
    if (orderItemIds.length === 0) {
      return 0;
    }

    // Use raw SQL to ensure atomic allocation and avoid Prisma type issues
    // Only update items that are not yet allocated (productionBatchId is null)
    const now = new Date();
    // Build parameterized query with proper escaping
    const placeholders = orderItemIds.map((_, i) => `$${i + 3}`).join(', ');
    
    const query = `
      UPDATE "order_item" 
      SET "production_batch_id" = $1::text, "allocated_at" = $2::timestamp
      WHERE "id" IN (${placeholders})
      AND "production_batch_id" IS NULL
    `;
    
    const result = await this.prisma.$executeRawUnsafe(
      query,
      productionBatchId,
      now,
      ...orderItemIds,
    );

    const updatedCount = typeof result === 'number' ? result : 0;
    this.logger.debug(
      `Allocated ${updatedCount} of ${orderItemIds.length} OrderItems to batch ${productionBatchId}`,
    );

    return updatedCount;
  }

  async save(batch: ProductionBatch): Promise<ProductionBatch> {
    const existing = await this.prisma.productionBatch.findUnique({
      where: { id: batch.id },
      select: { id: true },
    });

    if (!existing) {
      // Create new batch with packaging units in transaction
      await this.prisma.$transaction(async (tx: any) => {
        // Step 1: Create ProductionBatch
        await tx.productionBatch.create({
          data: {
            id: batch.id,
            productionDate: batch.productionDate,
            status: batch.status as any,
          },
        });

        // Step 2: Create PackagingUnits
        if (batch.packagingUnits.length > 0) {
          await (tx as any).packagingUnit.createMany({
            data: batch.packagingUnits.map((unit) => ({
              id: unit.id,
              productionBatchId: batch.id, // Set the batchId here
              recipeSnapshot: unit.recipeSnapshot as any,
              totalProductionG: unit.totalProductionG,
              sourceOrderItemIds: unit.sourceOrderItemIds,
              // Phase 8.12: Kitchen task fields (defaults)
              status: (unit.status as any) || 'PENDING',
              ingredientsUsageSnapshot: unit.ingredientsUsageSnapshot
                ? (unit.ingredientsUsageSnapshot as any)
                : null,
              photosRaw: unit.photosRaw || [],
              photosCooked: unit.photosCooked || [],
              photosPortioned: unit.photosPortioned || [],
            })),
          });
          this.logger.debug(
            `Created ${batch.packagingUnits.length} packaging units for batch ${batch.id}`,
          );
        } else {
          this.logger.warn(`Batch ${batch.id} has no packaging units to create`);
        }
      });
    } else {
      // Update: only status can be updated (immutability for productionDate and packagingUnits)
      await this.prisma.productionBatch.update({
        where: { id: batch.id },
        data: {
          status: batch.status as any,
        },
      });
    }

    // Return fresh copy with packaging units included
    const saved = await this.prisma.productionBatch.findUnique({
      where: { id: batch.id },
      include: { packagingUnits: true },
    });
    if (!saved) {
      this.logger.error(`Failed to load batch after save: ${batch.id}`);
      return batch;
    }
    return this.mapToDomain(saved);
  }

  // Phase 8.12: Kitchen task operations
  async findPackagingUnitById(id: string): Promise<PackagingUnit | null> {
    const record = await (this.prisma as any).packagingUnit.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.mapPackagingUnitToDomain(record);
  }

  async updatePackagingUnit(unit: PackagingUnit): Promise<PackagingUnit> {
    await (this.prisma as any).packagingUnit.update({
      where: { id: unit.id },
      data: {
        status: unit.status as any,
        ingredientsUsageSnapshot: unit.ingredientsUsageSnapshot
          ? (unit.ingredientsUsageSnapshot as any)
          : null,
        photosRaw: unit.photosRaw,
        photosCooked: unit.photosCooked,
        photosPortioned: unit.photosPortioned,
      },
    });

    const saved = await (this.prisma as any).packagingUnit.findUnique({
      where: { id: unit.id },
    });
    if (!saved) {
      this.logger.error(`Failed to load packaging unit after update: ${unit.id}`);
      return unit;
    }
    return this.mapPackagingUnitToDomain(saved);
  }

  async findBatchesByPackagingUnitStatus(
    status: string,
  ): Promise<ProductionBatch[]> {
    try {
      // Find all packaging units with the given status, then get their batches
      // Use raw query with proper enum casting for PostgreSQL
      const batchIds = await this.prisma.$queryRawUnsafe<Array<{ production_batch_id: string }>>(
        `SELECT DISTINCT production_batch_id 
         FROM packaging_unit 
         WHERE status = $1::"PackagingUnitStatus"`,
        status,
      );

      // Load batches by IDs
      const batchIdsList = batchIds.map((row) => row.production_batch_id);
      if (batchIdsList.length === 0) {
        return [];
      }

      const batches = await this.prisma.productionBatch.findMany({
        where: { id: { in: batchIdsList } },
        include: { packagingUnits: true },
      });

      return batches.map((b) => this.mapToDomain(b));
    } catch (error: any) {
      this.logger.error('Error in findBatchesByPackagingUnitStatus:', {
        message: error?.message,
        stack: error?.stack,
        status: status,
      });
      throw error;
    }
  }

  private mapPackagingUnitToDomain(pu: any): PackagingUnit {
    // Ensure sourceOrderItemIds is always an array
    let sourceOrderItemIds: string[] = [];
    if (Array.isArray(pu.sourceOrderItemIds)) {
      sourceOrderItemIds = pu.sourceOrderItemIds;
    } else if (typeof pu.sourceOrderItemIds === 'string') {
      try {
        const parsed = JSON.parse(pu.sourceOrderItemIds);
        sourceOrderItemIds = Array.isArray(parsed) ? parsed : [];
      } catch {
        sourceOrderItemIds = pu.sourceOrderItemIds ? [pu.sourceOrderItemIds] : [];
      }
    }

    // Phase 8.12: Handle photos arrays
    const photosRaw = Array.isArray(pu.photosRaw) ? pu.photosRaw : [];
    const photosCooked = Array.isArray(pu.photosCooked) ? pu.photosCooked : [];
    const photosPortioned = Array.isArray(pu.photosPortioned)
      ? pu.photosPortioned
      : [];

    // Phase 8.12: Handle ingredients usage snapshot
    let ingredientsUsageSnapshot = null;
    if (pu.ingredientsUsageSnapshot) {
      try {
        ingredientsUsageSnapshot =
          typeof pu.ingredientsUsageSnapshot === 'string'
            ? JSON.parse(pu.ingredientsUsageSnapshot)
            : pu.ingredientsUsageSnapshot;
      } catch {
        ingredientsUsageSnapshot = null;
      }
    }

    return new PackagingUnit(
      pu.id,
      pu.productionBatchId,
      pu.recipeSnapshot as unknown as RecipeSnapshot,
      pu.totalProductionG,
      sourceOrderItemIds,
      pu.createdAt,
      (pu.status as any) || 'PENDING',
      ingredientsUsageSnapshot,
      photosRaw,
      photosCooked,
      photosPortioned,
      pu.updatedAt ? new Date(pu.updatedAt) : new Date(),
    );
  }

  private mapToDomain(record: any): ProductionBatch {
    const packagingUnits = (record.packagingUnits || []).map(
      (pu: any) => {
        // Ensure sourceOrderItemIds is always an array
        // Prisma String[] should already be an array, but handle edge cases
        let sourceOrderItemIds: string[] = [];
        if (Array.isArray(pu.sourceOrderItemIds)) {
          sourceOrderItemIds = pu.sourceOrderItemIds;
        } else if (typeof pu.sourceOrderItemIds === 'string') {
          // If it's a JSON string, parse it
          try {
            const parsed = JSON.parse(pu.sourceOrderItemIds);
            sourceOrderItemIds = Array.isArray(parsed) ? parsed : [];
          } catch {
            // If parsing fails, treat as single item or empty
            sourceOrderItemIds = pu.sourceOrderItemIds ? [pu.sourceOrderItemIds] : [];
          }
        }

        // Phase 8.12: Handle photos arrays
        const photosRaw = Array.isArray(pu.photosRaw) ? pu.photosRaw : [];
        const photosCooked = Array.isArray(pu.photosCooked) ? pu.photosCooked : [];
        const photosPortioned = Array.isArray(pu.photosPortioned)
          ? pu.photosPortioned
          : [];

        // Phase 8.12: Handle ingredients usage snapshot
        let ingredientsUsageSnapshot = null;
        if (pu.ingredientsUsageSnapshot) {
          try {
            ingredientsUsageSnapshot =
              typeof pu.ingredientsUsageSnapshot === 'string'
                ? JSON.parse(pu.ingredientsUsageSnapshot)
                : pu.ingredientsUsageSnapshot;
          } catch {
            ingredientsUsageSnapshot = null;
          }
        }
        
        return new PackagingUnit(
          pu.id,
          pu.productionBatchId,
          pu.recipeSnapshot as unknown as RecipeSnapshot,
          pu.totalProductionG,
          sourceOrderItemIds,
          pu.createdAt,
          // Phase 8.12: Kitchen task fields
          (pu.status as any) || 'PENDING',
          ingredientsUsageSnapshot,
          photosRaw,
          photosCooked,
          photosPortioned,
          pu.updatedAt ? new Date(pu.updatedAt) : new Date(),
        );
      },
    );

    return new ProductionBatch(
      record.id,
      record.productionDate,
      record.status as ProductionBatchStatus,
      packagingUnits,
      record.createdAt,
    );
  }
}

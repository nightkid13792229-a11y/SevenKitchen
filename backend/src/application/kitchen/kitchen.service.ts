/**
 * Kitchen Service
 * Phase 8.12: Kitchen Task Data Capture MVP
 */

import { Injectable, Inject, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import { PackagingUnit, PackagingUnitStatus, type IngredientsUsageSnapshot } from '../../domain/production';
import { PRODUCTION_BATCH_REPOSITORY } from '../production/production.service';
import { InventoryService } from '../inventory/inventory.service';

export interface UpdateTaskDto {
  actualWeightG?: number; // Single actual weight (alternative to ingredients_actual[])
  ingredientsActual?: Array<{
    ingredientId: string;
    actual_g: number;
  }>;
  photosRaw?: string[];
  photosCooked?: string[];
  photosPortioned?: string[];
  status?: PackagingUnitStatus;
}

export interface KitchenBatchSummaryDto {
  id: string;
  productionDate: string;
  status: string;
  taskCount: number;
  tasks: Array<{
    id: string;
    recipeSnapshotId: string;
    recipeName: string;
    totalProductionG: number;
    status: string;
    hasPhotos: boolean;
    hasActualUsage: boolean;
  }>;
}

export interface KitchenBatchDetailDto {
  id: string;
  productionDate: string;
  status: string;
  tasks: Array<{
    id: string;
    recipeSnapshotId: string;
    recipeName: string;
    totalProductionG: number;
    status: string;
    ingredientsUsageSnapshot: IngredientsUsageSnapshot | null;
    photosRaw: string[];
    photosCooked: string[];
    photosPortioned: string[];
    sourceOrderItemIds: string[];
  }>;
}

@Injectable()
export class KitchenService {
  private readonly logger = new Logger(KitchenService.name);

  constructor(
    @Inject(PRODUCTION_BATCH_REPOSITORY)
    private readonly productionRepository: ProductionBatchRepository,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * List production batches by packaging unit status
   * Phase 8.12: Kitchen task listing
   */
  async listBatchesByStatus(
    status?: PackagingUnitStatus,
  ): Promise<KitchenBatchSummaryDto[]> {
    let batches;
    if (status) {
      batches = await this.productionRepository.findBatchesByPackagingUnitStatus(
        status,
      );
    } else {
      // If no status filter, get all batches (could be optimized)
      batches = await this.productionRepository.findByStatus('PLANNED');
    }

    return batches.map((batch) => ({
      id: batch.id,
      productionDate: batch.productionDate.toISOString().split('T')[0],
      status: batch.status,
      taskCount: batch.packagingUnits.length,
      tasks: batch.packagingUnits.map((unit) => ({
        id: unit.id,
        recipeSnapshotId: unit.recipeSnapshot.id,
        recipeName: unit.recipeSnapshot.name,
        totalProductionG: unit.totalProductionG,
        status: unit.status,
        hasPhotos:
          unit.photosRaw.length > 0 ||
          unit.photosCooked.length > 0 ||
          unit.photosPortioned.length > 0,
        hasActualUsage: unit.ingredientsUsageSnapshot !== null,
      })),
    }));
  }

  /**
   * Get batch detail with full task information
   * Phase 8.12: Kitchen batch detail view
   */
  async getBatchDetail(batchId: string): Promise<KitchenBatchDetailDto> {
    const batch = await this.productionRepository.findById(batchId);
    if (!batch) {
      throw new NotFoundException(`Production batch not found: ${batchId}`);
    }

    return {
      id: batch.id,
      productionDate: batch.productionDate.toISOString().split('T')[0],
      status: batch.status,
      tasks: batch.packagingUnits.map((unit) => ({
        id: unit.id,
        recipeSnapshotId: unit.recipeSnapshot.id,
        recipeName: unit.recipeSnapshot.name,
        totalProductionG: unit.totalProductionG,
        status: unit.status,
        ingredientsUsageSnapshot: unit.ingredientsUsageSnapshot,
        photosRaw: unit.photosRaw,
        photosCooked: unit.photosCooked,
        photosPortioned: unit.photosPortioned,
        sourceOrderItemIds: unit.sourceOrderItemIds,
      })),
    };
  }

  /**
   * Update task (packaging unit) with actual usage and photos
   * Phase 8.12: Kitchen task update
   * 
   * CRITICAL: Required weights must be calculated from recipeSnapshot, NOT from Recipe table
   */
  async updateTask(
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<PackagingUnit> {
    const unit = await this.productionRepository.findPackagingUnitById(taskId);
    if (!unit) {
      throw new NotFoundException(`Task (PackagingUnit) not found: ${taskId}`);
    }

    // Phase 8.12: Calculate required weights from recipeSnapshot (immutable)
    // This ensures snapshot integrity - we never read from mutable Recipe table
    let ingredientsUsageSnapshot: IngredientsUsageSnapshot | null = null;

    if (dto.ingredientsActual && dto.ingredientsActual.length > 0) {
      // Build usage snapshot from provided actual weights
      ingredientsUsageSnapshot = {};
      
      // Get required weights from recipeSnapshot.items
      const recipeItems = unit.recipeSnapshot.items || [];
      
      for (const actualEntry of dto.ingredientsActual) {
        // Find corresponding recipe item to get required weight
        // RecipeSnapshotItem uses ingredient_id (snake_case) and ratio (not ratioPercent)
        const recipeItem = recipeItems.find(
          (ri: any) => ri.ingredient_id === actualEntry.ingredientId,
        );
        
        if (!recipeItem) {
          throw new BadRequestException(
            `Ingredient ${actualEntry.ingredientId} not found in recipe snapshot`,
          );
        }

        // Calculate required weight based on totalProductionG and ratio
        // Formula: required_g = totalProductionG * (ratio / 100)
        // RecipeSnapshotItem.ratio is already a percentage (0-100)
        const ratio = recipeItem.ratio || 0;
        const requiredG = (unit.totalProductionG * ratio) / 100;

        ingredientsUsageSnapshot[actualEntry.ingredientId] = {
          required_g: requiredG,
          actual_g: actualEntry.actual_g,
        };
      }
    } else if (dto.actualWeightG !== undefined) {
      // Single actual weight provided - create simple snapshot
      // For MVP, we'll store it as a single entry
      // In production, this would be expanded to per-ingredient breakdown
      ingredientsUsageSnapshot = {
        _total: {
          required_g: unit.totalProductionG,
          actual_g: dto.actualWeightG,
        },
      };
    }

    // Update photos
    const photosRaw = dto.photosRaw ?? unit.photosRaw;
    const photosCooked = dto.photosCooked ?? unit.photosCooked;
    const photosPortioned = dto.photosPortioned ?? unit.photosPortioned;

    // Update task data
    unit.updateTaskData(
      ingredientsUsageSnapshot,
      photosRaw,
      photosCooked,
      photosPortioned,
    );

    // Update status if provided
    const previousStatus = unit.status;
    if (dto.status) {
      unit.transitionTo(dto.status);
    }

    // Phase 8.13: Persist PackagingUnit updates FIRST (status + snapshot)
    const savedUnit = await this.productionRepository.updatePackagingUnit(unit);

    // Phase 8.13: Then trigger inventory deduction if status became COMPLETED
    if (
      dto.status === PackagingUnitStatus.COMPLETED &&
      previousStatus !== PackagingUnitStatus.COMPLETED
    ) {
      try {
        await this.inventoryService.deductFromKitchenTask(savedUnit.id);
      } catch (error: any) {
        // Error handling: Log but don't fail the status transition
        // Status remains COMPLETED, deduction can be retried manually
        this.logger.error(
          `Inventory deduction failed for PackagingUnit ${savedUnit.id}:`,
          error,
        );
        // Don't throw - status transition succeeded, deduction can be retried
      }
    }

    return savedUnit;
  }
}

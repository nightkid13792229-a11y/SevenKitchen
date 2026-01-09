/**
 * Kitchen Service
 * Phase 8.12: Kitchen Task Data Capture MVP
 */

import { Injectable, Inject, BadRequestException, NotFoundException, Logger, forwardRef } from '@nestjs/common';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import { PackagingUnit, PackagingUnitStatus, type IngredientsUsageSnapshot } from '../../domain/production';
import { InvalidStateTransitionError } from '../../domain/common/errors';
import { PRODUCTION_BATCH_REPOSITORY, ProductionService } from '../production/production.service';
import { InventoryService } from '../inventory/inventory.service';

// UpdateTaskDto is now defined in interfaces/dto/kitchen/update-task.dto.ts
// This interface is kept for backward compatibility with service layer
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
    recipeSnapshot: {
      id: string;
      version: number;
      name: string;
      production_loss_rate: number;
      energy_density_kcal_per_kg: number;
      nutrition_standard: string;
      items: Array<{
        ingredient_id: string;
        name: string;
        ratio: number;
      }>;
    };
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
    @Inject(forwardRef(() => ProductionService))
    private readonly productionService: ProductionService,
  ) {}

  /**
   * List production batches by packaging unit status
   * Phase 8.12: Kitchen task listing
   */
  async listBatchesByStatus(
    status?: PackagingUnitStatus,
  ): Promise<KitchenBatchSummaryDto[]> {
    try {
      let batches;
      if (status) {
        batches = await this.productionRepository.findBatchesByPackagingUnitStatus(
          status,
        );
      } else {
        // If no status filter, get all batches (including those with empty packaging units)
        // Use findByStatus to get batches
        batches = await this.productionRepository.findByStatus('PLANNED');
      }

      return batches.map((batch) => {
        // Defensive: ensure packagingUnits is always an array
        const units = batch.packagingUnits || [];
        
        return {
          id: batch.id,
          productionDate: batch.productionDate.toISOString().split('T')[0],
          status: batch.status,
          taskCount: units.length,
          tasks: units.map((unit) => {
            // Defensive: ensure recipeSnapshot exists
            const recipeSnapshot = unit.recipeSnapshot || { id: '', name: 'Unknown' };
            
            // Defensive: ensure photos arrays exist
            const photosRaw = unit.photosRaw || [];
            const photosCooked = unit.photosCooked || [];
            const photosPortioned = unit.photosPortioned || [];
            
            return {
              id: unit.id,
              recipeSnapshotId: recipeSnapshot.id,
              recipeName: recipeSnapshot.name || 'Unknown',
              totalProductionG: unit.totalProductionG || 0,
              status: unit.status || PackagingUnitStatus.PENDING,
              hasPhotos:
                photosRaw.length > 0 ||
                photosCooked.length > 0 ||
                photosPortioned.length > 0,
              hasActualUsage: unit.ingredientsUsageSnapshot !== null && unit.ingredientsUsageSnapshot !== undefined,
            };
          }),
        };
      });
    } catch (error: any) {
      this.logger.error('Error in listBatchesByStatus:', {
        message: error?.message,
        stack: error?.stack,
        status: status,
      });
      throw error;
    }
  }

  /**
   * Get batch detail with full task information
   * Phase 8.12: Kitchen batch detail view
   */
  async getBatchDetail(batchId: string): Promise<KitchenBatchDetailDto> {
    try {
      const batch = await this.productionRepository.findById(batchId);
      if (!batch) {
        throw new NotFoundException(`Production batch not found: ${batchId}`);
      }

      // Defensive: ensure packagingUnits is always an array
      const units = batch.packagingUnits || [];

      return {
        id: batch.id,
        productionDate: batch.productionDate.toISOString().split('T')[0],
        status: batch.status,
        tasks: units.map((unit) => {
          // Defensive: ensure recipeSnapshot exists
          const recipeSnapshot = unit.recipeSnapshot || {
            id: '',
            version: 1,
            name: 'Unknown',
            production_loss_rate: 1.0,
            energy_density_kcal_per_kg: 0,
            nutrition_standard: '',
            items: [],
          };
          
          // Defensive: ensure items array exists
          const items = recipeSnapshot.items || [];
          
          // Defensive: ensure arrays exist
          const photosRaw = unit.photosRaw || [];
          const photosCooked = unit.photosCooked || [];
          const photosPortioned = unit.photosPortioned || [];
          const sourceOrderItemIds = unit.sourceOrderItemIds || [];

          return {
            id: unit.id,
            recipeSnapshotId: recipeSnapshot.id,
            recipeName: recipeSnapshot.name || 'Unknown',
            totalProductionG: unit.totalProductionG || 0,
            status: unit.status || PackagingUnitStatus.PENDING,
            recipeSnapshot: {
              id: recipeSnapshot.id,
              version: recipeSnapshot.version || 1,
              name: recipeSnapshot.name || 'Unknown',
              production_loss_rate: recipeSnapshot.production_loss_rate || 1.0,
              energy_density_kcal_per_kg: recipeSnapshot.energy_density_kcal_per_kg || 0,
              nutrition_standard: recipeSnapshot.nutrition_standard || '',
              items: items.map((item: any) => ({
                ingredient_id: item.ingredient_id || '',
                name: item.name || '',
                ratio: item.ratio || 0,
              })),
            },
            ingredientsUsageSnapshot: unit.ingredientsUsageSnapshot || null,
            photosRaw,
            photosCooked,
            photosPortioned,
            sourceOrderItemIds,
          };
        }),
      };
    } catch (error: any) {
      // Only log unexpected errors, not expected NotFoundException
      if (!(error instanceof NotFoundException)) {
        this.logger.error('Error in getBatchDetail:', {
          message: error?.message,
          stack: error?.stack,
          batchId: batchId,
        });
      }
      throw error;
    }
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

    // Phase 8.12: State-aware validation
    // COMPLETED status requires actualWeightG or ingredientsActual
    // IN_PROGRESS status allows pure status transition without data
    if (dto.status === PackagingUnitStatus.COMPLETED) {
      if (!dto.actualWeightG && (!dto.ingredientsActual || dto.ingredientsActual.length === 0)) {
        throw new BadRequestException(
          'Cannot transition to COMPLETED without actual usage data. Either actualWeightG or ingredientsActual must be provided.',
        );
      }
    }

    // Phase 8.12: Calculate required weights from recipeSnapshot (immutable)
    // This ensures snapshot integrity - we never read from mutable Recipe table
    let ingredientsUsageSnapshot: IngredientsUsageSnapshot | null = null;

    if (dto.ingredientsActual && dto.ingredientsActual.length > 0) {
      // Build usage snapshot from provided actual weights
      ingredientsUsageSnapshot = {};
      
      // Get required weights from recipeSnapshot.items
      const recipeItems = unit.recipeSnapshot?.items || [];
      
      if (recipeItems.length === 0) {
        throw new BadRequestException(
          'Recipe snapshot has no items. Cannot calculate required weights.',
        );
      }
      
      for (const actualEntry of dto.ingredientsActual) {
        // Validate ingredientId
        if (!actualEntry.ingredientId || typeof actualEntry.ingredientId !== 'string') {
          throw new BadRequestException(
            'Each ingredientActual item must have a valid ingredientId (string)',
          );
        }
        
        // Validate actual_g
        if (typeof actualEntry.actual_g !== 'number' || actualEntry.actual_g < 0) {
          throw new BadRequestException(
            `actual_g must be a non-negative number for ingredient ${actualEntry.ingredientId}, got: ${actualEntry.actual_g}`,
          );
        }
        
        // Find corresponding recipe item to get required weight
        // RecipeSnapshotItem uses ingredient_id (snake_case) and ratio (not ratioPercent)
        // Support both ingredient_id and ingredientId for flexibility
        const recipeItem = recipeItems.find(
          (ri: any) => ri.ingredient_id === actualEntry.ingredientId || ri.ingredientId === actualEntry.ingredientId,
        );
        
        if (!recipeItem) {
          throw new BadRequestException(
            `Ingredient ${actualEntry.ingredientId} not found in recipe snapshot. Available ingredients: ${recipeItems.map((ri: any) => ri.ingredient_id || ri.ingredientId).join(', ')}`,
          );
        }

        // Calculate required weight based on totalProductionG and ratio
        // Formula: required_g = totalProductionG * (ratio / 100)
        // RecipeSnapshotItem.ratio is already a percentage (0-100)
        const ratio = recipeItem.ratio || 0;
        if (ratio <= 0 || ratio > 100) {
          throw new BadRequestException(
            `Invalid ratio for ingredient ${actualEntry.ingredientId}: ${ratio}. Ratio must be between 0 and 100.`,
          );
        }
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
      try {
        unit.transitionTo(dto.status);
      } catch (error: any) {
        if (error instanceof InvalidStateTransitionError) {
          throw new BadRequestException(
            `Invalid status transition from ${previousStatus} to ${dto.status}: ${error.message}`,
          );
        }
        throw error;
      }
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

      // Phase 8.14: Trigger batch completion check if task is COMPLETED
      // This ensures batch transitions to COMPLETED and orders advance to READY_FOR_SHIPMENT
      if (savedUnit.productionBatchId) {
        try {
          await this.productionService.checkAndCompleteBatch(savedUnit.productionBatchId);
          this.logger.debug(
            `Triggered batch completion check for batch ${savedUnit.productionBatchId} after task ${savedUnit.id} was completed`,
          );
        } catch (error: any) {
          // Error handling: Log but don't fail the task completion
          // Task remains COMPLETED, batch completion can be retried manually
          this.logger.warn(
            `Batch completion check failed for batch ${savedUnit.productionBatchId} after task ${savedUnit.id} was completed:`,
            error?.message || error,
          );
          // Don't throw - task completion succeeded, batch completion can be retried
        }
      } else {
        this.logger.warn(
          `Task ${savedUnit.id} was completed but has no productionBatchId. Cannot trigger batch completion check.`,
        );
      }
    }

    return savedUnit;
  }
}


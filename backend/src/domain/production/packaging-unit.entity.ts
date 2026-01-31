/**
 * PackagingUnit Entity
 * Represents what is actually produced in a production batch
 * Phase 8.10: Production & Packaging MVP
 * Phase 8.12: Extended as kitchen task carrier
 */

import { ValidationError, InvalidStateTransitionError } from '../common/errors';
import type { RecipeSnapshot } from '../recipe/types';
import { PackagingUnitStatus } from './enums';

export interface IngredientsUsageSnapshot {
  // Key: ingredientId, Value: { required_g: number, actual_g: number }
  [ingredientId: string]: {
    required_g: number;
    actual_g: number;
  };
}

export class PackagingUnit {
  constructor(
    public readonly id: string,
    public readonly productionBatchId: string,
    public readonly recipeSnapshot: RecipeSnapshot, // Immutable reference
    public readonly totalProductionG: number, // Aggregated grams from all contributing OrderItems
    public readonly sourceOrderItemIds: string[], // Traceability: which OrderItems contributed
    public readonly createdAt: Date,
    // Phase 8.12: Kitchen task fields
    public status: PackagingUnitStatus = PackagingUnitStatus.PENDING,
    public ingredientsUsageSnapshot: IngredientsUsageSnapshot | null = null,
    public photosRaw: string[] = [],
    public photosCooked: string[] = [],
    public photosPortioned: string[] = [],
    public updatedAt: Date = new Date(),
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (this.totalProductionG <= 0) {
      throw new ValidationError(
        `Total production grams must be positive, got: ${this.totalProductionG}`,
      );
    }

    if (this.sourceOrderItemIds.length === 0) {
      throw new ValidationError(
        'PackagingUnit must have at least one source OrderItem',
      );
    }

    // Phase 8.12: Validate ingredients usage snapshot
    if (this.ingredientsUsageSnapshot) {
      for (const [ingredientId, usage] of Object.entries(
        this.ingredientsUsageSnapshot,
      )) {
        if (usage.actual_g < 0) {
          throw new ValidationError(
            `Actual weight must be >= 0 for ingredient ${ingredientId}, got: ${usage.actual_g}`,
          );
        }
        if (usage.required_g <= 0) {
          throw new ValidationError(
            `Required weight must be positive for ingredient ${ingredientId}, got: ${usage.required_g}`,
          );
        }
      }
    }

    // RecipeSnapshot must be immutable (read-only after creation)
    // This is enforced by using readonly property and not providing update methods
  }

  /**
   * Transition status (Phase 8.12)
   */
  transitionTo(newStatus: PackagingUnitStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidStateTransitionError(
        `Cannot transition from ${this.status} to ${newStatus}`,
      );
    }

    this.status = newStatus;
    this.updatedAt = new Date();
  }

  /**
   * Check if transition is allowed
   */
  private canTransitionTo(newStatus: PackagingUnitStatus): boolean {
    const validTransitions: Record<
      PackagingUnitStatus,
      PackagingUnitStatus[]
    > = {
      [PackagingUnitStatus.PENDING]: [PackagingUnitStatus.IN_PROGRESS],
      [PackagingUnitStatus.IN_PROGRESS]: [
        PackagingUnitStatus.COMPLETED,
        PackagingUnitStatus.PENDING, // Allow going back if needed
      ],
      [PackagingUnitStatus.COMPLETED]: [], // Terminal state
    };

    const allowedNextStates = validTransitions[this.status] || [];
    return allowedNextStates.includes(newStatus);
  }

  /**
   * Update task data (Phase 8.12)
   * Updates ingredients usage snapshot and photos
   */
  updateTaskData(
    ingredientsUsageSnapshot: IngredientsUsageSnapshot | null,
    photosRaw: string[],
    photosCooked: string[],
    photosPortioned: string[],
  ): void {
    // Validate photos arrays
    if (!Array.isArray(photosRaw) || !Array.isArray(photosCooked) || !Array.isArray(photosPortioned)) {
      throw new ValidationError('Photos must be arrays');
    }

    // Update fields
    this.ingredientsUsageSnapshot = ingredientsUsageSnapshot;
    this.photosRaw = photosRaw;
    this.photosCooked = photosCooked;
    this.photosPortioned = photosPortioned;
    this.updatedAt = new Date();
  }

  /**
   * Upload raw material photos (原料照片上传)
   * 支持累加模式：每次调用追加新照片到现有列表
   * Triggers status transition from PENDING to COMPLETED when reaching 2-3 photos
   * @param photoUrls Array of photo URLs (1-3 photos per upload)
   * @returns boolean indicating if order should transition to FREEZING
   */
  uploadPhotos(photoUrls: string[]): boolean {
    // Validate input
    if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
      throw new ValidationError('Photo URLs cannot be empty');
    }

    // Append new photos to existing list (累加模式)
    const existingPhotos = this.photosRaw || [];
    const updatedPhotos = [...existingPhotos, ...photoUrls];

    // Validate total count
    if (updatedPhotos.length > 3) {
      throw new ValidationError(
        `Total photos cannot exceed 3. Currently have ${existingPhotos.length}, trying to add ${photoUrls.length}`
      );
    }

    // Save updated photos array
    this.photosRaw = updatedPhotos;

    // Transition to COMPLETED when reaching 2-3 photos (PENDING -> COMPLETED)
    const shouldTriggerOrderFreezing = this.status === PackagingUnitStatus.PENDING && updatedPhotos.length >= 2;
    if (shouldTriggerOrderFreezing) {
      this.status = PackagingUnitStatus.COMPLETED;
    }

    this.updatedAt = new Date();

    return shouldTriggerOrderFreezing;
  }

  /**
   * Replace raw material photos (原料照片替换)
   * Used in FREEZING state to update photos without triggering order status change
   * @param photoUrls Array of photo URLs (2-3 photos required)
   */
  replacePhotos(photoUrls: string[]): void {
    if (!Array.isArray(photoUrls) || photoUrls.length < 2 || photoUrls.length > 3) {
      throw new ValidationError('Must upload 2-3 photos');
    }

    this.photosRaw = photoUrls;
    this.updatedAt = new Date();
  }

  /**
   * Remove a single raw material photo (删除单张原料照片)
   * Used to delete a specific photo from the array
   * @param photoUrl The photo URL to remove
   */
  removePhoto(photoUrl: string): void {
    if (!this.photosRaw || this.photosRaw.length === 0) {
      throw new ValidationError('No photos to remove');
    }

    const photoIndex = this.photosRaw.indexOf(photoUrl);
    if (photoIndex === -1) {
      throw new ValidationError('Photo not found in array');
    }

    // Remove the photo from the array
    this.photosRaw.splice(photoIndex, 1);
    this.updatedAt = new Date();
  }
}


/**
 * Dog Entity
 * Aggregate root for Dog domain
 */

import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../index';
import { ValidationError } from '../common/errors';

export class Dog {
  constructor(
    public readonly id: string,
    public readonly ownerId: string,
    public name: string,
    public readonly breedId: string,
    public customBreedName: string | null,
    public readonly birthday: Date,
    public gender: DogGender,
    public isNeutered: boolean,
    public currentWeightKg: number,
    public bcsScore: number,
    public activityLevel: ActivityLevel,
    public lifeStageOverride: LifeStageOverride,
    public sizeClassOverride: DogSizeCategory | null,
    public mealsPerDay: number,
    public treatInputMode: TreatInputMode,
    public treatLevel: TreatLevel,
    public manualTreatKcal: number | null,
    public medicalHistory: string | null,
    public cachedTargetFoodKcal: number, // System calculated, can be updated
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   * TODO: Implement validation rules based on Doc 07
   */
  private validateInvariants(): void {
    // BCS score must be between 1-9 (WSAVA Standard)
    if (this.bcsScore < 1 || this.bcsScore > 9) {
      throw new ValidationError(
        `BCS score must be between 1-9, got: ${this.bcsScore}`,
      );
    }

    // Weight must be positive
    if (this.currentWeightKg <= 0) {
      throw new ValidationError(
        `Weight must be positive, got: ${this.currentWeightKg}`,
      );
    }

    // Meals per day must be positive
    if (this.mealsPerDay <= 0) {
      throw new ValidationError(
        `Meals per day must be positive, got: ${this.mealsPerDay}`,
      );
    }

    // Treat logic validation
    if (this.treatInputMode === TreatInputMode.EXACT_KCAL) {
      if (this.manualTreatKcal === null || this.manualTreatKcal < 0) {
        throw new ValidationError(
          'manualTreatKcal must be provided and non-negative when treatInputMode is EXACT_KCAL',
        );
      }
    }

    // TODO: Add more validation rules as needed
  }

  /**
   * Update dog profile
   * Supports partial updates - only updates provided fields
   */
  updateProfile(updates: Partial<Dog>): void {
    // Update name if provided
    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new ValidationError('Name must be non-empty');
      }
      this.name = updates.name;
    }

    // Update mutable fields if provided (skip readonly: id, ownerId, breedId, birthday)
    if (updates.gender !== undefined) {
      this.gender = updates.gender;
    }
    if (updates.isNeutered !== undefined) {
      this.isNeutered = updates.isNeutered;
    }
    if (updates.currentWeightKg !== undefined) {
      this.currentWeightKg = updates.currentWeightKg;
    }
    if (updates.bcsScore !== undefined) {
      this.bcsScore = updates.bcsScore;
    }
    if (updates.activityLevel !== undefined) {
      this.activityLevel = updates.activityLevel;
    }
    if (updates.lifeStageOverride !== undefined) {
      this.lifeStageOverride = updates.lifeStageOverride;
    }
    if (updates.sizeClassOverride !== undefined) {
      this.sizeClassOverride = updates.sizeClassOverride;
    }
    if (updates.mealsPerDay !== undefined) {
      this.mealsPerDay = updates.mealsPerDay;
    }
    if (updates.treatInputMode !== undefined) {
      this.treatInputMode = updates.treatInputMode;
    }
    if (updates.treatLevel !== undefined) {
      this.treatLevel = updates.treatLevel;
    }
    if (updates.manualTreatKcal !== undefined) {
      this.manualTreatKcal = updates.manualTreatKcal;
    }
    if (updates.medicalHistory !== undefined) {
      this.medicalHistory = updates.medicalHistory;
    }

    // Re-validate invariants after update
    this.validateInvariants();
  }
}


/**
 * Dog Application Service
 * Application layer service for Dog domain operations
 */

import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import { Dog } from '../../domain/dog/dog.entity';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../../domain';

export interface CreateDogProfileDto {
  ownerId: string;
  name: string;
  breedId: string;
  birthday: Date;
  gender: DogGender;
  isNeutered: boolean;
  currentWeightKg: number;
  bcsScore: number;
  activityLevel: ActivityLevel;
  lifeStageOverride: LifeStageOverride;
  sizeClassOverride?: DogSizeCategory | null;
  mealsPerDay?: number;
  treatInputMode?: TreatInputMode;
  treatLevel?: TreatLevel;
  manualTreatKcal?: number | null;
  medicalHistory?: string | null;
}

export interface UpdateDogProfileDto {
  name?: string;
  currentWeightKg?: number;
  bcsScore?: number;
  activityLevel?: ActivityLevel;
  lifeStageOverride?: LifeStageOverride;
  sizeClassOverride?: DogSizeCategory | null;
  mealsPerDay?: number;
  treatInputMode?: TreatInputMode;
  treatLevel?: TreatLevel;
  manualTreatKcal?: number | null;
  medicalHistory?: string | null;
}

export interface CalcPreviewResult {
  finalFoodKcal: number;
  treatDeduction: number;
  isTreatCapped: boolean;
  totalDer: number;
}

export const DOG_REPOSITORY = Symbol('DogRepository');
export const RECIPE_REPOSITORY = Symbol('RecipeRepository');

@Injectable()
export class DogService {
  constructor(
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: RecipeRepository, // TODO: Will be used for recipe-based calculations
  ) {
    // Suppress unused warning - will be used in future implementations
    void this.recipeRepository;
  }

  /**
   * Create a new dog profile
   * TODO: Implement full logic
   */
  async createDogProfile(dto: CreateDogProfileDto): Promise<Dog> {
    const id = randomUUID();

    const dog = new Dog(
      id,
      dto.ownerId,
      dto.name,
      dto.breedId,
      dto.birthday,
      dto.gender,
      dto.isNeutered,
      dto.currentWeightKg,
      dto.bcsScore,
      dto.activityLevel,
      dto.lifeStageOverride,
      dto.sizeClassOverride ?? null,
      dto.mealsPerDay ?? 2,
      dto.treatInputMode ?? TreatInputMode.ESTIMATE_LEVEL,
      dto.treatLevel ?? TreatLevel.LOW,
      dto.manualTreatKcal ?? null,
      dto.medicalHistory ?? null,
      0, // cachedTargetFoodKcal - TODO: Calculate initial value
    );

    // TODO: Calculate and set cachedTargetFoodKcal

    return this.dogRepository.save(dog);
  }

  /**
   * Update dog profile
   * TODO: Implement full logic
   */
  async updateDogProfile(
    dogId: string,
    dto: UpdateDogProfileDto,
  ): Promise<Dog> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new Error(`Dog not found: ${dogId}`);
    }

    // TODO: Apply updates
    dog.updateProfile(dto as Partial<Dog>);

    // TODO: Recalculate cachedTargetFoodKcal if relevant fields changed

    return this.dogRepository.save(dog);
  }

  /**
   * Calculate energy requirement preview
   * Pure calculation function - no database writes
   * TODO: Implement calculation logic based on Doc 07 Section 3.1
   */
  async calcPreview(dogId: string): Promise<CalcPreviewResult> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new Error(`Dog not found: ${dogId}`);
    }

    // TODO: Implement DER calculation based on Doc 07 Section 3.1
    // Placeholder implementation for testing
    const totalDer = this.calculateTotalDer(dog);
    const treatDeduction = this.calculateTreatDeduction(dog, totalDer);
    const finalFoodKcal = Math.max(0, totalDer - treatDeduction.deduction);
    const isTreatCapped = treatDeduction.isCapped;

    return {
      finalFoodKcal,
      treatDeduction: treatDeduction.deduction,
      isTreatCapped,
      totalDer,
    };
  }

  /**
   * Calculate Total DER (placeholder)
   * TODO: Implement based on Doc 07 Section 3.1.5
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private calculateTotalDer(_dog: Dog): number {
    // Placeholder: Simple calculation for testing
    // TODO: Implement full RER * LifeStageFactor * AdultModifiers * BCS_Adjustment
    return 500;
  }

  /**
   * Calculate treat deduction (placeholder)
   * TODO: Implement based on Doc 07 Section 3.1.5
   */
  private calculateTreatDeduction(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _dog: Dog,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _totalDer: number,
  ): { deduction: number; isCapped: boolean } {
    // Placeholder: Simple calculation for testing
    // TODO: Implement full treat deduction logic with 10% cap
    return { deduction: 50, isCapped: false };
  }
}

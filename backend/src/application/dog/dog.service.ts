/**
 * Dog Application Service
 * Application layer service for Dog domain operations
 */

import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import { Dog } from '../../domain/dog/dog.entity';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
  calculateDogEnergy,
} from '../../domain';

export interface CreateDogProfileDto {
  ownerId: string;
  name: string;
  breedId: string;
  customBreedName?: string | null;
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
  rer: number;
  totalDer: number;
  finalFoodKcal: number;
  treatDeduction: number;
  isTreatCapped: boolean;
  dailyIntakeG?: number;
}

export const DOG_REPOSITORY = Symbol('DogRepository');
export const RECIPE_REPOSITORY = Symbol('RecipeRepository');
export const DOG_BREED_REPOSITORY = Symbol('DogBreedRepository');

@Injectable()
export class DogService {
  constructor(
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: RecipeRepository, // TODO: Will be used for recipe-based calculations
  ) {
    // Suppress unused warning - will be used in future implementations
    void this.recipeRepository;
  }

  /**
   * Create a new dog profile
   */
  async createDogProfile(dto: CreateDogProfileDto): Promise<Dog> {
    const id = randomUUID();

    const dog = new Dog(
      id,
      dto.ownerId,
      dto.name,
      dto.breedId,
      dto.customBreedName ?? null,
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
      0, // Will be calculated and updated after save
    );

    // Save first to get persisted entity
    const savedDog = await this.dogRepository.save(dog);

    // Load breed for calculation
    const breed = await this.dogBreedRepository.findById(savedDog.breedId);

    // Calculate and update cachedTargetFoodKcal
    const calcResult = calculateDogEnergy(savedDog, undefined, breed);
    savedDog.cachedTargetFoodKcal = Math.round(calcResult.finalFoodKcal);

    // Update with calculated value
    return this.dogRepository.save(savedDog);
  }

  /**
   * Update dog profile
   * Recalculates cachedTargetFoodKcal if relevant fields changed
   */
  async updateDogProfile(
    dogId: string,
    dto: UpdateDogProfileDto,
  ): Promise<Dog> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new Error(`Dog not found: ${dogId}`);
    }

    // Fields that require recalculation
    const fieldsRequiringRecalc = [
      'currentWeightKg',
      'bcsScore',
      'activityLevel',
      'lifeStageOverride',
      'sizeClassOverride',
      'isNeutered',
      'treatInputMode',
      'treatLevel',
      'manualTreatKcal',
    ];

    // Check if any relevant field changed
    const needsRecalc = fieldsRequiringRecalc.some(
      (field) => dto[field as keyof UpdateDogProfileDto] !== undefined,
    );

    // Apply updates
    dog.updateProfile(dto as Partial<Dog>);

    // Recalculate if needed
    if (needsRecalc) {
      const breed = await this.dogBreedRepository.findById(dog.breedId);
      const calcResult = calculateDogEnergy(dog, undefined, breed);
      dog.cachedTargetFoodKcal = Math.round(calcResult.finalFoodKcal);
    }

    return this.dogRepository.save(dog);
  }

  /**
   * Calculate energy requirement preview
   * Pure calculation function - no database writes
   */
  async calcPreview(dogId: string): Promise<CalcPreviewResult> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new Error(`Dog not found: ${dogId}`);
    }

    // Load breed for calculation
    const breed = await this.dogBreedRepository.findById(dog.breedId);

    const calcResult = calculateDogEnergy(dog, undefined, breed);

    return {
      rer: calcResult.rer,
      totalDer: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG,
    };
  }
}

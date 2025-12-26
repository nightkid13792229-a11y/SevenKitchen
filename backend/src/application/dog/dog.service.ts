/**
 * Dog Application Service
 * Application layer service for Dog domain operations
 */

import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import { PrismaService } from '../../infrastructure/prisma.service';
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
import { DogBreed } from '../../domain/dog/dog-breed.entity';
import { GrowthCurveType } from '../../domain/dog/enums';

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
  breedId?: string;
  customBreedName?: string | null;
  birthday?: Date;
  gender?: DogGender;
  isNeutered?: boolean;
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
      'breedId',
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

    // Recalculate if needed (use updated breedId)
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

    // Calculate with detailed breakdown for UI display
    const calcResult = calculateDogEnergy(dog, undefined, breed, true);

    return {
      rer: calcResult.rer,
      totalDer: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG,
    };
  }

  // ==================== Breed Management Methods ====================

  /**
   * Create new breed
   */
  async createBreed(dto: CreateBreedDto): Promise<DogBreed> {
    const exists = await this.dogBreedRepository.existsByName(dto.name);
    if (exists) {
      throw new Error(`Breed with name "${dto.name}" already exists`);
    }

    const breed = new DogBreed(
      randomUUID(),
      dto.name,
      dto.sizeCategory,
      dto.growthCurveType,
      dto.adultAgeMonths,
      dto.seniorAgeYears,
      dto.averageAdultWeightKg ?? null,
    );

    return this.dogBreedRepository.save(breed);
  }

  /**
   * Update breed
   */
  async updateBreed(id: string, dto: UpdateBreedDto): Promise<DogBreed> {
    const existing = await this.dogBreedRepository.findById(id);
    if (!existing) {
      throw new Error(`Breed not found: ${id}`);
    }

    if (dto.name) {
      const exists = await this.dogBreedRepository.existsByName(dto.name, id);
      if (exists) {
        throw new Error(`Breed with name "${dto.name}" already exists`);
      }
    }

    const updated = new DogBreed(
      id,
      dto.name ?? existing.name,
      dto.sizeCategory ?? existing.sizeCategory,
      dto.growthCurveType ?? existing.growthCurveType,
      dto.adultAgeMonths ?? existing.adultAgeMonths,
      dto.seniorAgeYears ?? existing.seniorAgeYears,
      dto.averageAdultWeightKg !== undefined ? dto.averageAdultWeightKg : existing.averageAdultWeightKg,
    );

    const result = await this.dogBreedRepository.update(id, updated);
    if (!result) {
      throw new Error(`Failed to update breed: ${id}`);
    }
    return result;
  }

  /**
   * Delete breed
   */
  async deleteBreed(id: string): Promise<void> {
    const exists = await this.dogBreedRepository.findById(id);
    if (!exists) {
      throw new Error(`Breed not found: ${id}`);
    }

    await this.dogBreedRepository.delete(id);
  }

  /**
   * Check breed usage
   */
  async checkBreedUsage(
    id: string,
  ): Promise<{ count: number; dogs: Array<{ id: string; name: string; ownerId: string }> }> {
    const count = await this.dogBreedRepository.countUsage(id);
    const dogs = await this.dogBreedRepository.findUsage(id, 10);
    return { count, dogs };
  }

  /**
   * Get custom breed statistics
   */
  async getCustomBreedStats(): Promise<Array<{
    breedName: string;
    usageCount: number;
    firstUsedAt: Date;
    avgWeight: number;
    estimatedSizeCategory: DogSizeCategory;
  }>> {
    const prisma = await this.getPrismaService();

    const stats = await prisma.$queryRaw<
      Array<{
        breed_name: string;
        usage_count: bigint;
        first_used_at: Date;
        avg_weight: number;
      }>
    >`
      SELECT
        custom_breed_name as "breed_name",
        COUNT(*) as "usage_count",
        MIN(created_at) as "first_used_at",
        AVG(current_weight_kg) as "avg_weight"
      FROM dog
      WHERE custom_breed_name IS NOT NULL
      GROUP BY custom_breed_name
      ORDER BY "usage_count" DESC
    `;

    return stats.map(stat => ({
      breedName: stat.breed_name,
      usageCount: Number(stat.usage_count),
      firstUsedAt: stat.first_used_at,
      avgWeight: stat.avg_weight,
      estimatedSizeCategory: this.estimateSizeCategory(stat.avg_weight),
    }));
  }

  /**
   * Estimate size category from weight
   */
  private estimateSizeCategory(weightKg: number): DogSizeCategory {
    if (weightKg < 10) return DogSizeCategory.SMALL;
    if (weightKg < 25) return DogSizeCategory.MEDIUM;
    if (weightKg < 45) return DogSizeCategory.LARGE;
    return DogSizeCategory.GIANT;
  }

  /**
   * Get PrismaService (helper for raw queries)
   */
  private async getPrismaService() {
    const { PrismaService } = await import('../../infrastructure/prisma.service');
    const module = await import('../../infrastructure/prisma.service');
    return module.PrismaService.getInstance();
  }
}

// DTOs for breed management
export interface CreateBreedDto {
  name: string;
  sizeCategory: DogSizeCategory;
  growthCurveType: GrowthCurveType;
  adultAgeMonths: number;
  seniorAgeYears: number;
  averageAdultWeightKg?: number;
}

export interface UpdateBreedDto {
  name?: string;
  sizeCategory?: DogSizeCategory;
  growthCurveType?: GrowthCurveType;
  adultAgeMonths?: number;
  seniorAgeYears?: number;
  averageAdultWeightKg?: number;
}

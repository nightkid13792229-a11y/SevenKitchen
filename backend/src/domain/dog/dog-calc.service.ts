/**
 * Dog Calculation Service
 * Domain service for calculating dog energy requirements
 * Based on docs/07_Core_Architecture.md Section 3.1
 */

import { Dog } from './dog.entity';
import { DogBreed } from './dog-breed.entity';
import {
  ActivityLevel,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from './enums';
import {
  LIFE_STAGE_FACTORS,
  ACTIVITY_MULTIPLIERS,
  TREAT_LIMITS,
  BCS_PARAMS,
  MIXED_BREED_VIRTUAL_ID,
} from './constants';
import {
  resolveDogProfileStage,
  type ResolvedDogProfileStage,
} from './dog-stage.service';

export { resolveDogProfileStage } from './dog-stage.service';

/**
 * DogCalcResult
 * Result of dog energy calculation
 */
export interface DogCalcResult {
  rer: number; // Resting Energy Requirement (kcal/day)
  der: number; // Daily Energy Requirement (kcal/day)
  treatDeduction: number; // Treat calories deducted (kcal/day)
  isTreatCapped: boolean; // Whether treat deduction hit 10% cap
  finalFoodKcal: number; // Final food kcal requirement (kcal/day)
  dailyIntakeG?: number; // Daily intake in grams (if recipe energy density provided)
  calcDetails?: {
    // Input snapshot
    weightKg: number;
    ageMonths: number;
    sizeClass: string;
    lifeStage: string;

    // Final coefficient after applying neuter & activity modifiers
    stageFactor: number;

    // BCS adjustment
    bcsMultiplier: number;

    // Additional info for display (not used in calculation)
    isNeutered: boolean;
    activityLevel: string;
    energyStage?: string;
    energyFactorKey?: string;
    recipeLifeStage?: string;
    fediafScenario?: string;
    activityBasis?: string;
    autoLifeStage?: string;
    overrideLifeStage?: string;
    effectiveLifeStage?: string;
    isManualLifeStageOverride?: boolean;
    warnings?: string[];

    // Treat info
    treatMode: string;
    treatLevel?: string;
    treatPercentage?: number;
  };
}

/**
 * Calculate age in months from birthday
 * Formula: floor((Today - birthday) in days / 30.4375)
 */
export function calculateAgeMonths(birthday: Date): number {
  const today = new Date();
  const diffTime = today.getTime() - birthday.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return Math.floor(diffDays / 30.4375);
}

/**
 * Determine size class from dog
 * Priority: size_class_override > breed > MEDIUM (fallback)
 * Based on docs/07_Core_Architecture.md Section 2.2
 */
export function determineSizeClass(
  dog: Dog,
  breed?: DogBreed | null,
): DogSizeCategory {
  // Priority 1: Manual override
  if (dog.sizeClassOverride) {
    return dog.sizeClassOverride;
  }

  // Priority 2: Breed lookup (GAP-007 resolved)
  if (breed) {
    return breed.sizeCategory;
  }

  // Priority 3: Fallback to MEDIUM
  return DogSizeCategory.MEDIUM;
}

/**
 * Validate mixed breed dog has required size class override
 * Mixed breed dogs MUST have sizeClassOverride set
 */
export function validateMixedBreedDog(
  dog: Dog,
  _breed?: DogBreed | null,
): void {
  // Check if this is a mixed breed (only via virtual breed ID)
  // A dog with a non-mixed breedId should not be considered mixed breed
  // just because the breed lookup fails (breed may not be in database)
  // Note: breed parameter is kept for API compatibility but not used in validation
  const isMixedBreed = dog.breedId === MIXED_BREED_VIRTUAL_ID;

  if (isMixedBreed && !dog.sizeClassOverride) {
    throw new Error('混血犬必须选择体型分类。请在系统中选择体型分类。');
  }
}

/**
 * Get life stage factor based on dog's age, size, and override
 * Based on docs/07_Core_Architecture.md Section 3.1.2
 */
function getLifeStageFactor(
  dog: Dog,
  ageMonths: number,
  sizeClass: DogSizeCategory,
  breed?: DogBreed | null,
): number {
  void ageMonths;
  void sizeClass;
  const resolved = resolveDogProfileStage(dog, breed);
  return LIFE_STAGE_FACTORS[resolved.energyFactorKey];
}

/**
 * Apply adult modifiers (neuter & activity)
 * Based on docs/07_Core_Architecture.md Section 3.1.3
 */
function applyAdultModifiers(
  baseFactor: number,
  dog: Dog,
  ageMonths: number,
  sizeClass: DogSizeCategory,
  breed?: DogBreed | null,
  resolvedStage?: ResolvedDogProfileStage,
): number {
  const resolved = resolvedStage ?? resolveDogProfileStage(dog, breed);
  // Safety guard: if in growth/repro stage, return base factor unchanged
  if (
    resolved.energyStage === 'PUPPY' ||
    resolved.energyStage === 'PREGNANCY' ||
    resolved.energyStage === 'LACTATION'
  ) {
    return baseFactor;
  }

  if (
    resolved.energyStage === 'ADULT' &&
    resolved.activityBasis !== ActivityLevel.WORKING
  ) {
    return baseFactor;
  }

  void ageMonths;
  void sizeClass;
  void breed;

  // Only apply neuter modifiers to non-senior adult dogs
  let currentFactor = baseFactor;

  if (resolved.energyStage !== 'SENIOR') {
    if (dog.isNeutered) {
      currentFactor = LIFE_STAGE_FACTORS.ADULT_NEUTERED;
    } else {
      currentFactor = LIFE_STAGE_FACTORS.ADULT_INTACT;
    }
  }

  // 3. Activity multiplier
  const multiplier =
    ACTIVITY_MULTIPLIERS[resolved.activityBasis] ?? ACTIVITY_MULTIPLIERS.LOW;
  currentFactor *= multiplier;

  return currentFactor;
}

/**
 * Get BCS adjustment factor
 * Based on docs/07_Core_Architecture.md Section 3.1.4
 */
function getBcsAdjustment(bcsScore: number): number {
  // Input validation: clamp to 1-9
  const clampedBcs = Math.max(1, Math.min(9, bcsScore));

  // Ideal body condition (BCS 4-5)
  if (
    clampedBcs >= BCS_PARAMS.IDEAL_LOW &&
    clampedBcs <= BCS_PARAMS.IDEAL_HIGH
  ) {
    return 1.0;
  }

  // Overweight (BCS 6-9)
  // Target: reduce caloric intake. -10% per point > 5
  if (clampedBcs > BCS_PARAMS.IDEAL_HIGH) {
    return (
      1.0 -
      (clampedBcs - BCS_PARAMS.IDEAL_HIGH) *
        BCS_PARAMS.OVERWEIGHT_PENALTY_PER_POINT
    );
  }

  // Underweight (BCS 1-3)
  // Conservative weight gain strategy
  if (clampedBcs === 3) {
    return BCS_PARAMS.UNDERWEIGHT_BOOST_BCS_3;
  }
  if (clampedBcs <= 2) {
    return BCS_PARAMS.UNDERWEIGHT_BOOST_BCS_1_2;
  }

  return 1.0;
}

/**
 * Calculate RER (Resting Energy Requirement)
 * Formula: 70 * weightKg^0.75 (Kleiber's Law)
 */
export function calculateRER(weightKg: number): number {
  return 70 * Math.pow(weightKg, 0.75);
}

/**
 * Calculate Total DER (Daily Energy Requirement)
 * Based on docs/07_Core_Architecture.md Section 3.1.5 Function A
 */
export function calculateTotalDer(dog: Dog, breed?: DogBreed | null): number {
  return calculateTotalDerWithDetails(dog, breed).der;
}

/**
 * Calculate Total DER with detailed breakdown
 * Returns both the result and the calculation details
 */
export function calculateTotalDerWithDetails(
  dog: Dog,
  breed?: DogBreed | null,
): {
  der: number;
  adjustedFactor: number;
  bcsCoeff: number;
  resolvedStage: ResolvedDogProfileStage;
} {
  const ageMonths = calculateAgeMonths(dog.birthday);
  const sizeClass = determineSizeClass(dog, breed);
  const resolvedStage = resolveDogProfileStage(dog, breed);

  // 1. Calculate RER
  const rer = calculateRER(dog.currentWeightKg);

  // 2. Get life stage base factor
  const stageFactor = getLifeStageFactor(dog, ageMonths, sizeClass, breed);

  // 3. Apply adult modifiers (neuter & activity)
  const adjustedFactor = applyAdultModifiers(
    stageFactor,
    dog,
    ageMonths,
    sizeClass,
    breed,
    resolvedStage,
  );

  // 4. Apply BCS adjustment
  const bcsCoeff = getBcsAdjustment(dog.bcsScore);

  // 5. Calculate DER
  const der = rer * adjustedFactor * bcsCoeff;

  return { der, adjustedFactor, bcsCoeff, resolvedStage };
}

/**
 * Calculate treat deduction
 * Based on docs/07_Core_Architecture.md Section 3.1.5 Function B
 */
function calculateTreatDeduction(
  dog: Dog,
  totalDer: number,
): { deduction: number; isCapped: boolean } {
  const maxTreatAllowance = totalDer * TREAT_LIMITS.CAP_PERCENT; // 10% cap

  if (dog.treatInputMode === TreatInputMode.EXACT_KCAL) {
    const inputVal = dog.manualTreatKcal ?? 0;

    // Check if input exceeds cap
    if (inputVal > maxTreatAllowance) {
      return {
        deduction: maxTreatAllowance,
        isCapped: true,
      };
    }

    return {
      deduction: inputVal,
      isCapped: false,
    };
  } else {
    // Estimate mode (ESTIMATE_LEVEL)
    let ratio = 0;
    if (dog.treatLevel === TreatLevel.LOW) {
      ratio = TREAT_LIMITS.LOW_RATIO;
    } else if (dog.treatLevel === TreatLevel.MODERATE) {
      ratio = TREAT_LIMITS.MODERATE_RATIO;
    } else if (dog.treatLevel === TreatLevel.HIGH) {
      ratio = TREAT_LIMITS.HIGH_RATIO;
    }
    // TreatLevel.NONE -> ratio = 0

    const deduction = totalDer * ratio;
    const isCapped = deduction > maxTreatAllowance;

    return {
      deduction: isCapped ? maxTreatAllowance : deduction,
      isCapped,
    };
  }
}

/**
 * Calculate fresh food needs
 * Based on docs/07_Core_Architecture.md Section 3.1.5 Function B
 */
export function calculateFreshFoodNeeds(
  dog: Dog,
  breed?: DogBreed | null,
): {
  finalFoodKcal: number;
  treatDeduction: number;
  isTreatCapped: boolean;
  totalDer: number;
} {
  // 1. Get total DER
  const totalDer = calculateTotalDer(dog, breed);

  // 2. Calculate treat deduction
  const treatResult = calculateTreatDeduction(dog, totalDer);

  // 3. Calculate final food kcal
  const finalFoodKcal = Math.max(0, totalDer - treatResult.deduction);

  return {
    finalFoodKcal,
    treatDeduction: treatResult.deduction,
    isTreatCapped: treatResult.isCapped,
    totalDer,
  };
}

/**
 * Calculate daily feeding amount in grams
 * Based on docs/07_Core_Architecture.md Section 3.1.6
 * Formula: (finalFoodKcal / energyDensityKcalPerKg) * 1000
 */
export function calculateDailyIntakeG(
  finalFoodKcal: number,
  energyDensityKcalPerKg: number,
): number {
  if (energyDensityKcalPerKg <= 0) {
    throw new Error('Energy density must be positive');
  }
  return (finalFoodKcal / energyDensityKcalPerKg) * 1000;
}

/**
 * Main calculation function
 * Returns complete DogCalcResult
 */
export function calculateDogEnergy(
  dog: Dog,
  recipeEnergyDensityKcalPerKg?: number,
  breed?: DogBreed | null,
  includeDetails: boolean = false,
): DogCalcResult {
  // Validate mixed breed dog has size class override
  validateMixedBreedDog(dog, breed);

  const rer = calculateRER(dog.currentWeightKg);
  const needsResult = calculateFreshFoodNeeds(dog, breed);

  const result: DogCalcResult = {
    rer,
    der: needsResult.totalDer,
    treatDeduction: needsResult.treatDeduction,
    isTreatCapped: needsResult.isTreatCapped,
    finalFoodKcal: needsResult.finalFoodKcal,
  };

  // Calculate daily intake if recipe energy density is provided
  if (recipeEnergyDensityKcalPerKg !== undefined) {
    result.dailyIntakeG = calculateDailyIntakeG(
      needsResult.finalFoodKcal,
      recipeEnergyDensityKcalPerKg,
    );
  }

  // Add detailed calculation breakdown if requested
  if (includeDetails) {
    const ageMonths = calculateAgeMonths(dog.birthday);
    const sizeClass = determineSizeClass(dog, breed);

    const { adjustedFactor, bcsCoeff, resolvedStage } =
      calculateTotalDerWithDetails(dog, breed);

    // Keep the legacy lifeStage field compatible while exposing explicit stages.
    let lifeStage: string;
    if (resolvedStage.energyStage === 'PUPPY') {
      lifeStage = 'GROWTH';
    } else if (resolvedStage.energyStage === 'SENIOR') {
      lifeStage = 'SENIOR';
    } else if (resolvedStage.energyStage === 'PREGNANCY') {
      lifeStage = 'PREGNANCY';
    } else if (resolvedStage.energyStage === 'LACTATION') {
      lifeStage = 'LACTATION';
    } else {
      lifeStage = 'ADULT';
    }

    // Get treat percentage
    let treatPercentage: number | undefined;
    if (dog.treatInputMode === 'ESTIMATE_LEVEL' && dog.treatLevel) {
      if (dog.treatLevel === TreatLevel.LOW) {
        treatPercentage = Math.round(TREAT_LIMITS.LOW_RATIO * 100);
      } else if (dog.treatLevel === TreatLevel.MODERATE) {
        treatPercentage = Math.round(TREAT_LIMITS.MODERATE_RATIO * 100);
      } else if (dog.treatLevel === TreatLevel.HIGH) {
        treatPercentage = Math.round(TREAT_LIMITS.HIGH_RATIO * 100);
      }
    }

    result.calcDetails = {
      weightKg: dog.currentWeightKg,
      ageMonths,
      sizeClass,
      lifeStage,
      stageFactor: adjustedFactor, // Use adjusted factor (includes neuter & activity)
      bcsMultiplier: bcsCoeff,
      isNeutered: dog.isNeutered,
      activityLevel: dog.activityLevel ?? resolvedStage.activityBasis,
      energyStage: resolvedStage.energyStage,
      energyFactorKey: resolvedStage.energyFactorKey,
      recipeLifeStage: resolvedStage.recipeLifeStage,
      fediafScenario: resolvedStage.fediafScenario,
      activityBasis: resolvedStage.activityBasis,
      autoLifeStage: resolvedStage.autoLifeStage,
      overrideLifeStage: resolvedStage.overrideLifeStage,
      effectiveLifeStage: resolvedStage.effectiveLifeStage,
      isManualLifeStageOverride: resolvedStage.isManualLifeStageOverride,
      warnings: resolvedStage.warnings,
      treatMode: dog.treatInputMode,
      treatLevel: dog.treatLevel ?? undefined,
      treatPercentage,
    };
  }

  return result;
}

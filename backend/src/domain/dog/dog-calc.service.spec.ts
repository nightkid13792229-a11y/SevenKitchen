/**
 * DogCalcService Unit Tests
 * Tests for dog energy calculation with boundary cases
 * Based on docs/07_Core_Architecture.md Section 3.1
 */

import {
  calculateDogEnergy,
  calculateRER,
  calculateTotalDer,
  calculateFreshFoodNeeds,
  calculateAgeMonths,
  determineSizeClass,
} from './dog-calc.service';
import { Dog } from './dog.entity';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from './enums';

describe('DogCalcService', () => {
  const createMockDog = (overrides?: {
    birthday?: Date;
    currentWeightKg?: number;
    bcsScore?: number;
    activityLevel?: ActivityLevel;
    isNeutered?: boolean;
    lifeStageOverride?: LifeStageOverride;
    sizeClassOverride?: DogSizeCategory | null;
    treatInputMode?: TreatInputMode;
    treatLevel?: TreatLevel;
    manualTreatKcal?: number | null;
  }): Dog => {
    return new Dog(
      'dog-id-1',
      'owner-id-1',
      'Test Dog',
      'breed-id-1',
      overrides?.birthday ?? new Date('2020-01-01'),
      DogGender.MALE,
      overrides?.isNeutered ?? false,
      overrides?.currentWeightKg ?? 10.0,
      overrides?.bcsScore ?? 5,
      overrides?.activityLevel ?? ActivityLevel.NORMAL,
      overrides?.lifeStageOverride ?? LifeStageOverride.NONE,
      overrides?.sizeClassOverride ?? null,
      2,
      overrides?.treatInputMode ?? TreatInputMode.ESTIMATE_LEVEL,
      overrides?.treatLevel ?? TreatLevel.LOW,
      overrides?.manualTreatKcal ?? null,
      null,
      0,
    );
  };

  describe('calculateRER', () => {
    it('should calculate RER for a 10kg dog', () => {
      const rer = calculateRER(10);
      // RER = 70 * 10^0.75 ≈ 70 * 5.623 ≈ 393.6
      expect(rer).toBeCloseTo(393.6, 1);
    });

    it('should calculate RER for a very small dog (1kg)', () => {
      const rer = calculateRER(1);
      // RER = 70 * 1^0.75 = 70
      expect(rer).toBeCloseTo(70, 1);
    });

    it('should calculate RER for a large dog (50kg)', () => {
      const rer = calculateRER(50);
      // RER = 70 * 50^0.75 ≈ 70 * 18.8 ≈ 1316
      // Allow ±20 kcal tolerance
      expect(rer).toBeGreaterThan(1296);
      expect(rer).toBeLessThan(1336);
    });
  });

  describe('calculateAgeMonths', () => {
    it('should calculate age correctly for a 1-year-old dog', () => {
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);

      const ageMonths = calculateAgeMonths(oneYearAgo);
      expect(ageMonths).toBeGreaterThanOrEqual(11);
      expect(ageMonths).toBeLessThanOrEqual(13);
    });

    it('should calculate age correctly for a 6-month-old dog', () => {
      const today = new Date();
      const sixMonthsAgo = new Date(today);
      sixMonthsAgo.setMonth(today.getMonth() - 6);

      const ageMonths = calculateAgeMonths(sixMonthsAgo);
      expect(ageMonths).toBeGreaterThanOrEqual(5);
      expect(ageMonths).toBeLessThanOrEqual(7);
    });
  });

  describe('calculateTotalDer', () => {
    it('should calculate DER for an adult intact dog', () => {
      const dog = createMockDog({
        birthday: new Date('2019-01-01'), // 5+ years old
        isNeutered: false,
        activityLevel: ActivityLevel.NORMAL,
      });

      const der = calculateTotalDer(dog);
      // Should be RER * ADULT_INTACT (1.8) * NORMAL (1.0) * BCS (1.0 for ideal)
      expect(der).toBeGreaterThan(0);
      // For 10kg dog: RER ≈ 393.6, DER ≈ 393.6 * 1.8 ≈ 708
      // Allow ±10 kcal tolerance for floating point precision
      expect(der).toBeGreaterThan(698);
      expect(der).toBeLessThan(718);
    });

    it('should calculate DER for a neutered adult dog', () => {
      const dog = createMockDog({
        birthday: new Date('2019-01-01'),
        isNeutered: true,
        activityLevel: ActivityLevel.NORMAL,
      });

      const der = calculateTotalDer(dog);
      // Should be RER * ADULT_NEUTERED (1.6) * NORMAL (1.0) * BCS (1.0)
      expect(der).toBeGreaterThan(0);
      // For 10kg dog: RER ≈ 393.6, DER ≈ 393.6 * 1.6 ≈ 630
      // Allow ±10 kcal tolerance for floating point precision
      expect(der).toBeGreaterThan(620);
      expect(der).toBeLessThan(640);
    });

    it('should calculate DER for a puppy (2 months old)', () => {
      const today = new Date();
      const twoMonthsAgo = new Date(today);
      twoMonthsAgo.setMonth(today.getMonth() - 2);

      const dog = createMockDog({
        birthday: twoMonthsAgo,
        isNeutered: false,
      });

      const der = calculateTotalDer(dog);
      // Puppy should have higher DER (PUPPY_0_4_MONTHS = 3.0)
      expect(der).toBeGreaterThan(0);
      // For 10kg puppy: RER ≈ 393.6, DER ≈ 393.6 * 3.0 ≈ 1180
      // Allow ±100 kcal tolerance for floating point precision
      expect(der).toBeGreaterThan(1000);
      expect(der).toBeLessThan(1300);
    });

    it('should apply activity multiplier for working dog', () => {
      const dog = createMockDog({
        birthday: new Date('2019-01-01'),
        isNeutered: true,
        activityLevel: ActivityLevel.WORKING, // 1.5x multiplier
      });

      const der = calculateTotalDer(dog);
      // Should be RER * ADULT_NEUTERED (1.6) * WORKING (1.5) * BCS (1.0)
      expect(der).toBeGreaterThan(0);
      // For 10kg dog: RER ≈ 393.6, DER ≈ 393.6 * 1.6 * 1.5 ≈ 945
      // Allow ±10 kcal tolerance for floating point precision
      expect(der).toBeGreaterThan(935);
      expect(der).toBeLessThan(955);
    });

    it('should apply BCS adjustment for overweight dog (BCS 7)', () => {
      const dog = createMockDog({
        birthday: new Date('2019-01-01'),
        isNeutered: true,
        bcsScore: 7, // Overweight: -20% (0.8 multiplier)
      });

      const der = calculateTotalDer(dog);
      // Should be RER * ADULT_NEUTERED (1.6) * NORMAL (1.0) * BCS (0.8)
      expect(der).toBeGreaterThan(0);
      // For 10kg dog: RER ≈ 393.6, DER ≈ 393.6 * 1.6 * 0.8 ≈ 504
      // Allow ±10 kcal tolerance for floating point precision
      expect(der).toBeGreaterThan(494);
      expect(der).toBeLessThan(514);
    });

    it('should apply BCS adjustment for underweight dog (BCS 2)', () => {
      const dog = createMockDog({
        birthday: new Date('2019-01-01'),
        isNeutered: true,
        bcsScore: 2, // Underweight: +40% (1.4 multiplier)
      });

      const der = calculateTotalDer(dog);
      // Should be RER * ADULT_NEUTERED (1.6) * NORMAL (1.0) * BCS (1.4)
      expect(der).toBeGreaterThan(0);
      // For 10kg dog: RER ≈ 393.6, DER ≈ 393.6 * 1.6 * 1.4 ≈ 882
      // Allow ±10 kcal tolerance for floating point precision
      expect(der).toBeGreaterThan(872);
      expect(der).toBeLessThan(892);
    });
  });

  describe('calculateFreshFoodNeeds', () => {
    it('should calculate treat deduction for ESTIMATE_LEVEL LOW', () => {
      const dog = createMockDog({
        treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
        treatLevel: TreatLevel.LOW, // 3%
      });

      const result = calculateFreshFoodNeeds(dog);
      expect(result.totalDer).toBeGreaterThan(0);
      expect(result.treatDeduction).toBeGreaterThan(0);
      // Treat deduction should be ~3% of DER
      expect(result.treatDeduction).toBeCloseTo(
        result.totalDer * 0.03,
        10,
      );
      expect(result.finalFoodKcal).toBeCloseTo(
        result.totalDer - result.treatDeduction,
        1,
      );
      expect(result.isTreatCapped).toBe(false);
    });

    it('should calculate treat deduction for ESTIMATE_LEVEL HIGH', () => {
      const dog = createMockDog({
        treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
        treatLevel: TreatLevel.HIGH, // 10%
      });

      const result = calculateFreshFoodNeeds(dog);
      expect(result.treatDeduction).toBeGreaterThan(0);
      // Treat deduction should be ~10% of DER (may hit cap)
      expect(result.treatDeduction).toBeLessThanOrEqual(
        result.totalDer * 0.1,
      );
    });

    it('should calculate treat deduction for EXACT_KCAL mode', () => {
      const dog = createMockDog({
        treatInputMode: TreatInputMode.EXACT_KCAL,
        manualTreatKcal: 100,
      });

      const result = calculateFreshFoodNeeds(dog);
      // Treat deduction should match manual input (unless capped)
      expect(result.treatDeduction).toBeGreaterThanOrEqual(0);
      expect(result.treatDeduction).toBeLessThanOrEqual(100);
      expect(result.finalFoodKcal).toBeCloseTo(
        result.totalDer - result.treatDeduction,
        1,
      );
      // If DER is high enough, treat deduction should be exactly 100
      if (result.totalDer * 0.1 >= 100) {
        expect(result.treatDeduction).toBe(100);
        expect(result.isTreatCapped).toBe(false);
      }
    });

    it('should cap treat deduction at 10% for EXACT_KCAL exceeding cap', () => {
      const dog = createMockDog({
        treatInputMode: TreatInputMode.EXACT_KCAL,
        manualTreatKcal: 1000, // Very high, should be capped
      });

      const result = calculateFreshFoodNeeds(dog);
      const maxTreatAllowance = result.totalDer * 0.1;
      expect(result.treatDeduction).toBeLessThanOrEqual(maxTreatAllowance);
      expect(result.isTreatCapped).toBe(true);
    });

    it('should handle NONE treat level', () => {
      const dog = createMockDog({
        treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
        treatLevel: TreatLevel.NONE,
      });

      const result = calculateFreshFoodNeeds(dog);
      expect(result.treatDeduction).toBe(0);
      expect(result.finalFoodKcal).toBeCloseTo(result.totalDer, 1);
    });
  });

  describe('calculateDogEnergy', () => {
    it('should return complete result for adult dog', () => {
      const dog = createMockDog({
        birthday: new Date('2019-01-01'),
        isNeutered: true,
      });

      const result = calculateDogEnergy(dog);

      expect(result.rer).toBeGreaterThan(0);
      expect(result.der).toBeGreaterThan(0);
      expect(result.treatDeduction).toBeGreaterThanOrEqual(0);
      expect(result.finalFoodKcal).toBeGreaterThanOrEqual(0);
      expect(typeof result.isTreatCapped).toBe('boolean');
      expect(result.der).toBeGreaterThanOrEqual(result.finalFoodKcal);
    });

    it('should calculate dailyIntakeG when recipe energy density provided', () => {
      const dog = createMockDog({
        birthday: new Date('2019-01-01'),
        isNeutered: true,
      });

      const energyDensity = 1450; // kcal/kg
      const result = calculateDogEnergy(dog, energyDensity);

      expect(result.dailyIntakeG).toBeDefined();
      expect(result.dailyIntakeG!).toBeGreaterThan(0);
      // dailyIntakeG = (finalFoodKcal / energyDensity) * 1000
      const expected = (result.finalFoodKcal / energyDensity) * 1000;
      expect(result.dailyIntakeG).toBeCloseTo(expected, 1);
    });

    it('should handle boundary case: very small dog (1kg)', () => {
      const dog = createMockDog({
        currentWeightKg: 1.0,
        birthday: new Date('2019-01-01'),
      });

      const result = calculateDogEnergy(dog);

      expect(result.rer).toBeCloseTo(70, 1); // RER = 70 * 1^0.75 = 70
      expect(result.der).toBeGreaterThan(0);
      expect(result.finalFoodKcal).toBeGreaterThanOrEqual(0);
    });

    it('should handle boundary case: very large dog (80kg)', () => {
      const dog = createMockDog({
        currentWeightKg: 80.0,
        birthday: new Date('2019-01-01'),
        sizeClassOverride: DogSizeCategory.GIANT,
      });

      const result = calculateDogEnergy(dog);

      expect(result.rer).toBeGreaterThan(1000); // Large RER for 80kg
      expect(result.der).toBeGreaterThan(result.rer);
      expect(result.finalFoodKcal).toBeGreaterThanOrEqual(0);
    });

    it('should handle boundary case: puppy vs adult comparison', () => {
      const today = new Date();
      const twoMonthsAgo = new Date(today);
      twoMonthsAgo.setMonth(today.getMonth() - 2);

      const puppy = createMockDog({
        birthday: twoMonthsAgo,
        isNeutered: false,
      });

      const adult = createMockDog({
        birthday: new Date('2019-01-01'),
        isNeutered: false,
      });

      const puppyResult = calculateDogEnergy(puppy);
      const adultResult = calculateDogEnergy(adult);

      // Puppy should have higher DER than adult (same weight)
      expect(puppyResult.der).toBeGreaterThan(adultResult.der);
    });
  });
});

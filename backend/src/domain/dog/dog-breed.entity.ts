/**
 * DogBreed Entity
 * System data for dog breed information
 * Based on docs/07_Core_Architecture.md Section 2.2
 */

import { DogSizeCategory, GrowthCurveType } from './enums';
import { ValidationError } from '../common/errors';

/**
 * DogBreed Entity
 * Represents breed-specific data used for energy calculations
 */
export class DogBreed {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly sizeCategory: DogSizeCategory,
    public readonly growthCurveType: GrowthCurveType,
    public readonly adultAgeMonths: number,
    public readonly seniorAgeYears: number,
    public readonly averageAdultWeightKg: number | null,
    public readonly isCommon: boolean = false,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    // Adult age must be positive
    if (this.adultAgeMonths <= 0) {
      throw new ValidationError(
        `Adult age must be positive, got: ${this.adultAgeMonths}`,
      );
    }

    // Senior age must be positive
    if (this.seniorAgeYears <= 0) {
      throw new ValidationError(
        `Senior age must be positive, got: ${this.seniorAgeYears}`,
      );
    }

    // Senior age should be reasonable (at least 5 years)
    if (this.seniorAgeYears < 5) {
      throw new ValidationError(
        `Senior age should be at least 5 years, got: ${this.seniorAgeYears}`,
      );
    }

    // Average adult weight must be positive if provided
    if (this.averageAdultWeightKg !== null && this.averageAdultWeightKg <= 0) {
      throw new ValidationError(
        `Average adult weight must be positive if provided, got: ${this.averageAdultWeightKg}`,
      );
    }

    // Name must be non-empty
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationError('Breed name must be non-empty');
    }
  }

  /**
   * Get adult threshold in months
   * This is the primary source for adult age threshold
   */
  getAdultThresholdMonths(): number {
    return this.adultAgeMonths;
  }

  /**
   * Get senior threshold in years
   * This is the primary source for senior age threshold
   */
  getSeniorThresholdYears(): number {
    return this.seniorAgeYears;
  }

  /**
   * Check if a given age (in months) qualifies as senior
   */
  isSenior(ageMonths: number): boolean {
    const ageYears = ageMonths / 12.0;
    return ageYears >= this.seniorAgeYears;
  }
}

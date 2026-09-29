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
    public readonly aliases: string[],
    public readonly sizeCategory: DogSizeCategory,
    public readonly growthCurveType: GrowthCurveType,
    public readonly adultAgeMonths: number,
    public readonly seniorAgeYears: number,
    public readonly averageAdultWeightKg: number | null,
    public readonly isCommon: boolean = false,
    /**
     * 体况分下限（深胸细腰型犬，如灵缇 = 4）；其余犬种为 null。
     *
     * 这类犬在理想体态下就能摸到肋骨且几乎没肉，体况问卷会如实算出 2-3 分，
     * 进而把目标体重定高 33-54%。小程序取 `max(算出的分, 本值)` 修正。
     * 名单与数值都放在数据库，改完即生效，不用发小程序版本。
     */
    public readonly bcsScoreFloor: number | null = null,
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

    // Body condition score floor must be a valid BCS value (1-9) if provided
    if (
      this.bcsScoreFloor !== null &&
      (!Number.isInteger(this.bcsScoreFloor) ||
        this.bcsScoreFloor < 1 ||
        this.bcsScoreFloor > 9)
    ) {
      throw new ValidationError(
        `BCS score floor must be an integer between 1 and 9, got: ${this.bcsScoreFloor}`,
      );
    }

    const invalidAlias = this.aliases.find(
      (alias) => !alias || alias.trim().length === 0,
    );
    if (invalidAlias !== undefined) {
      throw new ValidationError('Breed aliases must be non-empty');
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

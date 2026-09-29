/**
 * DogBreed Entity
 * System data for dog breed information
 * Based on docs/07_Core_Architecture.md Section 2.2
 */

import { DogSizeCategory, GrowthCurveType } from './enums';
import { ValidationError } from '../common/errors';

/**
 * 体况问卷的选项数量，换算表必须与它一一对应。
 *
 * 与小程序 `miniapp/src/utils/bcs-questionnaire.ts` 里的 BCS_QUESTIONS[0].options
 * 保持一致 —— 那边改选项数，这里要跟着改，否则换算表会被判为非法而整体忽略。
 */
export const BCS_OPTION_COUNT = 5;

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
     * 体况问卷的选项换算表（按选项顺序，如灵缇 = [4,5,6,7,9]）；
     * **空数组表示用标准分 [2,3,5,7,9]**。
     *
     * 用空数组而不是 null：Prisma 的标量列表（Int[]）在客户端类型上不可空，
     * 数据库里放 NULL 会在读写时报类型错误。
     *
     * 深胸细腰型犬在理想体态下就能摸到肋骨且几乎没肉，按标准分会被算成
     * 2-3 分，进而把目标体重定高 33-54%。名单与换算表都放在数据库，
     * 改完即生效，不用发小程序版本、不用走微信审核。
     */
    public readonly bcsScoreMap: number[] = [],
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

    // 选项换算表：空数组 = 用标准分；给了就必须与问卷选项数一致、且每档都是 1-9 的整数。
    // 用 Array.isArray 兜底：类型上不可空，但数据库里这一列可能被写成 NULL
    // （原始 SQL 插入、或在加 DEFAULT 之前建的行），那种情况按"没有特殊换算表"处理。
    const scoreMap = this.bcsScoreMap ?? [];
    if (scoreMap.length > 0) {
      if (
        !Array.isArray(scoreMap) ||
        scoreMap.length !== BCS_OPTION_COUNT
      ) {
        throw new ValidationError(
          `BCS score map must have exactly ${BCS_OPTION_COUNT} entries ` +
            `(one per questionnaire option), got: ${JSON.stringify(scoreMap)}`,
        );
      }
      const invalid = scoreMap.find(
        (score) => !Number.isInteger(score) || score < 1 || score > 9,
      );
      if (invalid !== undefined) {
        throw new ValidationError(
          `Every BCS score map entry must be an integer between 1 and 9, got: ${invalid}`,
        );
      }
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

import { Injectable } from '@nestjs/common';
import type { UnitNormalizationStatus } from './nutrition-calculation.types';

const KCAL_TO_MJ = 0.004184;

const MASS_TO_GRAMS: Record<string, number> = {
  g: 1,
  mg: 0.001,
  ug: 0.000001,
};

const ENERGY_TO_KCAL: Record<string, number> = {
  kcal: 1,
  MJ: 1 / KCAL_TO_MJ,
};

export type NutrientBasis =
  | 'PER_100G_AS_FED'
  | 'PER_100G_DRY_MATTER'
  | 'PER_1000_KCAL_ME'
  | 'PER_MJ_ME';

export interface UnitConversionResult {
  status: UnitNormalizationStatus;
  value: number | null;
  unit: string;
  reasons: string[];
}

export interface BasisNormalizationInput {
  nutrientTotal: number;
  nutrientUnit: string;
  basis: NutrientBasis;
  totalWeightG: number;
  dryMatterG: number;
  totalEnergyKcal: number;
}

export interface BasisNormalizationResult extends UnitConversionResult {
  basis: NutrientBasis;
}

@Injectable()
export class NutritionUnitNormalizerService {
  convertUnit(
    value: number,
    fromUnit: string,
    toUnit: string,
  ): UnitConversionResult {
    const normalizedFromUnit = this.normalizeUnit(fromUnit);
    const normalizedToUnit = this.normalizeUnit(toUnit);

    if (normalizedFromUnit === normalizedToUnit) {
      return {
        status: 'RESOLVED',
        value,
        unit: toUnit,
        reasons: [],
      };
    }

    const massValue = this.convertByFactor(
      value,
      normalizedFromUnit,
      normalizedToUnit,
      MASS_TO_GRAMS,
    );
    if (massValue !== null) {
      return {
        status: 'RESOLVED',
        value: massValue,
        unit: toUnit,
        reasons: [],
      };
    }

    const energyValue = this.convertByFactor(
      value,
      normalizedFromUnit,
      normalizedToUnit,
      ENERGY_TO_KCAL,
    );
    if (energyValue !== null) {
      return {
        status: 'RESOLVED',
        value: energyValue,
        unit: toUnit,
        reasons: [],
      };
    }

    return {
      status: 'UNSUPPORTED_UNIT',
      value: null,
      unit: toUnit,
      reasons: [`Unsupported conversion from ${fromUnit} to ${toUnit}`],
    };
  }

  toBasis(input: BasisNormalizationInput): BasisNormalizationResult {
    switch (input.basis) {
      case 'PER_100G_AS_FED':
        if (input.totalWeightG <= 0) {
          return this.missingBasis(
            input,
            'totalWeightG must be greater than 0',
          );
        }

        return this.resolvedBasis(
          input,
          (input.nutrientTotal / input.totalWeightG) * 100,
        );

      case 'PER_100G_DRY_MATTER':
        if (input.dryMatterG <= 0) {
          return this.missingBasis(input, 'dryMatterG must be greater than 0');
        }

        return this.resolvedBasis(
          input,
          (input.nutrientTotal / input.dryMatterG) * 100,
        );

      case 'PER_1000_KCAL_ME':
        if (input.totalEnergyKcal <= 0) {
          return this.missingBasis(
            input,
            'totalEnergyKcal must be greater than 0',
          );
        }

        return this.resolvedBasis(
          input,
          (input.nutrientTotal / input.totalEnergyKcal) * 1000,
        );

      case 'PER_MJ_ME':
        if (input.totalEnergyKcal <= 0) {
          return this.missingBasis(
            input,
            'totalEnergyKcal must be greater than 0',
          );
        }

        return this.resolvedBasis(
          input,
          input.nutrientTotal / (input.totalEnergyKcal * KCAL_TO_MJ),
        );
    }
  }

  private normalizeUnit(unit: string): string {
    const normalizedUnit = unit.trim();
    const lowerUnit = normalizedUnit.toLowerCase();

    if (lowerUnit === 'μg' || lowerUnit === 'mcg') {
      return 'ug';
    }

    if (lowerUnit === 'kilocalorie' || lowerUnit === 'kilocalories') {
      return 'kcal';
    }

    if (lowerUnit === 'mj') {
      return 'MJ';
    }

    return lowerUnit;
  }

  private convertByFactor(
    value: number,
    fromUnit: string,
    toUnit: string,
    factors: Record<string, number>,
  ): number | null {
    const fromFactor = factors[fromUnit];
    const toFactor = factors[toUnit];

    if (fromFactor === undefined || toFactor === undefined) {
      return null;
    }

    return (value * fromFactor) / toFactor;
  }

  private resolvedBasis(
    input: BasisNormalizationInput,
    value: number,
  ): BasisNormalizationResult {
    return {
      status: 'RESOLVED',
      value,
      unit: input.nutrientUnit,
      basis: input.basis,
      reasons: [],
    };
  }

  private missingBasis(
    input: BasisNormalizationInput,
    reason: string,
  ): BasisNormalizationResult {
    return {
      status: 'MISSING_BASIS',
      value: null,
      unit: input.nutrientUnit,
      basis: input.basis,
      reasons: [reason],
    };
  }
}

import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import {
  AgentRecipeConstraintDto,
  FediafTargetQueryDto,
  RecipeNutritionCalculationRequestDto,
} from '../../../src/interfaces/dto/nutrition-calculation/nutrition-calculation.dto';

const findValidationError = (
  errors: ValidationError[],
  property: string,
): ValidationError | undefined => {
  for (const error of errors) {
    if (error.property === property) {
      return error;
    }

    const childError = findValidationError(error.children ?? [], property);
    if (childError) {
      return childError;
    }
  }

  return undefined;
};

describe('nutrition calculation DTO contracts', () => {
  it('validates the exact FEDIAF target query life stages', () => {
    for (const lifeStage of [
      'EARLY_GROWTH_UNDER_14_WEEKS',
      'LATE_GROWTH_FROM_14_WEEKS',
      'REPRODUCTION',
      'ADULT_MER_95',
      'ADULT_MER_110',
    ]) {
      const dto = plainToInstance(FediafTargetQueryDto, { lifeStage });

      expect(validateSync(dto)).toHaveLength(0);
    }

    const dto = plainToInstance(FediafTargetQueryDto, {
      lifeStage: 'ADULT',
    });

    expect(findValidationError(validateSync(dto), 'lifeStage')).toBeDefined();
  });

  it('validates future calculator request shape', () => {
    const dto = plainToInstance(RecipeNutritionCalculationRequestDto, {
      species: 'DOG',
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetProfile: { lifeStage: 'ADULT_MER_110' },
      items: [
        {
          ingredientId: 'ingredient-1',
          amountG: 100,
          asFed: true,
          processingYield: 1,
        },
      ],
      options: {
        includeIncompleteNutrients: true,
        basis: ['PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME'],
      },
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects empty future calculator request items', () => {
    const dto = plainToInstance(RecipeNutritionCalculationRequestDto, {
      species: 'DOG',
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetProfile: { lifeStage: 'ADULT_MER_110' },
      items: [],
      options: {
        includeIncompleteNutrients: true,
        basis: ['PER_100G_DRY_MATTER'],
      },
    });

    expect(findValidationError(validateSync(dto), 'items')).toBeDefined();
  });

  it('rejects unsupported calculation bases in nested request options', () => {
    const dto = plainToInstance(RecipeNutritionCalculationRequestDto, {
      species: 'DOG',
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetProfile: { lifeStage: 'ADULT_MER_110' },
      items: [
        {
          ingredientId: 'ingredient-1',
          amountG: 100,
          asFed: true,
          processingYield: 1,
        },
      ],
      options: {
        includeIncompleteNutrients: true,
        basis: ['PER_SERVING'],
      },
    });

    expect(findValidationError(validateSync(dto), 'basis')).toBeDefined();
  });

  it('validates Agent constraints without allowing publish authority', () => {
    const dto = plainToInstance(AgentRecipeConstraintDto, {
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetLifeStage: 'ADULT_MER_110',
      allowedIngredientIds: ['ingredient-1'],
      excludedIngredientIds: ['ingredient-2'],
      supplementStrategy: { allowedNutrientCodes: ['calcium'] },
      maxDailyCostCny: 30,
      requireHumanReview: true,
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requireHumanReview).toBe(true);
  });

  it('requires Agent constraints to keep human review enabled', () => {
    const dto = plainToInstance(AgentRecipeConstraintDto, {
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetLifeStage: 'ADULT_MER_110',
      allowedIngredientIds: ['ingredient-1'],
      excludedIngredientIds: [],
      supplementStrategy: { allowedNutrientCodes: ['calcium'] },
      requireHumanReview: false,
    });

    expect(
      findValidationError(validateSync(dto), 'requireHumanReview'),
    ).toBeDefined();
  });

  it('rejects Agent constraints without allowed ingredients', () => {
    const dto = plainToInstance(AgentRecipeConstraintDto, {
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetLifeStage: 'ADULT_MER_110',
      allowedIngredientIds: [],
      excludedIngredientIds: [],
      supplementStrategy: { allowedNutrientCodes: ['calcium'] },
      requireHumanReview: true,
    });

    expect(
      findValidationError(validateSync(dto), 'allowedIngredientIds'),
    ).toBeDefined();
  });
});

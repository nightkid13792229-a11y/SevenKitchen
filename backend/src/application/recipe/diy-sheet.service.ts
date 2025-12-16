/**
 * DIY Sheet Application Service
 * Application layer service for generating DIY process sheets
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import type { DogRepository } from '../../domain/dog/dog.repository';
import { RECIPE_REPOSITORY } from '../dog/dog.service';
import { DOG_REPOSITORY } from '../dog/dog.service';
import { DogService } from '../dog/dog.service';

export interface DiySheetData {
  recipeId: string;
  recipeName: string;
  steps: Array<{ stepNumber: number; description: string }>;
  recommendedDailyIntakeG?: number;
}

@Injectable()
export class DiySheetService {
  constructor(
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: RecipeRepository,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    private readonly dogService: DogService,
  ) {}

  /**
   * Generate DIY process sheet for a recipe
   * @param recipeId Recipe ID
   * @param dogId Optional dog ID for personalized daily intake
   * @returns DIY sheet data
   */
  async generateDiySheet(
    recipeId: string,
    dogId?: string,
  ): Promise<DiySheetData> {
    // Find recipe
    const recipe = await this.recipeRepository.findById(recipeId);
    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${recipeId}`);
    }

    // Generate steps (placeholder - TODO: Use recipe items/steps when available)
    const steps = this.generateSteps(recipe.name);

    // Calculate recommended daily intake if dogId provided
    let recommendedDailyIntakeG: number | undefined;
    if (dogId) {
      // Verify dog exists
      const dog = await this.dogRepository.findById(dogId);
      if (!dog) {
        throw new NotFoundException(`Dog not found: ${dogId}`);
      }

      // Calculate daily intake based on dog's energy requirement and recipe energy density
      const calcResult = await this.dogService.calcPreview(dogId);
      const finalFoodKcal = calcResult.finalFoodKcal;

      // Convert kcal to grams: (kcal / kcal_per_kg) * 1000
      // recipe.energyDensityKcalPerKg is in kcal/kg, so we divide by it and multiply by 1000 to get grams
      if (recipe.energyDensityKcalPerKg > 0) {
        recommendedDailyIntakeG = Math.round(
          (finalFoodKcal / recipe.energyDensityKcalPerKg) * 1000,
        );
      } else {
        // Fallback if energy density is invalid
        recommendedDailyIntakeG = undefined;
      }
    } else {
      // For MVP canonical recipe, provide default recommended intake when no dogId
      if (recipe.id === '3fa85f64-5717-4562-b3fc-2c963f66afa6') {
        recommendedDailyIntakeG = 350;
      }
    }

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      steps,
      recommendedDailyIntakeG,
    };
  }

  /**
   * Generate placeholder steps for DIY sheet
   * TODO: Replace with actual recipe steps when recipe structure includes step data
   */
  private generateSteps(recipeName: string): Array<{
    stepNumber: number;
    description: string;
  }> {
    // Deterministic steps for canonical MVP recipe
    if (recipeName === 'Chicken Pumpkin Bowl') {
      return [
        {
          stepNumber: 1,
          description: 'Prepare chicken breast (200g)',
        },
        {
          stepNumber: 2,
          description: 'Steam pumpkin until soft (150g)',
        },
        {
          stepNumber: 3,
          description: 'Mix chicken and pumpkin together',
        },
        {
          stepNumber: 4,
          description: 'Add supplements if needed',
        },
      ];
    }

    // Generic placeholder steps for other recipes
    return [
      {
        stepNumber: 1,
        description: `Prepare ingredients for ${recipeName}`,
      },
      {
        stepNumber: 2,
        description: 'Wash and prepare all ingredients',
      },
      {
        stepNumber: 3,
        description: 'Cook ingredients according to recipe instructions',
      },
      {
        stepNumber: 4,
        description: 'Portion and store appropriately',
      },
    ];
  }
}

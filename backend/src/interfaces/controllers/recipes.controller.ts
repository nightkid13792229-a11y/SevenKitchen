/**
 * Recipes Controller
 * Handles recipe related endpoints
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import { Inject } from '@nestjs/common';
import {
  RecipeSummaryDto,
  RecipeDetailDto,
} from '../dto/recipes/recipe-response.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { RecipeStatus, NutritionStandard } from '../../domain/recipe/enums';
import { DiySheetService } from '../../application/recipe/diy-sheet.service';
import {
  GenerateDiySheetDto,
  DiySheetResponseDto,
} from '../dto/recipes/diy-sheet.dto';

// Create a symbol for recipe repository token
export const RECIPE_REPOSITORY_TOKEN = Symbol('RecipeRepository');

@ApiTags('Recipes')
@Controller('api/v1/recipes')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RecipesController {
  constructor(
    @Inject(RECIPE_REPOSITORY_TOKEN)
    private readonly recipeRepository: RecipeRepository,
    private readonly diySheetService: DiySheetService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List public recipes' })
  @ApiResponse({
    status: 200,
    description: 'List of recipes',
    type: [RecipeSummaryDto],
  })
  async listRecipes(): Promise<ApiResponseDto<RecipeSummaryDto[]>> {
    const recipes = await this.recipeRepository.findPublicRecipes();

    // DEBUG: Log recipe count (development only)
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      console.log(
        `[RecipesController] GET /recipes: found ${recipes.length} PUBLIC recipe(s)`,
      );
      if (recipes.length === 0) {
        console.warn(
          `[RecipesController] WARNING: No PUBLIC recipes found. Check seeding logic.`,
        );
      }
    }

    const summaries: RecipeSummaryDto[] = recipes.map((recipe) => ({
      id: recipe.id,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status as RecipeStatus, // TODO: Map properly when Recipe interface is complete
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
    }));

    return ApiResponseDto.success(summaries);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get recipe detail' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({
    status: 200,
    description: 'Recipe detail',
    type: RecipeDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async getRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<RecipeDetailDto> | ApiResponseDto<null>> {
    const recipe = await this.recipeRepository.findById(id);
    if (!recipe) {
      return ApiResponseDto.error(404, 'Recipe not found');
    }

    // TODO: Map to full RecipeDetailDto when Recipe interface is complete
    const detail: RecipeDetailDto = {
      id: recipe.id,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status as RecipeStatus,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      productionLossRate: recipe.productionLossRate,
      nutritionStandard: NutritionStandard.FEDIAF_2021, // TODO: Get from recipe
      targetHealthTags: [], // TODO: Get from recipe
      applicableLifeStages: [], // TODO: Get from recipe
      // Add description for canonical MVP recipe
      description:
        recipe.id === '3fa85f64-5717-4562-b3fc-2c963f66afa6'
          ? 'Balanced chicken and pumpkin recipe for MVP end-to-end testing'
          : undefined,
    };

    return ApiResponseDto.success(detail);
  }

  @Post(':id/diy-sheet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate DIY process sheet for recipe' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiBody({ type: GenerateDiySheetDto })
  @ApiResponse({
    status: 200,
    description: 'DIY process sheet generated successfully',
    type: DiySheetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async generateDiySheet(
    @Param('id') recipeId: string,
    @Body() dto: GenerateDiySheetDto,
  ): Promise<ApiResponseDto<DiySheetResponseDto> | ApiResponseDto<null>> {
    try {
      const sheetData = await this.diySheetService.generateDiySheet(
        recipeId,
        dto.dogId,
      );

      const response: DiySheetResponseDto = {
        recipeId: sheetData.recipeId,
        recipeName: sheetData.recipeName,
        steps: sheetData.steps,
        recommendedDailyIntakeG: sheetData.recommendedDailyIntakeG,
      };

      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }
}

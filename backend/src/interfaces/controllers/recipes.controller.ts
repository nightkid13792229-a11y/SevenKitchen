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
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
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
import { FilterOptionsDto } from '../dto/recipes/filter-options.dto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { Prisma } from '@prisma/client';

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
    private readonly prisma: PrismaService,
  ) {}

  @Get('filter-options')
  @ApiOperation({ summary: 'Get available filter options' })
  @ApiResponse({
    status: 200,
    description: 'Filter options',
    type: FilterOptionsDto,
  })
  async getFilterOptions(): Promise<ApiResponseDto<FilterOptionsDto>> {
    const options = await this.recipeRepository.getFilterOptions();
    return ApiResponseDto.success(options);
  }

  @Get()
  @ApiOperation({ summary: 'List public recipes' })
  @ApiResponse({
    status: 200,
    description: 'List of recipes',
    type: [RecipeSummaryDto],
  })
  async listRecipes(
    @Query('lifeStage') lifeStage?: string,
    @Query('healthTags') healthTags?: string,
    @Query('excludeTags') excludeTags?: string,
  ): Promise<ApiResponseDto<RecipeSummaryDto[]>> {
    // Parse filter parameters
    const healthTagArray = healthTags ? healthTags.split(',') : [];
    const excludeTagArray = excludeTags ? excludeTags.split(',') : [];

    const recipes = await this.recipeRepository.findPublicRecipes({
      lifeStage,
      healthTags: healthTagArray,
      excludeTags: excludeTagArray,
    });

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

    const summaries: RecipeSummaryDto[] = recipes.map((recipe: any) => {
      // Parse JSON fields
      const applicableLifeStages = recipe.applicableLifeStages || [];
      const targetHealthTags = recipe.targetHealthTags || [];

      // Get top 6 ingredients by ratio
      const topIngredients = (recipe.items || [])
        .sort((a: any, b: any) => (b.ratioPercent || 0) - (a.ratioPercent || 0))
        .slice(0, 6)
        .map((item: any) => ({
          ingredientId: item.ingredientId,
          name: item.ingredient?.name || item.ingredient?.nameEn || 'Unknown',
          nameEn: item.ingredient?.nameEn,
          ratio: item.ratioPercent || 0,
        }));

      return {
        id: recipe.id,
        version: recipe.version,
        name: recipe.name,
        status: recipe.status as RecipeStatus,
        energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
        coverImageUrl: recipe.coverImageUrl,
        targetHealthTags: targetHealthTags,
        applicableLifeStages: applicableLifeStages,
        items: topIngredients,
      };
    });

    return ApiResponseDto.success(summaries);
  }

  /**
   * Convert preparation method UUID string to readable names
   * Input: "uuid1, uuid2, uuid3" or null
   * Output: ["方法1", "方法2", "方法3"] or undefined
   */
  private async convertPreparationMethods(
    methodUuids: string | null | undefined,
  ): Promise<string[] | undefined> {
    if (!methodUuids) return undefined;

    // Parse UUID string to array
    const uuids = methodUuids.split(',').map((u) => u.trim()).filter(Boolean);

    if (uuids.length === 0) return undefined;

    // Query preparation method names
    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: uuids } },
      select: { name: true },
    });

    return methods.map((m) => m.name);
  }

  /**
   * Map nutrition detailed data fields from DB format to API format
   * DB fields use snake_case (e.g., ash_dm_pct)
   * API expects camelCase (e.g., ashPercent)
   */
  private mapNutritionDetailedData(dbData: any): any {
    if (!dbData) return undefined;

    return {
      energyDensityKcalPerKg: dbData.energy_density_kcal_per_kg,
      proteinPercent: dbData.protein_dm_pct,
      fatPercent: dbData.fat_dm_pct,
      ashPercent: dbData.ash_dm_pct,
      moisturePercent: dbData.moisture_pct,
      crudeFiberPercent: dbData.fiber_dm_pct,
      carbohydratePercent: dbData.carbs_dm_pct,
      calciumPhosphorusRatio: dbData.ca_p_ratio,
    };
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

    // Return all ingredients with preparation method, sorted by sort_order
    const allIngredients = await Promise.all(
      (recipe.items || [])
        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(async (item: any) => {
          // Convert preparation method UUIDs to readable names
          const preparationMethods = await this.convertPreparationMethods(
            item.preparationMethod as string,
          );

          return {
            ingredientId: item.ingredientId,
            name: item.ingredient?.name || 'Unknown',
            preparationMethod: preparationMethods?.join('、') || undefined,
            ratio: item.ratioPercent || 0,
            sortOrder: item.sortOrder || 0,
            nutrientTargetKey: item.nutrientTargetKey || undefined,
            nutrientTargetValue: item.nutrientTargetValue || undefined,
            ingredientType: item.ingredient?.type || undefined,
            properties: (item.ingredient as any)?.properties || undefined,
          };
        }),
    );

    // Map nutrition detailed data from DB format to API format
    const nutritionDetailedData = this.mapNutritionDetailedData(
      (recipe as any).nutritionDetailedData,
    );

    const detail: RecipeDetailDto = {
      id: recipe.id,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status as RecipeStatus,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      coverImageUrl: (recipe as any).coverImageUrl,
      productionLossRate: recipe.productionLossRate,
      nutritionStandard: (recipe.nutritionStandard || NutritionStandard.FEDIAF_2021) as NutritionStandard,
      designSource: (recipe as any).designSource || undefined,
      targetHealthTags: (recipe as any).targetHealthTags || [],
      applicableLifeStages: (recipe as any).applicableLifeStages || [],
      nutritionDetailedData,
      items: allIngredients,
      description: (recipe as any).description,
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

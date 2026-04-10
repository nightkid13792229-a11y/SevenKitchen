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
  ForbiddenException,
  Inject,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import type {
  Recipe,
  RecipeRepository,
} from '../../domain/recipe/recipe.repository';
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
import { AuthGuard } from '../auth';
import { StaffGuard } from '../guards/role.guard';
import type { RequestUser } from '../auth/request-user.interface';
import { JwtAuthService } from '../auth/jwt.service';

// Create a symbol for recipe repository token
export const RECIPE_REPOSITORY_TOKEN = Symbol('RecipeRepository');

function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

@ApiTags('Recipes')
@Controller('api/v1/recipes')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RecipesController {
  constructor(
    @Inject(RECIPE_REPOSITORY_TOKEN)
    private readonly recipeRepository: RecipeRepository,
    private readonly diySheetService: DiySheetService,
    private readonly prisma: PrismaService,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  private async getAccessibleRecipe(
    id: string,
    shareToken?: string,
    req?: any,
  ): Promise<Recipe | null> {
    const recipe = await this.recipeRepository.findById(id);
    if (!recipe) {
      return null;
    }

    if (recipe.status === 'PUBLIC') {
      return recipe;
    }

    let accessGranted = false;

    try {
      const authHeader = req?.headers?.authorization;
      if (authHeader && typeof authHeader === 'string') {
        const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
        if (bearerMatch?.[1]) {
          const payload = this.jwtAuthService.validateToken(bearerMatch[1]);
          if (
            payload &&
            (payload.role === 'STAFF' || payload.role === 'ADMIN')
          ) {
            accessGranted = true;
          }
        }
      }
    } catch {
      // Token invalid or missing, continue to check shareToken
    }

    if (!accessGranted && shareToken) {
      const tokenRecord = await this.prisma.recipeShareToken.findFirst({
        where: {
          recipe: { recipeId: id },
          token: shareToken,
          expiresAt: { gt: new Date() },
        },
      });
      if (tokenRecord) {
        accessGranted = true;
      }
    }

    return accessGranted ? recipe : null;
  }

  private async incrementRecipeViewCount(id: string): Promise<void> {
    const latestRecipe = await this.prisma.recipe.findFirst({
      where: { recipeId: id },
      orderBy: { version: 'desc' },
      select: { id: true },
    });

    if (!latestRecipe) {
      return;
    }

    await this.prisma.recipe.update({
      where: { id: latestRecipe.id },
      data: { viewCount: { increment: 1 } },
    });
  }

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

  @Get('staff/all')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'List all recipes for staff (all statuses)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  async listStaffRecipes(
    @Query('status') status?: string,
  ): Promise<ApiResponseDto<any>> {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    // Get latest version of each recipe
    const recipes = await this.prisma.recipe.findMany({
      where,
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        recipeId: true,
        name: true,
        status: true,
        coverImageUrl: true,
        version: true,
        createdAt: true,
        applicableLifeStages: true,
        targetHealthTags: true,
      },
    });

    // Deduplicate: keep only the latest version per recipeId
    const seen = new Set<string>();
    const summaries = recipes.filter((r) => {
      if (seen.has(r.recipeId)) return false;
      seen.add(r.recipeId);
      return true;
    }).map((r) => ({
      id: r.recipeId,
      version: r.version,
      name: r.name,
      status: r.status,
      coverImageUrl: r.coverImageUrl?.replace('http://', 'https://'),
      applicableLifeStages: r.applicableLifeStages || [],
      targetHealthTags: r.targetHealthTags || [],
      createdAt: r.createdAt,
    }));

    return ApiResponseDto.success(summaries);
  }

  @Get()
  @ApiOperation({ summary: 'List public recipes (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of recipes',
  })
  async listRecipes(
    @Query('lifeStages') lifeStages?: string,
    @Query('healthTags') healthTags?: string,
    @Query('excludeTags') excludeTags?: string,
    @Query('excludeIngredients') excludeIngredients?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponseDto<any>> {
    // Parse pagination parameters
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;

    // Parse filter parameters
    const lifeStageArray = lifeStages ? lifeStages.split(',') : [];
    const healthTagArray = healthTags ? healthTags.split(',') : [];
    const excludeTagArray = excludeTags ? excludeTags.split(',') : [];
    const excludeIngredientArray = excludeIngredients
      ? excludeIngredients.split(',')
      : [];

    // Get paginated recipes
    const paginatedResult =
      await this.recipeRepository.findPublicRecipesPaginated({
        lifeStages: lifeStageArray,
        healthTags: healthTagArray,
        excludeTags: excludeTagArray,
        excludeIngredients: excludeIngredientArray,
        page: parsedPage,
        pageSize: parsedPageSize,
      });

    // DEBUG: Log recipe count (development only)
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG === 'true'
    ) {
      console.log(
        `[RecipesController] GET /recipes: page ${parsedPage}, pageSize ${parsedPageSize}, lifeStages: [${lifeStageArray.join(',') || 'all'}], healthTags: [${healthTagArray.join(',') || 'all'}], excludeTags: [${excludeTagArray.join(',') || 'none'}], excludeIngredients: [${excludeIngredientArray.join(',') || 'none'}], found ${paginatedResult.data.length} PUBLIC recipe(s) (total: ${paginatedResult.total})`,
      );
      if (paginatedResult.data.length === 0) {
        console.warn(
          `[RecipesController] WARNING: No PUBLIC recipes found for page ${parsedPage}. Check seeding logic.`,
        );
      }
    }

    const summaries: RecipeSummaryDto[] = paginatedResult.data.map(
      (recipe: any) => {
        // Parse JSON fields
        const applicableLifeStages = recipe.applicableLifeStages || [];
        const targetHealthTags = recipe.targetHealthTags || [];

        // Get top 6 ingredients by ratio (only FOOD type)
        const topIngredients = (recipe.items || [])
          .filter(
            (item: any) =>
              item.ingredient?.type === 'FOOD' && item.ratioPercent != null,
          )
          .sort(
            (a: any, b: any) => (b.ratioPercent || 0) - (a.ratioPercent || 0),
          )
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
          coverImageUrl: recipe.coverImageUrl?.replace('http://', 'https://'),
          targetHealthTags: targetHealthTags,
          applicableLifeStages: applicableLifeStages,
          items: topIngredients,
          viewCount: recipe.viewCount ?? 0,
          favoriteCount: recipe.favoriteCount ?? 0,
          diyGenCount: recipe.diyGenCount ?? 0,
        };
      },
    );

    // Return paginated result
    return ApiResponseDto.success({
      data: summaries,
      total: paginatedResult.total,
      page: paginatedResult.page,
      pageSize: paginatedResult.pageSize,
      hasMore: paginatedResult.hasMore,
    });
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
    const uuids = methodUuids
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (uuids.length === 0) return undefined;

    // Query preparation method names
    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: uuids } },
      select: { id: true, name: true },
    });

    // Create id -> name map
    const methodMap = new Map(methods.map((m) => [m.id, m.name]));

    // Return names in original UUID order (critical for maintaining user-defined order)
    return uuids
      .map((uuid) => methodMap.get(uuid))
      .filter((name): name is string => !!name);
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
  @ApiQuery({ name: 'shareToken', required: false, description: 'Share token for non-public recipes' })
  @ApiResponse({
    status: 200,
    description: 'Recipe detail',
    type: RecipeDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async getRecipe(
    @Param('id') id: string,
    @Query('shareToken') shareToken?: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<RecipeDetailDto> | ApiResponseDto<null>> {
    const recipe = await this.getAccessibleRecipe(id, shareToken, req);
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

          const ingredientType = item.ingredient?.type;

          // Only FOOD type has ratio, SUPPLEMENT has nutrient target
          const result: any = {
            id: item.id,
            ingredientId: item.ingredientId,
            ingredientName: item.ingredient?.name || 'Unknown',
            name: item.ingredient?.name || 'Unknown',
            preparationMethod: preparationMethods?.join('、') || undefined,
            sortOrder: item.sortOrder || 0,
            ingredientType: ingredientType || undefined,
            exampleWeight:
              item.exampleWeight != null ? item.exampleWeight : undefined,
            ratioPercent:
              item.ratioPercent != null ? item.ratioPercent : undefined,
            nutrientTargetKey: item.nutrientTargetKey || undefined,
            nutrientTargetValue: item.nutrientTargetValue || undefined,
            ingredient: item.ingredient
              ? {
                  id: item.ingredient.id,
                  name: item.ingredient.name,
                  type: item.ingredient.type,
                  properties: item.ingredient?.properties || undefined,
                }
              : undefined,
          };

          // FOOD type: include ratio (for backward compatibility)
          if (ingredientType === 'FOOD') {
            result.ratio = item.ratioPercent != null ? item.ratioPercent : 0;
          }

          return result;
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
      coverImageUrl: (recipe as any).coverImageUrl?.replace(
        'http://',
        'https://',
      ),
      productionLossRate: recipe.productionLossRate,
      nutritionStandard: (recipe.nutritionStandard ||
        NutritionStandard.FEDIAF_2021) as NutritionStandard,
      designSource: (recipe as any).designSource || undefined,
      targetHealthTags: (recipe as any).targetHealthTags || [],
      applicableLifeStages: (recipe as any).applicableLifeStages || [],
      nutritionDetailedData,
      items: allIngredients,
      description: (recipe as any).description,
    };

    return ApiResponseDto.success(detail);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track recipe detail view' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  async trackRecipeView(
    @Param('id') id: string,
    @Body('shareToken') shareToken?: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<null>> {
    const recipe = await this.getAccessibleRecipe(id, shareToken, req);
    if (!recipe) {
      return ApiResponseDto.error(404, 'Recipe not found');
    }

    await this.incrementRecipeViewCount(id);
    return ApiResponseDto.success(null);
  }

  @Post(':id/share-token')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate share token for a recipe' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  async createShareToken(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<ApiResponseDto<{ token: string; expiresAt: string }>> {
    const user: RequestUser = req.user;

    // Verify recipe exists (any status)
    const recipe = await this.prisma.recipe.findFirst({
      where: { recipeId: id },
      orderBy: { version: 'desc' },
    });

    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    const token = generateToken(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.recipeShareToken.create({
      data: {
        recipeId: recipe.id,
        token,
        createdBy: user.userId,
        expiresAt,
      },
    });

    return ApiResponseDto.success({
      token,
      expiresAt: expiresAt.toISOString(),
    });
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

      // Count the generation only after the DIY sheet is successfully produced
      const latestRecipe = await this.prisma.recipe.findFirst({
        where: { recipeId },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (latestRecipe) {
        await this.prisma.recipe.update({
          where: { id: latestRecipe.id },
          data: { diyGenCount: { increment: 1 } },
        });
      }

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

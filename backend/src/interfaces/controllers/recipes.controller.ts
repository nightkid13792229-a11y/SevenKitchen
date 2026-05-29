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
import { AuthGuard, CurrentUser } from '../auth';
import { StaffGuard } from '../guards/role.guard';
import type { RequestUser } from '../auth/request-user.interface';
import { JwtAuthService } from '../auth/jwt.service';
import {
  extractLegacyPreparationMethodIds,
  resolvePreparationMethodText,
} from '../../application/recipe/preparation-method-text.util';
import { resolveSupplementNutrients } from '../../domain/ingredient/supplement-nutrition-resolver';
import { resolveSupplementAddTimingLabel } from '../../domain/ingredient/supplement-add-timing';

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

  private normalizeKeywordList(value?: string | null): string[] {
    if (!value) return [];
    return value
      .split(/[,，、;；\n\r]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private resolveDogLifeStage(dog: {
    birthday: Date;
    lifeStageOverride?: string | null;
  }): string {
    if (dog.lifeStageOverride && dog.lifeStageOverride !== 'NONE') {
      return dog.lifeStageOverride;
    }

    const ageMonths =
      (Date.now() - new Date(dog.birthday).getTime()) /
      (1000 * 60 * 60 * 24 * 30.4375);
    if (ageMonths < 12) return 'PUPPY';
    if (ageMonths >= 84) return 'SENIOR';
    return 'ADULT';
  }

  private scoreRecipeForDog(
    recipe: any,
    dog: any,
  ): {
    matchScore: number;
    matchStars: number;
    matchReasons: string[];
    dailyIntakeG: number | null;
    section: 'exclusive' | 'general';
  } {
    const dogLifeStage = this.resolveDogLifeStage(dog);
    const recipeLifeStages = Array.isArray(recipe.applicableLifeStages)
      ? recipe.applicableLifeStages
      : [];
    const allergyFoods = this.normalizeKeywordList(dog.allergyFoods);
    const pickyFoods = this.normalizeKeywordList(dog.pickyFoods);
    const ingredientNames = (recipe.items || [])
      .map((item: any) => item.ingredient?.name || item.ingredient?.nameEn || '')
      .filter(Boolean);
    const ingredientSearchText = ingredientNames.join(' ').toLowerCase();

    let score = 50;
    const matchReasons: string[] = [];

    if (recipeLifeStages.includes(dogLifeStage)) {
      score += 25;
      matchReasons.push('生命阶段匹配');
    } else if (recipeLifeStages.length === 0) {
      score += 8;
      matchReasons.push('通用阶段食谱');
    } else {
      score -= 10;
    }

    if (dog.cachedTargetFoodKcal && recipe.energyDensityKcalPerKg) {
      const dailyIntakeG =
        (Number(dog.cachedTargetFoodKcal) / Number(recipe.energyDensityKcalPerKg)) *
        1000;
      if (dailyIntakeG >= 80 && dailyIntakeG <= 900) {
        score += 10;
        matchReasons.push('热量密度适合日常喂食');
      }
    }

    const allergyHits = allergyFoods.filter((keyword) =>
      ingredientSearchText.includes(keyword),
    );
    if (allergyHits.length > 0) {
      score -= 40;
      matchReasons.push(`含需谨慎原料：${allergyHits.slice(0, 2).join('、')}`);
    }

    const pickyHits = pickyFoods.filter((keyword) =>
      ingredientSearchText.includes(keyword),
    );
    if (pickyHits.length > 0) {
      score -= 12;
      matchReasons.push(`可能不是最偏好的口味：${pickyHits.slice(0, 2).join('、')}`);
    }

    if (recipe.favoriteCount > 0 || recipe.diyGenCount > 0) {
      score += Math.min(10, Math.floor((recipe.favoriteCount + recipe.diyGenCount) / 5));
      matchReasons.push('用户反馈较稳定');
    }

    const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
    const matchStars = Math.max(3, Math.min(5, Math.round(boundedScore / 22)));
    const dailyIntakeG =
      dog.cachedTargetFoodKcal && recipe.energyDensityKcalPerKg
        ? Math.round(
            (Number(dog.cachedTargetFoodKcal) /
              Number(recipe.energyDensityKcalPerKg)) *
              1000,
          )
        : null;

    return {
      matchScore: boundedScore,
      matchStars,
      matchReasons: matchReasons.length
        ? matchReasons.slice(0, 3)
        : ['适合作为日常鲜食候选'],
      dailyIntakeG,
      section: boundedScore >= 70 ? 'exclusive' : 'general',
    };
  }

  private mapRecommendedRecipe(recipe: any, dog: any) {
    const score = this.scoreRecipeForDog(recipe, dog);
    const topIngredients = (recipe.items || [])
      .filter(
        (item: any) =>
          item.ingredient?.type === 'FOOD' && item.ratioPercent != null,
      )
      .sort((a: any, b: any) => (b.ratioPercent || 0) - (a.ratioPercent || 0))
      .slice(0, 6)
      .map((item: any) => ({
        ingredientId: item.ingredientId,
        name: item.ingredient?.name || item.ingredient?.nameEn || 'Unknown',
        nameEn: item.ingredient?.nameEn,
        ratio: item.ratioPercent || 0,
      }));

    return {
      id: recipe.recipeId || recipe.id,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      coverImageUrl: recipe.coverImageUrl?.replace('http://', 'https://'),
      coverTitle: recipe.coverTitle || undefined,
      targetHealthTags: recipe.targetHealthTags || [],
      applicableLifeStages: recipe.applicableLifeStages || [],
      items: topIngredients,
      viewCount: recipe.viewCount ?? 0,
      favoriteCount: recipe.favoriteCount ?? 0,
      diyGenCount: recipe.diyGenCount ?? 0,
      ...score,
    };
  }

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

  private mapPublicIngredient(ingredient: any): any {
    if (!ingredient) {
      return undefined;
    }

    const purchaseLink = ingredient.properties?.purchase_link;
    const activeNutrients =
      ingredient.type === 'SUPPLEMENT'
        ? resolveSupplementNutrients({
            nutritionProfile: ingredient.nutritionProfile,
            fallback: ingredient.properties?.active_nutrients,
          })
        : ingredient.properties?.active_nutrients || undefined;
    const addTimingLabel =
      ingredient.type === 'SUPPLEMENT'
        ? resolveSupplementAddTimingLabel(ingredient.properties?.add_timing)
        : undefined;

    return {
      id: ingredient.id,
      name: ingredient.name,
      type: ingredient.type,
      diyEnabled: ingredient.diyEnabled,
      brand: ingredient.brand || undefined,
      productModel: ingredient.productModel || undefined,
      purchaseChannel: ingredient.purchaseChannel || undefined,
      displayUnit: ingredient.unitDisplayLabel || undefined,
      imageUrl: ingredient.properties?.image_url || undefined,
      purchaseLink: purchaseLink || undefined,
      addTimingLabel,
      activeNutrients:
        activeNutrients && Object.keys(activeNutrients).length > 0
          ? activeNutrients
          : undefined,
      properties: ingredient.properties || undefined,
    };
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
    const summaries = recipes.filter((r: any) => {
      if (seen.has(r.recipeId)) return false;
      seen.add(r.recipeId);
      return true;
    }).map((r: any) => ({
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
          coverTitle: recipe.coverTitle || undefined,
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

  @Get('recommendations/:dogId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List personalized recipe recommendations for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async listRecommendationsForDog(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const dog = await this.prisma.dog.findFirst({
      where: {
        id: dogId,
        ownerId: user.customerId,
      },
      select: {
        id: true,
        name: true,
        birthday: true,
        currentWeightKg: true,
        mealsPerDay: true,
        lifeStageOverride: true,
        cachedTargetFoodKcal: true,
        allergyFoods: true,
        pickyFoods: true,
        avatarUrl: true,
      },
    });

    if (!dog) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    const recipes = await this.prisma.recipe.findMany({
      where: { status: 'PUBLIC' },
      include: {
        items: {
          include: { ingredient: true },
        },
      },
      orderBy: [
        { favoriteCount: 'desc' },
        { diyGenCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 60,
    });

    const recommended = recipes
      .map((recipe) => this.mapRecommendedRecipe(recipe, dog))
      .sort((left, right) => {
        return (
          right.matchScore - left.matchScore ||
          (right.favoriteCount || 0) - (left.favoriteCount || 0)
        );
      });

    const exclusive = recommended
      .filter((recipe) => recipe.section === 'exclusive')
      .slice(0, 12);
    const exclusiveIds = new Set(exclusive.map((recipe) => recipe.id));
    const general = recommended
      .filter((recipe) => !exclusiveIds.has(recipe.id))
      .slice(0, 12);

    return ApiResponseDto.success({
      dog: {
        id: dog.id,
        name: dog.name,
        avatarUrl: dog.avatarUrl,
        currentWeightKg: dog.currentWeightKg,
        mealsPerDay: dog.mealsPerDay,
        lifeStage: this.resolveDogLifeStage(dog),
        targetFoodKcal: dog.cachedTargetFoodKcal || null,
      },
      exclusive,
      general,
    });
  }

  private async loadPreparationMethodNameMap(
    values: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = extractLegacyPreparationMethodIds(values);
    if (ids.length === 0) {
      return new Map();
    }

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return new Map(
      methods.map((method: { id: string; name: string }) => [
        method.id,
        method.name,
      ]),
    );
  }

  /**
   * Map nutrition detailed data fields from DB format to API format
   * DB fields use snake_case (e.g., ash_dm_pct)
   * API expects camelCase (e.g., ashPercent)
   */
  private mapNutritionDetailedData(dbData: any): any {
    if (!dbData) return undefined;
    const summary = dbData.summary ?? dbData;

    return {
      source: dbData.source,
      schemaVersion: dbData.schemaVersion,
      standard: dbData.standard,
      scenario: dbData.scenario,
      generatedAt: dbData.generatedAt,
      report: dbData.report,
      summary: dbData.summary,
      energyDensityKcalPerKg: summary.energy_density_kcal_per_kg,
      proteinPercent: summary.protein_dm_pct,
      fatPercent: summary.fat_dm_pct,
      ashPercent: summary.ash_dm_pct,
      moisturePercent: summary.moisture_pct,
      crudeFiberPercent: summary.fiber_dm_pct,
      carbohydratePercent: summary.carbs_dm_pct,
      calciumPhosphorusRatio: summary.ca_p_ratio,
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

    const methodMap = await this.loadPreparationMethodNameMap(
      (recipe.items || []).map((item: any) => item.preparationMethod),
    );

    // Return all ingredients with preparation method, sorted by sort_order
    const allIngredients = await Promise.all(
      (recipe.items || [])
        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(async (item: any) => {
          const ingredientType = item.ingredient?.type;

          // Only FOOD type has ratio, SUPPLEMENT has nutrient target
          const result: any = {
            id: item.id,
            ingredientId: item.ingredientId,
            ingredientName: item.ingredient?.name || 'Unknown',
            name: item.ingredient?.name || 'Unknown',
            nutritionFoodId: item.nutritionFoodId || undefined,
            nutritionState: item.nutritionState || undefined,
            nutritionStateLabel: item.nutritionStateLabel || undefined,
            nutritionFood: item.nutritionFood || undefined,
            preparationMethod:
              resolvePreparationMethodText(
                item.preparationMethod,
                methodMap,
                { preserveUnresolvedLegacy: false },
              ) || undefined,
            sortOrder: item.sortOrder || 0,
            ingredientType: ingredientType || undefined,
            exampleWeight:
              item.exampleWeight != null ? item.exampleWeight : undefined,
            ratioPercent:
              item.ratioPercent != null ? item.ratioPercent : undefined,
            nutrientTargetKey: item.nutrientTargetKey || undefined,
            nutrientTargetValue: item.nutrientTargetValue || undefined,
            supplementTargets: item.supplementTargets || undefined,
            ingredient: this.mapPublicIngredient(item.ingredient),
            supplementAlternativeIngredientIds:
              item.supplementAlternativeIngredientIds || undefined,
            supplementAlternatives:
              item.supplementAlternatives?.map((alternative: any) => ({
                ingredientId: alternative.ingredientId,
                ingredientName: alternative.ingredientName,
                ingredient: this.mapPublicIngredient(alternative.ingredient),
              })) || undefined,
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

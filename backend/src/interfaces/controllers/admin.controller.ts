/**
 * Admin Controller
 * Handles admin endpoints for ingredient and inventory management
 * Phase 5: Ingredients + Recipe Costing
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Inject,
  UseGuards,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { Prisma, User } from '@prisma/client';
import { IngredientService } from '../../application/ingredient/ingredient.service';
import {
  RecommendedProductService,
  type CreateRecommendedProductDto,
  type UpdateRecommendedProductDto,
} from '../../application/ingredient/recommended-product.service';
import type {
  CreateIngredientDto,
  UpdateIngredientDto,
  UpdateIngredientPriceDto,
} from '../../application/ingredient/ingredient.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  ProductionService,
  type CreateProductionBatchDto,
  type ProductionBatchSummaryDto,
} from '../../application/production/production.service';
import { PurchasingService } from '../../application/purchasing/purchasing.service';
import { InventoryService } from '../../application/inventory/inventory.service';
import type {
  CreateInventoryAdjustmentDto,
  CreateInventoryStocktakeDto,
} from '../../application/inventory/inventory.service';
import {
  OrderService,
  type StaffOrderAddressInput,
} from '../../application/order/order.service';
import {
  DogService,
  DOG_BREED_REPOSITORY,
} from '../../application/dog/dog.service';
import {
  IngredientTagService,
  type CreateTagDto,
  type UpdateTagDto,
} from '../../application/ingredient-tag/ingredient-tag.service';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import { OrderStatus } from '../../domain';
import { CancelOrderDto } from '../dto/orders/cancel-order.dto';
import {
  AdminOrderDto,
  OrderDto,
} from '../dto/orders/order-response.dto';
import type { OrderItemDto } from '../dto/orders/order-response.dto';
import { InvalidStateTransitionError } from '../../domain/common/errors';
import { UpdateOrderAdminRemarkDto } from '../dto/orders/admin-order-operations.dto';
import {
  CreateBreedDto,
  UpdateBreedDto,
  BreedResponseDto,
  CustomBreedStatsDto,
  BreedUsageCheckDto,
} from '../dto/breeds';
import { PrismaService } from '../../infrastructure/prisma.service';
import { MIXED_BREED_VIRTUAL_ID } from '../../domain/dog/constants';
import {
  CreateStaffDto,
  UpdateStaffDto,
  StaffResponseDto,
} from '../dto/admin/staff.dto';
import { AdminGuard, StaffGuard } from '../guards/role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, JwtAuthService, type RequestUser } from '../auth';
import { RecipeService } from '../../application/recipe/recipe.service';
import { CoverImageService } from '../../application/recipe/cover-image.service';
import { ImageOptimizationService } from '../../infrastructure/services/image-optimization.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import {
  NutritionStandard,
  RecipeStatus,
  RecipeHealthTag,
  LifeStage,
  RECIPE_LIFE_STAGE_OPTIONS,
} from '../../domain/recipe/enums';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import type { IngredientPreparationMethodHistoryDto } from '../dto/recipes/admin-recipe.dto';
import type { Ingredient } from '../../domain/ingredient';
import { resolveOrderProductionPhotos } from './order-production-photos';

const CUSTOMER_TEST_USER_ID = 'production-experience-customer-test-user';
const CUSTOMER_TEST_USER_PHONE = '19900000001';
const CUSTOMER_TEST_USER_NICKNAME = '生产体验版普通用户测试号';

@ApiTags('Admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly ingredientService: IngredientService,
    private readonly productionService: ProductionService,
    private readonly purchasingService: PurchasingService,
    private readonly inventoryService: InventoryService,
    private readonly orderService: OrderService,
    private readonly dogService: DogService,
    private readonly ingredientTagService: IngredientTagService,
    private readonly recommendedProductService: RecommendedProductService,
    private readonly prisma: PrismaService,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    private readonly recipeService: RecipeService,
    private readonly coverImageService: CoverImageService,
    private readonly imageOptimizationService: ImageOptimizationService,
    private readonly cosService: TencentCosService,
    private readonly jwtAuthService?: JwtAuthService,
  ) {}

  private mapNutritionFoodMappings(mappings?: any[]) {
    return (mappings || []).map((mapping) => ({
      id: mapping.id,
      nutritionFoodId: mapping.nutritionFoodId,
      ingredientId: mapping.ingredientId,
      yieldRate: mapping.yieldRate,
      isPrimary: mapping.isPrimary,
      notes: mapping.notes ?? undefined,
      nutritionFood: mapping.nutritionFood
        ? {
            id: mapping.nutritionFood.id,
            name: mapping.nutritionFood.name,
            nameEn: mapping.nutritionFood.nameEn ?? undefined,
            displayNameZh: mapping.nutritionFood.displayNameZh ?? undefined,
            dataSource: mapping.nutritionFood.dataSource,
            externalId: mapping.nutritionFood.externalId ?? undefined,
            preparationState:
              mapping.nutritionFood.preparationState ?? undefined,
            preparationStateLabel:
              mapping.nutritionFood.preparationStateLabel ?? undefined,
            ediblePortionLabel:
              mapping.nutritionFood.ediblePortionLabel ?? undefined,
            processingLabel:
              mapping.nutritionFood.processingLabel ?? undefined,
            nutritionData: mapping.nutritionFood.nutritionData,
          }
        : undefined,
    }));
  }

  private parseShanghaiDateStart(dateStr: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) {
      const parsed = new Date(dateStr);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`Invalid date: ${dateStr}`);
      }
      return parsed;
    }

    const [, year, month, day] = match;
    const utcTime =
      Date.UTC(Number(year), Number(month) - 1, Number(day)) -
      8 * 60 * 60 * 1000;
    return new Date(utcTime);
  }

  private parseOrderCreatedAtRange(startDate?: string, endDate?: string) {
    const start = startDate
      ? this.parseShanghaiDateStart(startDate)
      : undefined;
    const endExclusive = endDate
      ? new Date(
          this.parseShanghaiDateStart(endDate).getTime() +
            24 * 60 * 60 * 1000,
        )
      : undefined;

    if (start && endExclusive && start >= endExclusive) {
      throw new BadRequestException('Start date must be before end date');
    }

    return { start, endExclusive };
  }

  private async buildIngredientDetailResponse(ingredient: Ingredient) {
    const prismaIngredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredient.id },
      select: {
        createdAt: true,
        updatedAt: true,
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        recommendedProducts: {
          select: {
            isActive: true,
          },
        },
        procurementSkus: {
          select: {
            isActive: true,
          },
        },
        nutritionFoodMappings: {
          include: {
            nutritionFood: {
              select: {
                id: true,
                name: true,
                nameEn: true,
                displayNameZh: true,
                dataSource: true,
                externalId: true,
                preparationState: true,
                preparationStateLabel: true,
                ediblePortionLabel: true,
                processingLabel: true,
                nutritionData: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    const tagIds = prismaIngredient?.tags.map((t) => t.tag.id) || [];
    const tags = prismaIngredient?.tags.map((t) => t.tag) || [];
    const createdAt =
      prismaIngredient?.createdAt.toISOString() || new Date().toISOString();
    const updatedAt =
      prismaIngredient?.updatedAt.toISOString() || new Date().toISOString();
    const activeRecommendedProductCount =
      prismaIngredient?.recommendedProducts.filter((rp) => rp.isActive).length ||
      0;
    const recommendedProductCount =
      prismaIngredient?.recommendedProducts.length || 0;
    const activeProcurementSkuCount =
      prismaIngredient?.procurementSkus.filter((sku) => sku.isActive).length ||
      0;
    const procurementSkuCount = prismaIngredient?.procurementSkus.length || 0;

    return {
      id: ingredient.id,
      name: ingredient.name,
      type: ingredient.type,
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      purchaseChannel: ingredient.purchaseChannel,
      diyEnabled: ingredient.diyEnabled,
      procurementEnabled: ingredient.procurementEnabled,
      notes: ingredient.notes,
      baseUnit: ingredient.baseUnit,
      baseUnitDisplayName: ingredient.baseUnitDisplayName,
      unitDisplayLabel: ingredient.unitDisplayLabel,
      procurementStrategy: ingredient.procurementStrategy,
      purchaseUnit: ingredient.purchaseUnit,
      purchaseToBaseRatio: ingredient.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: Number(
        ingredient.currentPricePerPurchaseUnit,
      ),
      effectivePricePerPurchaseUnit: Number(
        ingredient.getEffectivePricePerPurchaseUnit(),
      ),
      unitCost: ingredient.getUnitCost(),
      weightG: ingredient.weightG,
      maxCapacityG: ingredient.maxCapacityG,
      safetyStock: ingredient.safetyStock,
      reorderPoint: ingredient.reorderPoint,
      targetStock: ingredient.targetStock,
      properties: ingredient.properties,
      nutritionProfile: ingredient.nutritionProfile,
      nutritionFoodMappings: this.mapNutritionFoodMappings(
        prismaIngredient?.nutritionFoodMappings,
      ),
      tagIds,
      tags,
      activeRecommendedProductCount,
      recommendedProductCount,
      hasActiveRecommendedProduct: activeRecommendedProductCount > 0,
      activeProcurementSkuCount,
      procurementSkuCount,
      hasActiveProcurementSku: activeProcurementSkuCount > 0,
      createdAt,
      updatedAt,
    };
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Get inventory list (ingredients with prices)' })
  @ApiResponse({
    status: 200,
    description: 'Inventory list',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['FOOD', 'SUPPLEMENT', 'PACKAGING'] },
          currentPricePerPurchaseUnit: { type: 'number' },
          purchaseUnit: { type: 'string' },
          stock: { type: 'number', description: 'Placeholder for MVP' },
        },
      },
    },
  })
  async getInventory(): Promise<ApiResponseDto<any[]>> {
    const inventory =
      await this.purchasingService.getStockReplenishmentIngredients({
        includeDaily: true,
      });

    return ApiResponseDto.success(
      inventory.map((item) => ({
        ...item,
        stock: item.currentStock,
      })),
    );
  }

  @Get('inventory/ledger')
  @ApiOperation({ summary: 'Get recent inventory ledger entries' })
  async getInventoryLedger(
    @Query('ingredientId') ingredientId?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<any[]>> {
    const ledger = await this.inventoryService.listLedgerEntries({
      ingredientId,
      limit: limit ? Number(limit) : undefined,
    });

    return ApiResponseDto.success(ledger);
  }

  @Post('inventory/adjustments')
  @ApiOperation({ summary: 'Create and apply a manual inventory adjustment' })
  async createInventoryAdjustment(
    @Body() dto: CreateInventoryAdjustmentDto,
  ): Promise<ApiResponseDto<any>> {
    const adjustment = await this.inventoryService.createManualAdjustment(dto);
    return ApiResponseDto.success(adjustment, '库存调整成功');
  }

  @Get('inventory/stocktakes')
  @ApiOperation({ summary: 'Get recent stocktakes' })
  async getInventoryStocktakes(
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<any[]>> {
    const stocktakes = await this.inventoryService.listStocktakes(
      limit ? Number(limit) : undefined,
    );
    return ApiResponseDto.success(stocktakes);
  }

  @Post('inventory/stocktakes')
  @ApiOperation({ summary: 'Create a stocktake' })
  async createInventoryStocktake(
    @Body() dto: CreateInventoryStocktakeDto,
  ): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.createStocktake(dto);
    return ApiResponseDto.success(stocktake, '盘点单创建成功');
  }

  @Post('inventory/stocktakes/:id/apply')
  @ApiOperation({ summary: 'Apply a draft stocktake to inventory ledger' })
  async applyInventoryStocktake(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.applyStocktake(id);
    return ApiResponseDto.success(stocktake, '盘点差异已入账');
  }

  @Get('ingredients')
  @ApiOperation({ summary: 'Get all ingredients' })
  @ApiResponse({
    status: 200,
    description: 'List of all ingredients',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['FOOD', 'SUPPLEMENT', 'PACKAGING'] },
          brand: { type: 'string' },
          productModel: { type: 'string' },
          purchaseChannel: { type: 'string' },
          activeRecommendedProductCount: { type: 'number' },
          recommendedProductCount: { type: 'number' },
          hasActiveRecommendedProduct: { type: 'boolean' },
          baseUnit: { type: 'string', enum: ['G', 'ML', 'PCS'] },
          purchaseUnit: { type: 'string' },
          currentPricePerPurchaseUnit: { type: 'number' },
          unitCost: { type: 'number' },
          properties: { type: 'object' },
        },
      },
    },
  })
  async getAllIngredients(): Promise<ApiResponseDto<any[]>> {
    const ingredients = await this.ingredientService.getAllIngredients();

    // Get createdAt and tags from Prisma directly
    const ingredientIds = ingredients.map((ing) => ing.id);
    const prismaIngredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        recommendedProducts: {
          select: {
            id: true,
            isActive: true,
          },
        },
        procurementSkus: {
          select: {
            id: true,
            isActive: true,
          },
        },
        nutritionFoodMappings: {
          include: {
            nutritionFood: {
              select: {
                id: true,
                name: true,
                nameEn: true,
                displayNameZh: true,
                dataSource: true,
                externalId: true,
              preparationState: true,
              preparationStateLabel: true,
              ediblePortionLabel: true,
              processingLabel: true,
              nutritionData: true,
            },
          },
        },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    const createdAtMap = new Map(
      prismaIngredients.map((p) => [p.id, p.createdAt.toISOString()]),
    );
    const updatedAtMap = new Map(
      prismaIngredients.map((p) => [p.id, p.updatedAt.toISOString()]),
    );
    const recommendedProductCountMap = new Map(
      prismaIngredients.map((p) => [p.id, p.recommendedProducts.length]),
    );
    const activeRecommendedProductCountMap = new Map(
      prismaIngredients.map((p) => [
        p.id,
        p.recommendedProducts.filter((product) => product.isActive).length,
      ]),
    );
    const procurementSkuCountMap = new Map(
      prismaIngredients.map((p) => [p.id, p.procurementSkus.length]),
    );
    const activeProcurementSkuCountMap = new Map(
      prismaIngredients.map((p) => [
        p.id,
        p.procurementSkus.filter((sku) => sku.isActive).length,
      ]),
    );
    const tagsMap = new Map(
      prismaIngredients.map((p) => [p.id, p.tags.map((t) => t.tag)]),
    );
    const tagIdsMap = new Map(
      prismaIngredients.map((p) => [p.id, p.tags.map((t) => t.tag.id)]),
    );
    const nutritionFoodMappingsMap = new Map(
      prismaIngredients.map((p) => [
        p.id,
        this.mapNutritionFoodMappings(p.nutritionFoodMappings),
      ]),
    );

    // Map to ingredient response format
    const ingredientList = ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      type: ing.type,
      brand: ing.brand,
      productModel: ing.productModel,
      purchaseChannel: ing.purchaseChannel,
      diyEnabled: ing.diyEnabled,
      procurementEnabled: ing.procurementEnabled,
      notes: ing.notes,
      baseUnit: ing.baseUnit,
      baseUnitDisplayName: ing.baseUnitDisplayName,
      unitDisplayLabel: ing.unitDisplayLabel,
      procurementStrategy: ing.procurementStrategy,
      purchaseUnit: ing.purchaseUnit,
      purchaseToBaseRatio: ing.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: Number(ing.currentPricePerPurchaseUnit),
      effectivePricePerPurchaseUnit: Number(
        ing.getEffectivePricePerPurchaseUnit(),
      ),
      unitCost: ing.getUnitCost(),
      activeRecommendedProductCount:
        activeRecommendedProductCountMap.get(ing.id) || 0,
      recommendedProductCount: recommendedProductCountMap.get(ing.id) || 0,
      activeProcurementSkuCount:
        activeProcurementSkuCountMap.get(ing.id) || 0,
      procurementSkuCount: procurementSkuCountMap.get(ing.id) || 0,
      hasActiveRecommendedProduct:
        (activeRecommendedProductCountMap.get(ing.id) || 0) > 0,
      hasActiveProcurementSku:
        (activeProcurementSkuCountMap.get(ing.id) || 0) > 0,
      weightG: ing.weightG,
      maxCapacityG: ing.maxCapacityG,
      safetyStock: ing.safetyStock,
      reorderPoint: ing.reorderPoint,
      targetStock: ing.targetStock,
      properties: ing.properties,
      nutritionProfile: ing.nutritionProfile,
      nutritionFoodMappings: nutritionFoodMappingsMap.get(ing.id) || [],
      tagIds: tagIdsMap.get(ing.id) || [],
      tags: tagsMap.get(ing.id) || [],
      createdAt: createdAtMap.get(ing.id) || new Date().toISOString(),
      updatedAt: updatedAtMap.get(ing.id) || new Date().toISOString(),
    }));

    return ApiResponseDto.success(ingredientList);
  }

  @Get('ingredients/:id')
  @ApiOperation({ summary: 'Get ingredient by ID' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiResponse({
    status: 200,
    description: 'Ingredient details',
  })
  async getIngredientById(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const ingredient = await this.ingredientService.getIngredientById(id);
    return ApiResponseDto.success(
      await this.buildIngredientDetailResponse(ingredient),
    );
  }

  @Post('ingredients')
  @ApiOperation({ summary: 'Create ingredient' })
  @ApiBody({ schema: { type: 'object' } })
  @ApiResponse({
    status: 201,
    description: 'Ingredient created',
  })
  async createIngredient(
    @Body() dto: CreateIngredientDto,
  ): Promise<ApiResponseDto<any>> {
    const ingredient = await this.ingredientService.createIngredient(dto);
    return ApiResponseDto.success(
      await this.buildIngredientDetailResponse(ingredient),
    );
  }

  @Put('ingredients/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ingredient' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiBody({ schema: { type: 'object' } })
  @ApiResponse({
    status: 200,
    description: 'Ingredient updated',
  })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async updateIngredient(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const ingredient = await this.ingredientService.updateIngredient(id, dto);
      return ApiResponseDto.success(
        await this.buildIngredientDetailResponse(ingredient),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Ingredient not found');
      }
      throw error;
    }
  }

  @Put('ingredients/:id/price')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ingredient price' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { currentPricePerPurchaseUnit: { type: 'number' } },
      required: ['currentPricePerPurchaseUnit'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Ingredient price updated',
  })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async updateIngredientPrice(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientPriceDto,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const ingredient = await this.ingredientService.updateIngredientPrice(
        id,
        dto,
      );
      return ApiResponseDto.success({
        id: ingredient.id,
        name: ingredient.name,
        currentPricePerPurchaseUnit: Number(
          ingredient.currentPricePerPurchaseUnit,
        ),
        effectivePricePerPurchaseUnit: Number(
          ingredient.getEffectivePricePerPurchaseUnit(),
        ),
        unitCost: ingredient.getUnitCost(),
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Delete('ingredients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete ingredient' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiResponse({ status: 204, description: 'Ingredient deleted successfully' })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async deleteIngredient(@Param('id') id: string): Promise<void> {
    try {
      await this.ingredientService.deleteIngredient(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
  }

  @Get('ingredients/:id/usage')
  @ApiOperation({ summary: 'Get ingredient usage in recipes' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiResponse({
    status: 200,
    description: 'List of recipes using this ingredient',
  })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async getIngredientUsage(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any[]>> {
    try {
      // Check if ingredient exists
      await this.ingredientService.getIngredientById(id);

      // Query RecipeItem table for recipes using this ingredient
      const recipeItems = await this.prisma.recipeItem.findMany({
        where: { ingredientId: id },
        include: {
          recipe: {
            select: {
              recipeId: true,
              name: true,
            },
          },
        },
      });

      const usage = recipeItems.map((item: any) => ({
        recipeId: item.recipe.recipeId,
        recipeName: item.recipe.name,
        ratioPercent: item.ratioPercent,
        isPrimarySource: item.isPrimarySource,
      }));

      return ApiResponseDto.success(usage);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.success([]) as any;
      }
      throw error;
    }
  }

  @Get('ingredients/:id/preparation-method-history')
  @ApiOperation({
    summary: 'Get historical preparation methods for an ingredient',
  })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  async getIngredientPreparationMethodHistory(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<IngredientPreparationMethodHistoryDto[]>> {
    const history =
      await this.recipeService.getIngredientPreparationMethodHistory(id);
    return ApiResponseDto.success(history);
  }

  // ==========================================
  // Phase 8.10: Production Batch Endpoints
  // ==========================================

  @Get('production-batches')
  @ApiOperation({ summary: 'Get all production batches' })
  @ApiResponse({
    status: 200,
    description: 'List of all production batches',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          productionDate: { type: 'string', format: 'date' },
          status: {
            type: 'string',
            enum: ['PLANNED', 'IN_PRODUCTION', 'COMPLETED'],
          },
          totalProductionG: { type: 'number' },
          uniqueRecipeCount: { type: 'number' },
          orderItemCount: { type: 'number' },
        },
      },
    },
  })
  async getAllProductionBatches(): Promise<
    ApiResponseDto<ProductionBatchSummaryDto[]>
  > {
    const batches = await this.productionService.getAllProductionBatches();

    // Map to summary DTOs
    const summaries = batches.map((batch) => {
      const packagingUnits = batch.packagingUnits.map((unit) => ({
        recipeSnapshotId: unit.recipeSnapshot.id,
        totalProductionG: unit.totalProductionG,
        orderItemCount: unit.sourceOrderItemIds.length,
        sourceOrderItemIds: Array.isArray(unit.sourceOrderItemIds)
          ? unit.sourceOrderItemIds
          : [],
      }));

      return {
        id: batch.id,
        productionDate: batch.productionDate.toISOString().split('T')[0],
        status: batch.status,
        packagingUnits,
        totalProductionG: batch.getTotalProductionG(),
        uniqueRecipeCount: batch.getUniqueRecipeCount(),
        orderItemCount: packagingUnits.reduce(
          (sum, unit) => sum + unit.orderItemCount,
          0,
        ),
      };
    });

    return ApiResponseDto.success(summaries);
  }

  @Post('production-batches')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create production batch from PAID orders' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        productionDate: {
          type: 'string',
          format: 'date',
          example: '2025-01-20',
          description: 'Production date (YYYY-MM-DD)',
        },
        orderIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: specific order IDs to include. If not provided, includes all PAID unassigned orders.',
        },
      },
      required: ['productionDate'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Production batch created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        productionDate: { type: 'string', format: 'date' },
        status: {
          type: 'string',
          enum: ['PLANNED', 'IN_PRODUCTION', 'COMPLETED'],
        },
        packagingUnits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              recipeSnapshotId: { type: 'string' },
              totalProductionG: { type: 'number' },
              orderItemCount: { type: 'number' },
              sourceOrderItemIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Traceability: contributing OrderItem IDs',
              },
            },
          },
        },
        totalProductionG: { type: 'number' },
        uniqueRecipeCount: { type: 'number' },
        orderItemCount: {
          type: 'number',
          description: 'Total count across all packagingUnits',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or no PAID orders found',
  })
  async createProductionBatch(
    @Body() dto: CreateProductionBatchDto,
  ): Promise<ApiResponseDto<ProductionBatchSummaryDto> | ApiResponseDto<null>> {
    try {
      const batch = await this.productionService.createProductionBatch(dto);

      // Map to summary DTO
      const packagingUnits = batch.packagingUnits.map((unit) => ({
        recipeSnapshotId: unit.recipeSnapshot.id,
        totalProductionG: unit.totalProductionG,
        orderItemCount: unit.sourceOrderItemIds.length,
        sourceOrderItemIds: Array.isArray(unit.sourceOrderItemIds)
          ? unit.sourceOrderItemIds
          : [],
      }));

      const summary: ProductionBatchSummaryDto = {
        id: batch.id,
        productionDate: batch.productionDate.toISOString().split('T')[0], // YYYY-MM-DD
        status: batch.status,
        packagingUnits,
        totalProductionG: batch.getTotalProductionG(),
        uniqueRecipeCount: batch.getUniqueRecipeCount(),
        orderItemCount: packagingUnits.reduce(
          (sum, unit) => sum + unit.orderItemCount,
          0,
        ),
      };

      return ApiResponseDto.success(summary);
    } catch (error) {
      console.error('[AdminController] createProductionBatch error:', error);
      if (error instanceof Error) {
        console.error('[AdminController] error stack:', error.stack);
        console.error('[AdminController] error message:', error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Get('production-batches/:id')
  @ApiOperation({ summary: 'Get production batch details with traceability' })
  @ApiParam({ name: 'id', description: 'Production Batch ID' })
  @ApiResponse({
    status: 200,
    description: 'Production batch details',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        productionDate: { type: 'string', format: 'date' },
        status: { type: 'string' },
        packagingUnits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              recipeSnapshotId: { type: 'string' },
              totalProductionG: { type: 'number' },
              orderItemCount: { type: 'number' },
              sourceOrderItemIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Traceability: contributing OrderItem IDs',
              },
            },
          },
        },
        totalProductionG: { type: 'number' },
        uniqueRecipeCount: { type: 'number' },
        orderItemCount: {
          type: 'number',
          description: 'Total count across all packagingUnits',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Production batch not found' })
  async getProductionBatch(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<ProductionBatchSummaryDto> | ApiResponseDto<null>> {
    const batch = await this.productionService.getProductionBatchById(id);
    if (!batch) {
      return ApiResponseDto.error(404, 'Production batch not found');
    }

    const packagingUnits = batch.packagingUnits.map((unit) => ({
      recipeSnapshotId: unit.recipeSnapshot.id,
      totalProductionG: unit.totalProductionG,
      orderItemCount: unit.sourceOrderItemIds.length,
      sourceOrderItemIds: Array.isArray(unit.sourceOrderItemIds)
        ? unit.sourceOrderItemIds
        : [],
    }));

    const summary: ProductionBatchSummaryDto = {
      id: batch.id,
      productionDate: batch.productionDate.toISOString().split('T')[0],
      status: batch.status,
      packagingUnits,
      totalProductionG: batch.getTotalProductionG(),
      uniqueRecipeCount: batch.getUniqueRecipeCount(),
      orderItemCount: packagingUnits.reduce(
        (sum, unit) => sum + unit.orderItemCount,
        0,
      ),
    };

    return ApiResponseDto.success(summary);
  }

  @Get('production-batches/:id/order-items')
  @ApiOperation({ summary: 'Get allocated order items for a production batch' })
  @ApiParam({ name: 'id', description: 'Production Batch ID' })
  @ApiResponse({
    status: 200,
    description: 'Allocated order items',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          orderId: { type: 'string' },
          recipeSnapshotId: { type: 'string' },
          dailyIntakeG: { type: 'number' },
          productionBatchId: { type: 'string' },
          allocatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Production batch not found' })
  async getBatchOrderItems(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any[]> | ApiResponseDto<null>> {
    const batch = await this.productionService.getProductionBatchById(id);
    if (!batch) {
      return ApiResponseDto.error(404, 'Production batch not found');
    }

    // Collect all order item IDs from packaging units
    const orderItemIds = new Set<string>();
    for (const unit of batch.packagingUnits) {
      for (const itemId of unit.sourceOrderItemIds) {
        orderItemIds.add(itemId);
      }
    }

    // Load order items (we need to query orders to get items)
    // For MVP, we'll return a simplified structure
    const orderItems: any[] = [];
    for (const unit of batch.packagingUnits) {
      for (const itemId of unit.sourceOrderItemIds) {
        orderItems.push({
          id: itemId,
          recipeSnapshotId: unit.recipeSnapshot.id,
          // Note: orderId and dailyIntakeG would require loading the actual OrderItem
          // For MVP, we return what we have from the batch
        });
      }
    }

    return ApiResponseDto.success(orderItems);
  }

  @Post('inventory/deductions/retry/:packagingUnitId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry inventory deduction for a PackagingUnit' })
  @ApiParam({
    name: 'packagingUnitId',
    description: 'PackagingUnit ID to retry deduction for',
  })
  @ApiResponse({
    status: 200,
    description: 'Deduction retry completed (idempotent)',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        entriesCreated: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'PackagingUnit not found' })
  async retryInventoryDeduction(
    @Param('packagingUnitId') packagingUnitId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Get existing entries to check if already deducted
      const existingEntries =
        await this.inventoryService.getEntriesByPackagingUnit(packagingUnitId);

      // Attempt deduction (idempotent - will skip if already exists)
      await this.inventoryService.deductFromKitchenTask(packagingUnitId);

      // Get entries after deduction
      const entriesAfter =
        await this.inventoryService.getEntriesByPackagingUnit(packagingUnitId);

      const entriesCreated = entriesAfter.length - existingEntries.length;

      return ApiResponseDto.success({
        message: 'Deduction retry completed',
        entriesCreated,
        totalEntries: entriesAfter.length,
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Phase 8.15: Order Completion Endpoint
  // ==========================================

  @Post('orders/:orderId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete order (Phase 8.15)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order completed successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: Object.values(OrderStatus) },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async completeOrder(@Param('orderId') orderId: string): Promise<
    | ApiResponseDto<{
        id: string;
        status: OrderStatus;
        completedAt: string | null;
      }>
    | ApiResponseDto<null>
  > {
    try {
      const order = await this.orderService.completeOrder(
        orderId,
        'admin', // Phase 8.18: Actor attribution
        null, // Admin ID not available in current implementation
      );

      return ApiResponseDto.success({
        id: order.id,
        status: order.status,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Phase 8.16: Order Cancellation Endpoint
  // ==========================================

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel order (Phase 8.16)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: CancelOrderDto })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Body() cancelOrderDto: CancelOrderDto,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.cancelOrder(
        orderId,
        cancelOrderDto.reason,
        'admin',
        null, // Phase 8.18: Admin ID not available in current implementation
      );

      // Map to DTO (simplified - in production would use proper mapper)
      const orderDto: OrderDto = {
        id: order.id,
        customerId: order.customerId,
        dogId: order.dogId,
        addressId: order.addressId,
        status: order.status,
        type: order.type,
        targetProductionDate: order.targetProductionDate
          ? order.targetProductionDate.toISOString()
          : null,
        totalAmount: order.totalAmount ?? order.amountTotal,
        amountProduct: order.amountProduct,
        amountShipping: order.amountShipping,
        amountTotal: order.amountTotal,
        items: await Promise.all(
          order.items.map((item) => this.mapAdminOrderItem(item)),
        ),
        pricingBreakdown: order.pricingBreakdownSnapshot
          ? {
              costIngredients: order.pricingBreakdownSnapshot.costIngredients,
              costPackaging: order.pricingBreakdownSnapshot.costPackaging,
              costLabor: order.pricingBreakdownSnapshot.costLabor,
              costOverhead: order.pricingBreakdownSnapshot.costOverhead,
              totalProductCost: order.pricingBreakdownSnapshot.totalProductCost,
              productPrice: order.pricingBreakdownSnapshot.productPrice,
              shippingFee: order.pricingBreakdownSnapshot.shippingFee,
              totalPrice: order.pricingBreakdownSnapshot.totalPrice,
            }
          : undefined,
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      if (error instanceof InvalidStateTransitionError) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Admin Order Management Endpoints
  // ==========================================

  /**
   * GET /admin/orders - List all orders with filtering, pagination, and search
   */
  @Get('orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all orders (admin-only, cross-customer)' })
  @ApiResponse({
    status: 200,
    description: 'Order list with pagination',
    schema: {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { $ref: '#/components/schemas/OrderDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  async listOrders(
    @Query() query: any,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const keyword =
        typeof query.keyword === 'string' ? query.keyword.trim() : undefined;

      const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(10, parseInt(String(query.pageSize || '20'), 10) || 20),
      );

      const createdAtRange = this.parseOrderCreatedAtRange(
        typeof query.startDate === 'string' ? query.startDate : undefined,
        typeof query.endDate === 'string' ? query.endDate : undefined,
      );

      const statusValues = Array.isArray(query.status)
        ? query.status
        : typeof query.status === 'string'
          ? query.status
              .split(',')
              .map((status: string) => status.trim())
              .filter(Boolean)
          : [];

      // Parse query parameters
      const params = {
        keyword,
        status:
          statusValues.length > 1
            ? statusValues
            : statusValues[0] ?? query.status,
        type: query.type,
        startDate: createdAtRange.start,
        endDateExclusive: createdAtRange.endExclusive,
        page,
        pageSize,
      };

      const { list: orders, total } = await this.orderService.listAllOrders(
        params,
      );

      // Map orders to summary DTOs with full details
      const list = await Promise.all(
        orders.map(async (order: any) => {
          const customerName = order.customer?.nickname || '未知客户';
          const customerPhone = order.customer?.phone || '';

          // Get first item with dog info if available
          let firstItem = undefined;
          if (order.items && order.items.length > 0) {
            const item = order.items[0];

            // Fetch dog information if dogId is present
            let dogInfo = undefined;
            const primaryDogId = item.dogId || order.dog?.id;
            if (primaryDogId) {
              try {
                const dog =
                  order.dog && order.dog.id === primaryDogId
                    ? order.dog
                    : await this.prisma.dog.findUnique({
                        where: { id: primaryDogId },
                      });
                if (dog) {
                  dogInfo = {
                    id: dog.id,
                    name: dog.name,
                    breedName: dog.customBreedName ?? undefined,
                    weightKg: dog.currentWeightKg,
                    mealsPerDay: dog.mealsPerDay,
                  };
                }
              } catch (error) {
                // Dog might be deleted, ignore error
              }
            }

            // Fetch recipe cover image using Prisma directly
            let coverImageUrl = undefined;
            if (item.recipeSnapshot?.id) {
              try {
                let recipe = await this.prisma.recipe.findUnique({
                  where: { id: item.recipeSnapshot.id },
                  select: { coverImageUrl: true },
                });

                // If not found by ID, try to find by recipe name (data consistency workaround)
                if (!recipe && item.recipeSnapshot.name) {
                  recipe = await this.prisma.recipe.findFirst({
                    where: { name: item.recipeSnapshot.name },
                    select: { coverImageUrl: true },
                  });
                }

                if (recipe) {
                  coverImageUrl = recipe.coverImageUrl?.replace(
                    'http://',
                    'https://',
                  );
                }
              } catch (error: any) {
                // Recipe might be deleted, ignore error
              }
            }

            firstItem = {
              dog: dogInfo,
              recipeSnapshot: item.recipeSnapshot
                ? {
                    id: item.recipeSnapshot.id,
                    name: item.recipeSnapshot.name,
                    coverImageUrl,
                  }
                : undefined,
              packageCount: item.packageCount,
              packageSpecG: item.packageSpecG,
              packagePlan: item.packagePlan ?? null,
              ingredientSourcePlan: item.ingredientSourcePlan ?? null,
              dailyIntakeG: item.dailyIntakeG,
            };
          }

          // Get address info if addressId is present
          let address = undefined;
          if (order.address) {
            try {
              const regionObj = order.address.region as any;
              const regionText = regionObj
                ? `${regionObj.province || ''} ${regionObj.city || ''} ${regionObj.district || ''}`.trim()
                : '';

              address = {
                recipientName: order.address.recipientName || '',
                recipientPhone: order.address.phone || '',
                regionText: regionText || '',
                detailAddress: order.address.detail || '',
              };
            } catch (error) {
              // Address might be deleted, ignore error
            }
          }

          return {
            id: order.id,
            status: order.status,
            aftersaleType: order.aftersaleType ?? null,
            type: order.type,
            totalAmount: order.totalAmount ?? order.amountTotal,
            amountTotal: order.totalAmount ?? order.amountTotal,
            amountProduct: order.amountProduct
              ? parseFloat(order.amountProduct.toString())
              : 0,
            amountShipping: order.amountShipping
              ? parseFloat(order.amountShipping.toString())
              : 0,
            itemCount: order.items.length,
            createdAt: order.createdAt.toISOString(),
            paidAt: order.paidAt?.toISOString() || null,
            targetProductionDate:
              order.targetProductionDate?.toISOString() || null,
            customerName,
            customerPhone,
            firstItem,
            address,
          };
        }),
      );

      return ApiResponseDto.success({
        list,
        total,
        page: params.page,
        pageSize: params.pageSize,
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * GET /admin/orders/stats - Get order statistics
   */
  @Get('orders/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order statistics grouped by status' })
  @ApiResponse({
    status: 200,
    description: 'Order statistics',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        pendingPayment: { type: 'number' },
        paid: { type: 'number' },
        purchasing: { type: 'number' },
        inProduction: { type: 'number' },
        freezing: { type: 'number' },
        readyForShipment: { type: 'number' },
        shipped: { type: 'number' },
        completed: { type: 'number' },
        cancelled: { type: 'number' },
        aftersale: { type: 'number' },
      },
    },
  })
  async getOrderStats(): Promise<ApiResponseDto<any>> {
    try {
      const stats = await this.orderService.getOrderStats();
      return ApiResponseDto.success(stats);
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * GET /admin/orders/:orderId/financial-summary - Get order financial summary
   */
  @Get('orders/:orderId/financial-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order financial summary (admin-only)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order financial summary',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderFinancialSummary(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const summary =
        await this.orderService.getOrderFinancialSummary(orderId);
      return ApiResponseDto.success(summary);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/settlement-adjustments - Create order settlement adjustment
   */
  @Post('orders/:orderId/settlement-adjustments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create order settlement adjustment (admin-only)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount', 'reason'],
      properties: {
        amount: {
          type: 'number',
          description:
            'Signed adjustment amount. Positive means extra payment, negative means refund/credit.',
          example: 18,
        },
        reason: { type: 'string', example: '补收定制分装差价' },
        adjustmentType: {
          type: 'string',
          enum: ['REFUND', 'EXTRA_PAYMENT', 'DISCOUNT', 'MANUAL_CORRECTION'],
        },
        visibleToCustomer: { type: 'boolean', default: true },
        requiresCustomerPayment: { type: 'boolean' },
      },
    },
  })
  async createOrderSettlementAdjustment(
    @Param('orderId') orderId: string,
    @Body()
    body: {
      amount: number;
      reason: string;
      adjustmentType?: 'REFUND' | 'EXTRA_PAYMENT' | 'DISCOUNT' | 'MANUAL_CORRECTION';
      visibleToCustomer?: boolean;
      requiresCustomerPayment?: boolean;
    },
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const adjustment =
        await this.orderService.createOrderSettlementAdjustment({
          orderId,
          amount: Number(body.amount),
          reason: body.reason,
          adjustmentType: body.adjustmentType,
          visibleToCustomer: body.visibleToCustomer,
          requiresCustomerPayment: body.requiresCustomerPayment,
          createdBy: 'admin',
          createdById: null,
        });
      return ApiResponseDto.success(adjustment);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * PATCH /admin/orders/:orderId/settlement-adjustments/:adjustmentId/status
   */
  @Patch('orders/:orderId/settlement-adjustments/:adjustmentId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update order settlement adjustment status (admin-only)',
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'adjustmentId', description: 'Adjustment ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['PENDING', 'SETTLED', 'CANCELLED'],
          example: 'SETTLED',
        },
      },
    },
  })
  async updateOrderSettlementAdjustmentStatus(
    @Param('orderId') orderId: string,
    @Param('adjustmentId') adjustmentId: string,
    @Body() body: { status: 'PENDING' | 'SETTLED' | 'CANCELLED' },
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      if (!['PENDING', 'SETTLED', 'CANCELLED'].includes(body.status)) {
        return ApiResponseDto.error(400, 'Invalid adjustment status');
      }
      const adjustment =
        await this.orderService.updateOrderSettlementAdjustmentStatus(
          orderId,
          adjustmentId,
          body.status,
        );
      return ApiResponseDto.success(adjustment);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * GET /admin/orders/:orderId - Get order details
   */
  @Get('orders/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order details (admin-only)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order details',
    type: AdminOrderDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderDetail(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<AdminOrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.getOrderById(orderId);
      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }
      return ApiResponseDto.success(await this.mapOrderToAdminDto(order));
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * GET /admin/orders/:orderId/addresses - List addresses owned by the order customer
   */
  @Get('orders/:orderId/addresses')
  @UseGuards(AuthGuard, StaffGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List addresses for the order customer' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async listOrderCustomerAddresses(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const addresses =
        await this.orderService.listOrderCustomerAddresses(orderId);
      return ApiResponseDto.success(
        addresses.map((address) => this.mapAddressToAdminDto(address)),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/addresses - Create address for the order customer and bind it
   */
  @Post('orders/:orderId/addresses')
  @UseGuards(AuthGuard, StaffGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an address for the order customer' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async createOrderCustomerAddress(
    @Param('orderId') orderId: string,
    @Body() body: StaffOrderAddressInput,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const result = await this.orderService.createOrderCustomerAddress(
        orderId,
        body,
      );
      return ApiResponseDto.success({
        address: this.mapAddressToAdminDto(result.address),
        order: result.order,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * PUT /admin/orders/:orderId/address - Bind an existing customer address to the order
   */
  @Put('orders/:orderId/address')
  @UseGuards(AuthGuard, StaffGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bind an existing customer address to the order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async bindOrderCustomerAddress(
    @Param('orderId') orderId: string,
    @Body() body: { addressId: string },
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.bindOrderCustomerAddress(
        orderId,
        body.addressId,
      );
      return ApiResponseDto.success(order);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * PUT /admin/orders/:orderId/addresses/:addressId - Update customer address and refresh order binding
   */
  @Put('orders/:orderId/addresses/:addressId')
  @UseGuards(AuthGuard, StaffGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an order customer address' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'addressId', description: 'Address ID' })
  async updateOrderCustomerAddress(
    @Param('orderId') orderId: string,
    @Param('addressId') addressId: string,
    @Body() body: StaffOrderAddressInput,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const result = await this.orderService.updateOrderCustomerAddress(
        orderId,
        addressId,
        body,
      );
      return ApiResponseDto.success({
        address: this.mapAddressToAdminDto(result.address),
        order: result.order,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * GET /admin/orders/:orderId/dogs - List dogs owned by the order customer
   */
  @Get('orders/:orderId/dogs')
  @UseGuards(AuthGuard, StaffGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List dogs for the order customer' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async listOrderCustomerDogs(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const dogs = await this.orderService.listOrderCustomerDogs(orderId);
      return ApiResponseDto.success(dogs);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * PUT /admin/orders/:orderId/dog - Switch the current order to another customer dog
   */
  @Put('orders/:orderId/dog')
  @UseGuards(AuthGuard, StaffGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch order dog within the same customer account' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async switchOrderDog(
    @Param('orderId') orderId: string,
    @Body() body: { dogId: string },
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      if (!body?.dogId) {
        return ApiResponseDto.error(400, 'dogId is required');
      }
      const order = await this.orderService.switchOrderDog(
        orderId,
        body.dogId,
      );
      return ApiResponseDto.success({
        id: order.id,
        dogId: order.dogId ?? body.dogId,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof InvalidStateTransitionError
      ) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * PUT /admin/orders/:orderId/items/:itemId/package-plan - Update order item package plan
   */
  @Put('orders/:orderId/items/:itemId/package-plan')
  @UseGuards(AuthGuard, StaffGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order item package plan' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'itemId', description: 'Order item ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['packagePlan'],
      properties: {
        packagePlan: {
          type: 'array',
          items: {
            type: 'object',
            required: ['packageSpecG', 'packageCount'],
            properties: {
              packageSpecG: { type: 'number', example: 200 },
              packageCount: { type: 'number', example: 5 },
            },
          },
        },
      },
    },
  })
  async updateOrderItemPackagePlan(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body()
    body: {
      packagePlan: Array<{ packageSpecG: number; packageCount: number }>;
    },
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      if (!Array.isArray(body?.packagePlan) || body.packagePlan.length === 0) {
        return ApiResponseDto.error(400, 'packagePlan is required');
      }
      const orderItem = await this.orderService.updateOrderItemPackagePlan(
        orderId,
        itemId,
        body.packagePlan,
      );
      return ApiResponseDto.success(orderItem);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * PUT /admin/orders/:orderId/admin-remark - Update admin remark
   */
  @Put('orders/:orderId/admin-remark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order admin remark' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: UpdateOrderAdminRemarkDto })
  @ApiResponse({
    status: 200,
    description: 'Order admin remark updated successfully',
    type: AdminOrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateOrderAdminRemark(
    @Param('orderId') orderId: string,
    @Body() body: UpdateOrderAdminRemarkDto,
  ): Promise<ApiResponseDto<AdminOrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.updateAdminRemark(
        orderId,
        body.adminRemark ?? null,
      );
      return ApiResponseDto.success(await this.mapOrderToAdminDto(order));
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * PUT /admin/orders/:orderId/amount - Update order amount
   */
  @Put('orders/:orderId/amount')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order total amount' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', example: 299.0 },
      },
      required: ['amount'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Order amount updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateOrderAmount(
    @Param('orderId') orderId: string,
    @Body() body: { amount: number },
  ): Promise<ApiResponseDto<any>> {
    try {
      const amount = parseFloat(body.amount as any);
      if (isNaN(amount) || amount < 0) {
        return ApiResponseDto.error(400, 'Invalid amount');
      }

      await this.orderService.updateOrderAmount(orderId, amount);
      return ApiResponseDto.success({ message: 'Amount updated successfully' });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/ship - Ship order
   */
  @Post('orders/:orderId/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ship order with tracking information' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        carrierCode: { type: 'string', example: 'SF' },
        trackingNumber: { type: 'string', example: 'SF1234567890' },
      },
      required: ['carrierCode', 'trackingNumber'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Order shipped successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async shipOrder(
    @Param('orderId') orderId: string,
    @Body() body: { carrierCode: string; trackingNumber: string },
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.shipOrder(
        orderId,
        body.trackingNumber,
        body.carrierCode,
        null, // Admin ID not available in current implementation
      );

      // Map to DTO (simplified)
      const orderDto: OrderDto = {
        id: order.id,
        customerId: order.customerId,
        dogId: order.dogId,
        addressId: order.addressId,
        status: order.status,
        type: order.type,
        targetProductionDate: order.targetProductionDate
          ? order.targetProductionDate.toISOString()
          : null,
        totalAmount: order.totalAmount ?? order.amountTotal,
        amountProduct: order.amountProduct,
        amountShipping: order.amountShipping,
        amountTotal: order.amountTotal,
        items: await Promise.all(
          order.items.map((item) => this.mapAdminOrderItem(item)),
        ),
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/confirm-payment - Confirm payment (admin)
   */
  @Post('orders/:orderId/confirm-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm payment manually (admin)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async confirmPayment(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.confirmPaymentAdmin(
        orderId,
        null, // Admin ID not available in current implementation
      );

      // Map to DTO (simplified)
      const orderDto: OrderDto = {
        id: order.id,
        customerId: order.customerId,
        dogId: order.dogId,
        addressId: order.addressId,
        status: order.status,
        type: order.type,
        targetProductionDate: order.targetProductionDate
          ? order.targetProductionDate.toISOString()
          : null,
        totalAmount: order.totalAmount ?? order.amountTotal,
        amountProduct: order.amountProduct,
        amountShipping: order.amountShipping,
        amountTotal: order.amountTotal,
        items: await Promise.all(
          order.items.map((item) => this.mapAdminOrderItem(item)),
        ),
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/confirm-offline-payment - Confirm offline payment (admin)
   */
  @Post('orders/:orderId/confirm-offline-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm offline WeChat payment (管理员确认线下收款)',
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        actualAmount: {
          type: 'number',
          description:
            'Actual payment amount received (optional, for recording discrepancies)',
          example: 100.5,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async confirmOfflinePayment(
    @Param('orderId') orderId: string,
    @Body() body: { actualAmount?: number },
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.confirmOfflinePayment(
        orderId,
        'admin', // TODO: Implement proper admin authentication
        body.actualAmount,
      );

      // Map to DTO (simplified)
      const orderDto: OrderDto = {
        id: order.id,
        customerId: order.customerId,
        dogId: order.dogId,
        addressId: order.addressId,
        status: order.status,
        type: order.type,
        targetProductionDate: order.targetProductionDate
          ? order.targetProductionDate.toISOString()
          : null,
        totalAmount: order.totalAmount ?? order.amountTotal,
        amountProduct: order.amountProduct,
        amountShipping: order.amountShipping,
        amountTotal: order.amountTotal,
        items: await Promise.all(
          order.items.map((item) => this.mapAdminOrderItem(item)),
        ),
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        paymentMethod: order.paymentMethod ?? null,
        transactionId: order.transactionId ?? null,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        paymentStatus: order.paymentStatus ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof InvalidStateTransitionError
      ) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/start-production - Start production
   */
  @Post('orders/:orderId/start-production')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start production (PURCHASING → IN_PRODUCTION)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Production started successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async startProduction(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.startProduction(
        orderId,
        null, // Admin ID not available in current implementation
      );

      // Map to DTO (simplified)
      const orderDto: OrderDto = {
        id: order.id,
        customerId: order.customerId,
        dogId: order.dogId,
        addressId: order.addressId,
        status: order.status,
        type: order.type,
        targetProductionDate: order.targetProductionDate
          ? order.targetProductionDate.toISOString()
          : null,
        totalAmount: order.totalAmount ?? order.amountTotal,
        amountProduct: order.amountProduct,
        amountShipping: order.amountShipping,
        amountTotal: order.amountTotal,
        items: await Promise.all(
          order.items.map((item) => this.mapAdminOrderItem(item)),
        ),
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * GET /admin/orders/:orderId/history - Get order status history
   */
  @Get('orders/:orderId/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order status history' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order status history',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromStatus: { type: 'string' },
          toStatus: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          actor: { type: 'string' },
          actorId: { type: 'string', nullable: true },
          metadata: { type: 'object', nullable: true },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderHistory(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<any[]> | ApiResponseDto<null>> {
    try {
      const history = await this.orderService.getOrderStatusHistory(orderId);

      const historyDto = history.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        timestamp: h.timestamp.toISOString(),
        actor: h.actor,
        actorId: h.actorId,
        metadata: h.metadata,
      }));

      return ApiResponseDto.success(historyDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  private async mapOrderToAdminDto(order: any): Promise<AdminOrderDto> {
    const addressSource = order.shippingAddressSnapshot ?? order.address;
    const currentAddress = order.address;
    const addressPhone =
      addressSource?.phone && !this.isMaskedPhone(addressSource.phone)
        ? addressSource.phone
        : currentAddress?.phone;
    const address = addressSource
      ? {
          id: addressSource.id ?? order.addressId,
          recipientName: addressSource.recipientName,
          phone: addressPhone ?? addressSource.phone,
          region: addressSource.region,
          regionText: this.formatAddressRegionText(addressSource.region),
          detailAddress: addressSource.detail,
        }
      : null;
    const customer =
      order.customerId && this.prisma.user?.findUnique
        ? await this.prisma.user.findUnique({
            where: { id: order.customerId },
            select: {
              id: true,
              nickname: true,
              phone: true,
              avatarUrl: true,
            },
          })
        : (order.customer ?? null);

    const productionPhotos = await this.getOrderProductionPhotos(order);

    return {
      id: order.id,
      customerId: order.customerId,
      customer,
      dogId: order.dogId,
      addressId: order.addressId,
      address,
      status: order.status,
      type: order.type,
      targetProductionDate: order.targetProductionDate
        ? order.targetProductionDate.toISOString()
        : null,
      totalAmount: order.totalAmount ?? order.amountTotal,
      amountProduct: order.amountProduct,
      amountShipping: order.amountShipping,
      amountTotal: order.amountTotal,
      items: await Promise.all(
        order.items.map((item: any) => this.mapAdminOrderItem(item)),
      ),
      pricingBreakdown: order.pricingBreakdownSnapshot
        ? {
            costIngredients: order.pricingBreakdownSnapshot.costIngredients,
            costPackaging: order.pricingBreakdownSnapshot.costPackaging,
            costLabor: order.pricingBreakdownSnapshot.costLabor,
            costOverhead: order.pricingBreakdownSnapshot.costOverhead,
            totalProductCost: order.pricingBreakdownSnapshot.totalProductCost,
            productPrice: order.pricingBreakdownSnapshot.productPrice,
            shippingFee: order.pricingBreakdownSnapshot.shippingFee,
            totalPrice: order.pricingBreakdownSnapshot.totalPrice,
          }
        : undefined,
      trackingNumber: order.trackingNumber ?? null,
      carrierCode: order.carrierCode ?? null,
      shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
      completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      cancellationReason: order.cancellationReason ?? null,
      cancelledBy: order.cancelledBy ?? null,
      paymentMethod: order.paymentMethod ?? null,
      transactionId: order.transactionId ?? null,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      paymentStatus: order.paymentStatus ?? null,
      createdAt: order.createdAt.toISOString(),
      adminRemark: order.adminRemark ?? null,
      productionPhotos,
    };
  }

  private mapAddressToAdminDto(address: any) {
    return {
      id: address.id,
      userId: address.userId,
      recipientName: address.recipientName,
      phone: address.phone,
      region: address.region,
      detail: address.detail,
      isDefault: address.isDefault ?? false,
      usedByCurrentDog: address.usedByCurrentDog ?? false,
      dogAddressUsageCount: address.dogAddressUsageCount ?? 0,
      dogAddressLastUsedAt: address.dogAddressLastUsedAt ?? null,
    };
  }

  private isMaskedPhone(phone?: string | null): boolean {
    return !!phone && phone.includes('*');
  }

  private formatAddressRegionText(region: any): string {
    if (!region) {
      return '';
    }

    return [region.province, region.city, region.district]
      .filter(Boolean)
      .join(' ');
  }

  private async getOrderProductionPhotos(order: any) {
    try {
      return await resolveOrderProductionPhotos(this.prisma, order);
    } catch (error) {
      console.error(
        '[Admin Order Detail] Failed to query production photos:',
        error,
      );
      return null;
    }
  }

  private async mapAdminOrderItem(item: any): Promise<OrderItemDto> {
    const dogId = item.dogId ?? null;
    const dogInfo = await this.resolveAdminOrderItemDogInfo(dogId);

    return {
      id: item.id,
      orderId: item.orderId,
      dogId,
      recipeSnapshot: item.recipeSnapshot,
      quantityG: item.quantityG,
      packageCount: item.packageCount,
      packageSpecG: item.packageSpecG,
      packagePlan: item.packagePlan ?? null,
      ingredientSourcePlan: item.ingredientSourcePlan ?? null,
      preparationMethod: item.preparationMethod ?? null,
      cookingMethod: item.cookingMethod ?? null,
      customRequirements: item.customRequirements,
      dailyIntakeG: item.dailyIntakeG,
      dog: dogInfo,
    };
  }

  private async resolveAdminOrderItemDogInfo(
    dogId?: string | null,
  ): Promise<OrderItemDto['dog'] | undefined> {
    if (!dogId) {
      return undefined;
    }

    const dogModel = (this.prisma as any)?.dog;
    if (!dogModel?.findUnique) {
      return undefined;
    }

    try {
      const dog = await dogModel.findUnique({
        where: { id: dogId },
      });

      if (!dog) {
        return undefined;
      }

      let breedName = dog.customBreedName ?? undefined;
      if (!breedName && dog.breedId && this.dogBreedRepository?.findById) {
        try {
          const breed = await this.dogBreedRepository.findById(dog.breedId);
          breedName = breed?.name ?? undefined;
        } catch {
          breedName = undefined;
        }
      }

      return {
        id: dog.id,
        name: dog.name,
        breedName,
        weightKg:
          typeof dog.currentWeightKg === 'number'
            ? dog.currentWeightKg
            : undefined,
        gender: dog.gender,
      };
    } catch {
      return undefined;
    }
  }

  // ==========================================
  // Dog Profile Management (Admin)
  // ==========================================

  @Get('dogs')
  @ApiOperation({
    summary: 'Get all dog profiles (admin only - cross-customer)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all dog profiles with pagination',
  })
  async getAllDogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('breedId') breedId?: string,
  ): Promise<
    ApiResponseDto<{
      data: any[];
      total: number;
      page: number;
      pageSize: number;
    }>
  > {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;
    const searchText = search?.trim();
    const where: Prisma.DogWhereInput = {};

    if (breedId) {
      where.breedId = breedId;
    }

    if (searchText) {
      where.OR = [
        { name: { contains: searchText, mode: 'insensitive' } },
        { id: { contains: searchText, mode: 'insensitive' } },
      ];
    }

    const skip = (pageNum - 1) * pageSizeNum;

    // Get dogs using Prisma (admin cross-customer access)
    const [allDogs, totalResult] = await Promise.all([
      this.prisma.dog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
        include: {
          owner: {
            select: { nickname: true, phone: true },
          },
        },
      }),
      this.prisma.dog.count({ where }),
    ]);

    // Get breeds for name mapping
    const breeds = await this.dogBreedRepository.findAll();
    const breedMap = new Map(breeds.map((b) => [b.id, b.name]));

    // Map to response format
    const dogs = allDogs.map((dog: any) => ({
      id: dog.id,
      ownerId: dog.ownerId,
      ownerNickname: dog.owner?.nickname ?? null,
      ownerPhone: dog.owner?.phone ?? null,
      name: dog.name,
      breedId: dog.breedId,
      customBreedName: dog.customBreedName,
      breedName: dog.customBreedName || breedMap.get(dog.breedId) || '未知品种',
      birthday: dog.birthday.toISOString(),
      gender: dog.gender,
      isNeutered: dog.isNeutered,
      currentWeightKg: dog.currentWeightKg,
      bcsScore: dog.bcsScore,
      activityLevel: dog.activityLevel,
      lifeStageOverride: dog.lifeStageOverride,
      sizeClassOverride: dog.sizeClassOverride,
      mealsPerDay: dog.mealsPerDay,
      treatInputMode: dog.treatInputMode,
      treatLevel: dog.treatLevel,
      manualTreatKcal: dog.manualTreatKcal,
      medicalHistory: dog.medicalHistory,
      cachedTargetFoodKcal: dog.cachedTargetFoodKcal,
      createdAt: dog.createdAt ? dog.createdAt.toISOString() : undefined,
    }));

    const total = totalResult;

    return ApiResponseDto.success({
      data: dogs,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  }

  @Get('dogs/:id')
  @ApiOperation({ summary: 'Get dog profile detail (admin only)' })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Dog profile with calc result',
  })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  async getDogDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    // Get dog from Prisma to have createdAt
    const dogRecord = await this.prisma.dog.findUnique({
      where: { id },
    });

    if (!dogRecord) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    // Get breed info
    const breed = await this.dogBreedRepository.findById(dogRecord.breedId);

    // Get calc result
    const calcResult = await this.dogService.calcPreview(dogRecord.id);

    // Map profile
    const profile = {
      id: dogRecord.id,
      ownerId: dogRecord.ownerId,
      name: dogRecord.name,
      breedId: dogRecord.breedId,
      customBreedName: dogRecord.customBreedName,
      breedName: dogRecord.customBreedName || breed?.name || '未知品种',
      birthday: dogRecord.birthday.toISOString(),
      gender: dogRecord.gender,
      isNeutered: dogRecord.isNeutered,
      currentWeightKg: dogRecord.currentWeightKg,
      bcsScore: dogRecord.bcsScore,
      activityLevel: dogRecord.activityLevel,
      lifeStageOverride: dogRecord.lifeStageOverride,
      sizeClassOverride: dogRecord.sizeClassOverride,
      mealsPerDay: dogRecord.mealsPerDay,
      treatInputMode: dogRecord.treatInputMode,
      treatLevel: dogRecord.treatLevel,
      manualTreatKcal: dogRecord.manualTreatKcal,
      medicalHistory: dogRecord.medicalHistory,
      cachedTargetFoodKcal: dogRecord.cachedTargetFoodKcal,
      createdAt: dogRecord.createdAt
        ? dogRecord.createdAt.toISOString()
        : undefined,
    };

    return ApiResponseDto.success({
      profile,
      calcResult,
    });
  }

  @Delete('dogs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete dog profile (admin only)' })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({ status: 204, description: 'Dog profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete dog with active orders',
  })
  async deleteDog(@Param('id') id: string): Promise<void> {
    // Check if dog exists
    const dog = await this.prisma.dog.findUnique({
      where: { id },
    });

    if (!dog) {
      throw new NotFoundException(`Dog not found: ${id}`);
    }

    // Check for active orders
    const activeOrders = await this.prisma.order.findMany({
      where: {
        dogId: id,
        status: {
          notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        },
      },
    });

    if (activeOrders.length > 0) {
      throw new BadRequestException(
        `Cannot delete dog profile: ${activeOrders.length} active order(s) found. ` +
          `Please cancel or complete the orders first.`,
      );
    }

    // Delete the dog profile
    await this.prisma.dog.delete({
      where: { id },
    });
  }

  // ==================== Breed Management Endpoints ====================

  @Get('breeds')
  @ApiOperation({ summary: 'Get all system breeds' })
  @ApiResponse({
    status: 200,
    description: 'List of all breeds',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreedResponseDto' },
    },
  })
  async getBreeds(): Promise<ApiResponseDto<BreedResponseDto[]>> {
    const breeds = await this.dogBreedRepository.findAll();
    const usageRankings = await this.prisma.dog.groupBy({
      by: ['breedId'],
      where: {
        breedId: {
          not: MIXED_BREED_VIRTUAL_ID,
        },
      },
      _count: {
        breedId: true,
      },
      orderBy: {
        _count: {
          breedId: 'desc',
        },
      },
    });

    const profileCountMap = new Map(
      usageRankings.map((item) => [item.breedId, item._count.breedId]),
    );

    const data = breeds
      .map((breed) =>
        this.mapToBreedResponseDto(
          breed,
          profileCountMap.get(breed.id) ?? 0,
        ),
      )
      .sort((left, right) => {
        if (right.profileCount !== left.profileCount) {
          return right.profileCount - left.profileCount;
        }

        return left.name.localeCompare(right.name, 'zh-Hans-CN');
      });

    return ApiResponseDto.success(data);
  }

  @Get('breeds/custom-stats')
  @ApiOperation({ summary: 'Get custom breed statistics' })
  @ApiResponse({
    status: 200,
    description: 'Custom breed usage statistics',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/CustomBreedStatsDto' },
    },
  })
  async getCustomBreedStats(): Promise<ApiResponseDto<CustomBreedStatsDto[]>> {
    const stats = await this.dogService.getCustomBreedStats();

    return ApiResponseDto.success(stats as any);
  }

  @Get('breeds/:id/usage')
  @ApiOperation({ summary: 'Check breed usage' })
  @ApiResponse({
    status: 200,
    description: 'Breed usage statistics',
    schema: { $ref: '#/components/schemas/BreedUsageCheckDto' },
  })
  async checkBreedUsage(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<BreedUsageCheckDto>> {
    const breed = await this.dogBreedRepository.findById(id);
    if (!breed) {
      throw new NotFoundException(`Breed not found: ${id}`);
    }

    const usage = await this.dogService.checkBreedUsage(id);

    return ApiResponseDto.success(usage as any);
  }

  @Get('breeds/:id')
  @ApiOperation({ summary: 'Get breed by ID' })
  @ApiResponse({
    status: 200,
    description: 'Breed details',
    schema: { $ref: '#/components/schemas/BreedResponseDto' },
  })
  async getBreedById(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<BreedResponseDto>> {
    const breed = await this.dogBreedRepository.findById(id);
    if (!breed) {
      throw new NotFoundException(`Breed not found: ${id}`);
    }

    return ApiResponseDto.success(this.mapToBreedResponseDto(breed));
  }

  @Post('breeds')
  @ApiOperation({ summary: 'Create new breed' })
  @ApiResponse({
    status: 201,
    description: 'Breed created successfully',
    schema: { $ref: '#/components/schemas/BreedResponseDto' },
  })
  async createBreed(
    @Body() dto: CreateBreedDto,
  ): Promise<ApiResponseDto<BreedResponseDto>> {
    try {
      const breed = await this.dogService.createBreed(dto as any);

      return ApiResponseDto.success(this.mapToBreedResponseDto(breed));
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Put('breeds/:id')
  @ApiOperation({ summary: 'Update breed' })
  @ApiResponse({
    status: 200,
    description: 'Breed updated successfully',
    schema: { $ref: '#/components/schemas/BreedResponseDto' },
  })
  async updateBreed(
    @Param('id') id: string,
    @Body() dto: UpdateBreedDto,
  ): Promise<ApiResponseDto<BreedResponseDto>> {
    try {
      const breed = await this.dogService.updateBreed(id, dto as any);

      return ApiResponseDto.success(this.mapToBreedResponseDto(breed));
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Delete('breeds/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete breed' })
  @ApiResponse({ status: 204, description: 'Breed deleted successfully' })
  async deleteBreed(@Param('id') id: string): Promise<void> {
    try {
      await this.dogService.deleteBreed(id);
    } catch (error: any) {
      throw new NotFoundException(error.message);
    }
  }

  /**
   * Map DogBreed entity to response DTO
   */
  private mapToBreedResponseDto(
    breed: any,
    profileCount: number = 0,
  ): BreedResponseDto {
    return {
      id: breed.id,
      name: breed.name,
      aliases: breed.aliases || [],
      profileCount,
      sizeCategory: breed.sizeCategory,
      growthCurveType: breed.growthCurveType,
      adultAgeMonths: breed.adultAgeMonths,
      seniorAgeYears: breed.seniorAgeYears,
      averageAdultWeightKg: breed.averageAdultWeightKg ?? undefined,
      isCommon: breed.isCommon || false,
      createdAt: breed.createdAt ?? new Date(),
      updatedAt: breed.updatedAt ?? new Date(),
    };
  }

  // ==================== Ingredient Tag Management Endpoints ====================

  @Get('ingredient-tags')
  @ApiOperation({ summary: 'Get all ingredient tags' })
  @ApiResponse({
    status: 200,
    description: 'List of all tags (flat structure)',
  })
  async getAllIngredientTags(): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getAllTags();
    const data = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Get('ingredient-tags/hierarchy')
  @ApiOperation({ summary: 'Get ingredient tag hierarchy' })
  @ApiResponse({
    status: 200,
    description: 'All tags (frontend will build tree)',
  })
  async getIngredientTagHierarchy(): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getTagHierarchy();
    const data = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Get('ingredient-tags/root')
  @ApiOperation({ summary: 'Get root tags (no parent)' })
  @ApiResponse({
    status: 200,
    description: 'Root tags only',
  })
  async getRootIngredientTags(): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getRootTags();
    const data = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Get('ingredient-tags/:id')
  @ApiOperation({ summary: 'Get tag by ID' })
  @ApiResponse({ status: 200, description: 'Tag details' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async getIngredientTagById(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const tag = await this.ingredientTagService.getTagById(id);
    return ApiResponseDto.success({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    });
  }

  @Get('ingredient-tags/:id/children')
  @ApiOperation({ summary: 'Get tag children' })
  @ApiResponse({ status: 200, description: 'List of child tags' })
  async getIngredientTagChildren(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any[]>> {
    const children = await this.ingredientTagService.getChildren(id);
    const data = children.map((tag) => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Post('ingredient-tags')
  @ApiOperation({ summary: 'Create new tag' })
  @ApiResponse({ status: 201, description: 'Tag created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createIngredientTag(
    @Body() dto: CreateTagDto,
  ): Promise<ApiResponseDto<any>> {
    const tag = await this.ingredientTagService.createTag(dto);
    return ApiResponseDto.success({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    });
  }

  @Put('ingredient-tags/:id')
  @ApiOperation({ summary: 'Update tag' })
  @ApiResponse({ status: 200, description: 'Tag updated' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async updateIngredientTag(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<ApiResponseDto<any>> {
    const tag = await this.ingredientTagService.updateTag(id, dto);
    return ApiResponseDto.success({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    });
  }

  @Delete('ingredient-tags/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete tag' })
  @ApiResponse({ status: 200, description: 'Tag deleted' })
  @ApiResponse({ status: 400, description: 'Tag has children or is in use' })
  async deleteIngredientTag(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<void>> {
    await this.ingredientTagService.deleteTag(id);
    return ApiResponseDto.success(null);
  }

  @Get('ingredients/:id/tags')
  @ApiOperation({ summary: 'Get tags for an ingredient' })
  @ApiResponse({ status: 200, description: 'List of tags' })
  async getIngredientTags(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getTagsByIngredient(id);
    const data = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  // ==================== 用户管理接口（统一） ====================

  @Post('test-identity/customer-mode')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '进入生产体验版普通用户测试模式' })
  async enterCustomerTestMode(): Promise<ApiResponseDto<any>> {
    const user = await this.prisma.user.upsert({
      where: { id: CUSTOMER_TEST_USER_ID },
      create: {
        id: CUSTOMER_TEST_USER_ID,
        phone: CUSTOMER_TEST_USER_PHONE,
        nickname: CUSTOMER_TEST_USER_NICKNAME,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      },
      update: {
        phone: CUSTOMER_TEST_USER_PHONE,
        nickname: CUSTOMER_TEST_USER_NICKNAME,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      },
    });

    const token = this.jwtAuthService!.generateTokenForUser(
      user.id,
      'CUSTOMER',
    );

    return ApiResponseDto.success({
      mode: 'CUSTOMER_TEST',
      token,
      user: {
        id: user.id,
        nickname: user.nickname || CUSTOMER_TEST_USER_NICKNAME,
        avatarUrl: user.avatarUrl,
        role: 'CUSTOMER',
        phone: user.phone || CUSTOMER_TEST_USER_PHONE,
        phoneBound: true,
      },
    });
  }

  @Post('test-identity/customer-mode/reset')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '重置生产体验版普通用户测试数据' })
  async resetCustomerTestModeData(): Promise<ApiResponseDto<any>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const deletedDesignRecipeItems = await tx.designRecipeItem.deleteMany({
        where: {
          designRecipe: {
            createdBy: CUSTOMER_TEST_USER_ID,
            publishedRecipeId: null,
            publishedAt: null,
          },
        },
      });
      const deletedDesignRecipes = await tx.designRecipe.deleteMany({
        where: {
          createdBy: CUSTOMER_TEST_USER_ID,
          publishedRecipeId: null,
          publishedAt: null,
        },
      });
      const deletedRecipeSeries = await tx.recipeSeries.deleteMany({
        where: { createdBy: CUSTOMER_TEST_USER_ID },
      });

      return {
        deletedDesignRecipeItems: deletedDesignRecipeItems.count,
        deletedDesignRecipes: deletedDesignRecipes.count,
        deletedRecipeSeries: deletedRecipeSeries.count,
      };
    });

    return ApiResponseDto.success(result);
  }

  @Get('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '获取用户列表（支持角色筛选）' })
  @ApiResponse({ status: 200, description: '用户列表' })
  async getUsers(
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<
    ApiResponseDto<{
      data: StaffResponseDto[];
      total: number;
      page: number;
      pageSize: number;
    }>
  > {
    const pageNum = Math.max(1, Number.parseInt(page || '1', 10) || 1);
    const pageSizeNum = Math.min(
      100,
      Math.max(10, Number.parseInt(pageSize || '20', 10) || 20),
    );

    // 构建查询条件
    const where: Prisma.UserWhereInput = {};

    if (role && ['CUSTOMER', 'STAFF', 'ADMIN'].includes(role)) {
      where.role = role as Prisma.EnumUserRoleFilter['equals'];
    }

    if (status && ['ACTIVE', 'INACTIVE', 'BANNED'].includes(status)) {
      where.status = status as Prisma.EnumUserStatusFilter['equals'];
    }

    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      where.OR = [
        { phone: { contains: trimmedKeyword, mode: 'insensitive' } },
        { nickname: { contains: trimmedKeyword, mode: 'insensitive' } },
      ];
    }

    const [userList, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = userList.map((user) => ({
      id: user.id,
      phone: user.phone || '',
      nickname: user.nickname || '',
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));

    return ApiResponseDto.success({
      data,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  }

  private userSummaryInclude() {
    return {
      _count: {
        select: {
          dogs: true,
          orders: true,
          addresses: true,
          diySheets: true,
          favoriteRecipes: true,
          customRecipeOrders: true,
        },
      },
    } as const;
  }

  private buildUserSummary(user: any) {
    return {
      id: user.id,
      nickname: user.nickname || '微信用户',
      avatarUrl: user.avatarUrl,
      role: user.role,
      phone: user.phone,
      phoneBound: !!user.phone,
      dogCount: user._count?.dogs || 0,
      orderCount: user._count?.orders || 0,
      addressCount: user._count?.addresses || 0,
      diySheetCount: user._count?.diySheets || 0,
      favoriteRecipeCount: user._count?.favoriteRecipes || 0,
      customRecipeOrderCount: user._count?.customRecipeOrders || 0,
    };
  }

  private getSyncableUserDataCount(summary: any): number {
    return [
      summary.dogCount,
      summary.orderCount,
      summary.addressCount,
      summary.diySheetCount,
      summary.favoriteRecipeCount,
      summary.customRecipeOrderCount,
    ].reduce((total, count) => total + Number(count || 0), 0);
  }

  private resolveMergedRole(
    ...roles: Array<User['role'] | string | null | undefined>
  ): User['role'] {
    if (roles.includes('ADMIN')) return 'ADMIN' as User['role'];
    if (roles.includes('STAFF')) return 'STAFF' as User['role'];
    return 'CUSTOMER' as User['role'];
  }

  private maskPhone(phone: string): string {
    if (phone.length !== 11) return phone;
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  }

  private async findManualLegacyMigrationCandidate(targetUserId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: this.userSummaryInclude(),
    });

    if (!targetUser) {
      throw new NotFoundException('目标用户不存在');
    }

    if (!targetUser.phone) {
      throw new BadRequestException('目标用户还没有手机号，无法按手机号匹配旧版资料');
    }

    const migration = await this.prisma.accountMigration.findFirst({
      where: {
        phone: targetUser.phone,
        status: { in: ['PENDING', 'PHONE_VERIFIED', 'EXPIRED'] },
        sourceUserId: { not: targetUser.id },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!migration) {
      throw new NotFoundException('未找到该手机号对应的旧版待同步资料');
    }

    if (
      migration.targetUserId &&
      migration.targetUserId !== targetUser.id
    ) {
      throw new BadRequestException('该旧版资料已关联到其他新版账号，不能在这里手动同步');
    }

    if (
      migration.verifiedUserId &&
      migration.verifiedUserId !== targetUser.id
    ) {
      throw new BadRequestException('该旧版资料已由其他账号验证，不能在这里手动同步');
    }

    const sourceUser = await this.prisma.user.findUnique({
      where: { id: migration.sourceUserId },
      include: this.userSummaryInclude(),
    });

    if (!sourceUser) {
      throw new NotFoundException('旧版来源账号不存在');
    }

    const sourceSummary = this.buildUserSummary(sourceUser);
    const sourceDataCount = this.getSyncableUserDataCount(sourceSummary);
    if (sourceDataCount <= 0) {
      throw new BadRequestException('旧版账号没有可同步资料，无需手动同步');
    }

    return {
      migration,
      sourceUser,
      targetUser,
      sourceSummary,
      targetSummary: this.buildUserSummary(targetUser),
      sourceDataCount,
    };
  }

  private async mergeUserAccounts(
    sourceUserId: string,
    targetUserId: string,
    phone: string,
  ): Promise<any> {
    if (sourceUserId === targetUserId) {
      return this.prisma.user.update({
        where: { id: targetUserId },
        data: { phone },
        include: this.userSummaryInclude(),
      });
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const [sourceUser, targetUser] = await Promise.all([
        tx.user.findUnique({ where: { id: sourceUserId } }),
        tx.user.findUnique({ where: { id: targetUserId } }),
      ]);

      if (!sourceUser || !targetUser) {
        throw new Error('待同步账号不存在，请重新确认后再试');
      }

      const mergedRole = this.resolveMergedRole(
        sourceUser.role,
        targetUser.role,
      );

      const targetFavorites = await tx.favoriteRecipe.findMany({
        where: { userId: targetUserId },
        select: { recipeId: true },
      });
      const targetFavoriteIds = targetFavorites.map((item) => item.recipeId);
      if (targetFavoriteIds.length > 0) {
        await tx.favoriteRecipe.deleteMany({
          where: {
            userId: sourceUserId,
            recipeId: { in: targetFavoriteIds },
          },
        });
      }

      await Promise.all([
        tx.dog.updateMany({
          where: { ownerId: sourceUserId },
          data: { ownerId: targetUserId },
        }),
        tx.address.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.order.updateMany({
          where: { customerId: sourceUserId },
          data: { customerId: targetUserId },
        }),
        tx.orderPricingSnapshot.updateMany({
          where: { customerId: sourceUserId },
          data: { customerId: targetUserId },
        }),
        tx.dIYSheet.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.customRecipeOrder.updateMany({
          where: { customerId: sourceUserId },
          data: { customerId: targetUserId },
        }),
        tx.favoriteRecipe.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.recipeReview.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.feedback.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.feedbackReply.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.feedbackReply.updateMany({
          where: { replyToUserId: sourceUserId },
          data: { replyToUserId: targetUserId },
        }),
        tx.userWechatIdentity.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
      ]);

      await tx.user.update({
        where: { id: sourceUserId },
        data: {
          phone: null,
          wechatOpenid: null,
          wechatUnionid: null,
          status: 'INACTIVE',
          nickname: sourceUser.nickname
            ? `${sourceUser.nickname}(已合并)`
            : '已合并账号',
        },
      });

      return tx.user.update({
        where: { id: targetUserId },
        data: {
          role: mergedRole,
          phone,
          wechatOpenid: sourceUser.wechatOpenid || targetUser.wechatOpenid,
          wechatUnionid: targetUser.wechatUnionid || sourceUser.wechatUnionid,
          lastLoginAt: new Date(),
        },
        include: this.userSummaryInclude(),
      });
    });
  }

  @Get('users/:id/legacy-migration-candidate')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '预览用户可手动同步的旧版资料' })
  async previewUserLegacyMigration(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const candidate = await this.findManualLegacyMigrationCandidate(id);
      return ApiResponseDto.success({
        migrationId: candidate.migration.id,
        migrationStatus: candidate.migration.status,
        phone: candidate.targetUser.phone
          ? this.maskPhone(candidate.targetUser.phone)
          : null,
        sourceUser: candidate.sourceSummary,
        targetUser: candidate.targetSummary,
        sourceDataCount: candidate.sourceDataCount,
      });
    } catch (error: any) {
      return ApiResponseDto.error(
        error?.status || 500,
        error?.message || '查询旧版资料失败',
      );
    }
  }

  @Post('users/:id/legacy-migration-sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '管理员手动同步旧版资料到指定用户' })
  async syncUserLegacyMigration(
    @CurrentUser() currentUser: RequestUser,
    @Param('id') id: string,
    @Body('migrationId') migrationId?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const candidate = await this.findManualLegacyMigrationCandidate(id);

      if (migrationId && migrationId !== candidate.migration.id) {
        return ApiResponseDto.error(409, '迁移记录已变化，请刷新后重新确认');
      }

      if (!candidate.targetUser.phone) {
        return ApiResponseDto.error(400, '目标用户还没有手机号');
      }

      const mergedUser = await this.mergeUserAccounts(
        candidate.migration.sourceUserId,
        candidate.targetUser.id,
        candidate.targetUser.phone,
      );

      const metadata =
        (candidate.migration.metadata as Record<string, unknown> | null) || {};
      await this.prisma.accountMigration.update({
        where: { id: candidate.migration.id },
        data: {
          status: 'CONFIRMED',
          verifiedUserId: candidate.targetUser.id,
          targetUserId: candidate.targetUser.id,
          verifiedAt: candidate.migration.verifiedAt || new Date(),
          confirmedAt: new Date(),
          metadata: {
            ...metadata,
            adminManualSync: true,
            adminUserId: currentUser.userId,
            adminSyncedAt: new Date().toISOString(),
            phoneMasked: this.maskPhone(candidate.targetUser.phone),
            sourceDataCount: candidate.sourceDataCount,
          },
        },
      });

      return ApiResponseDto.success({
        status: 'CONFIRMED',
        mergedSourceCount: 1,
        sourceDataCount: candidate.sourceDataCount,
        user: this.buildUserSummary(mergedUser),
      });
    } catch (error: any) {
      return ApiResponseDto.error(
        error?.status || 500,
        error?.message || '手动同步旧版资料失败',
      );
    }
  }

  @Post('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '创建用户（员工）账号' })
  @ApiResponse({ status: 200, description: '用户创建成功' })
  async createUser(
    @Body() dto: CreateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto | null>> {
    // 检查手机号是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      return ApiResponseDto.error(400, '该手机号已被使用');
    }

    // 创建员工账号（角色固定为STAFF）
    const newUser = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        nickname: dto.nickname,
        role: 'STAFF',
        status: 'ACTIVE',
      },
    });

    const data: StaffResponseDto = {
      id: newUser.id,
      phone: newUser.phone!,
      nickname: newUser.nickname!,
      role: newUser.role,
      status: newUser.status,
      createdAt: newUser.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Put('users/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '更新用户信息' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto | null>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, status: true },
    });

    if (!user) {
      return ApiResponseDto.error(404, '用户不存在');
    }

    const nextRole = dto.role ?? user.role;
    const nextStatus = dto.status ?? user.status;
    const willLoseUsableAdmin =
      user.role === 'ADMIN' &&
      (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE');

    if (willLoseUsableAdmin) {
      const otherActiveAdminCount = await this.prisma.user.count({
        where: {
          id: { not: id },
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      if (otherActiveAdminCount === 0) {
        return ApiResponseDto.error(
          400,
          '至少需要保留一个正常状态的管理员账号',
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.nickname !== undefined && { nickname: dto.nickname }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.role !== undefined && { role: dto.role }),
      },
    });

    const data: StaffResponseDto = {
      id: updatedUser.id,
      phone: updatedUser.phone!,
      nickname: updatedUser.nickname!,
      role: updatedUser.role,
      status: updatedUser.status,
      lastLoginAt: updatedUser.lastLoginAt,
      createdAt: updatedUser.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Delete('users/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '删除用户账号' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteUser(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });

    if (!user) {
      return ApiResponseDto.error(404, '用户不存在');
    }

    if (user.role === 'ADMIN') {
      return ApiResponseDto.error(400, '管理员账号受保护，不能删除');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return ApiResponseDto.success(null);
  }

  // ==================== 员工管理接口（向后兼容） ====================

  @Get('staff')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '获取员工列表' })
  @ApiResponse({ status: 200, description: '员工列表' })
  async getStaffList(): Promise<ApiResponseDto<StaffResponseDto[]>> {
    const staffList = await this.prisma.user.findMany({
      where: {
        role: { in: ['STAFF', 'ADMIN'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = staffList.map((user) => ({
      id: user.id,
      phone: user.phone!,
      nickname: user.nickname || '',
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));

    return ApiResponseDto.success(data);
  }

  @Post('staff')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '创建员工账号' })
  @ApiResponse({ status: 200, description: '员工创建成功' })
  async createStaff(
    @Body() dto: CreateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto | null>> {
    // 检查手机号是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      return ApiResponseDto.error(400, '该手机号已被使用');
    }

    // 创建员工账号
    const newStaff = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        nickname: dto.nickname,
        role: 'STAFF',
        status: 'ACTIVE',
      },
    });

    const data: StaffResponseDto = {
      id: newStaff.id,
      phone: newStaff.phone!,
      nickname: newStaff.nickname!,
      role: newStaff.role,
      status: newStaff.status,
      createdAt: newStaff.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Put('staff/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '更新员工信息' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateStaff(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto | null>> {
    const staff = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });

    if (!staff) {
      return ApiResponseDto.error(404, '用户不存在');
    }

    if (staff.role === 'ADMIN') {
      return ApiResponseDto.error(400, '管理员账号受保护，不能编辑');
    }

    const updatedStaff = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    const data: StaffResponseDto = {
      id: updatedStaff.id,
      phone: updatedStaff.phone!,
      nickname: updatedStaff.nickname!,
      role: updatedStaff.role,
      status: updatedStaff.status,
      lastLoginAt: updatedStaff.lastLoginAt,
      createdAt: updatedStaff.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Delete('staff/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '删除员工账号' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteStaff(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    const staff = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });

    if (!staff) {
      return ApiResponseDto.error(404, '用户不存在');
    }

    if (staff.role === 'ADMIN') {
      return ApiResponseDto.error(400, '管理员账号受保护，不能删除');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return ApiResponseDto.success(null);
  }

  // ==================== Image Upload Endpoint ====================

  @Post('recipes/upload-image')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload recipe image to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Image uploaded' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadRecipeImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      const optimizedImage = await this.imageOptimizationService.optimizeForUpload(
        file,
        'recipe-cover',
      );
      const result = await this.cosService.uploadImage(
        optimizedImage.buffer,
        optimizedImage.filename,
        'recipes',
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('ingredients/upload-diy-image')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload supplement DIY recommendation image to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Image uploaded' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadIngredientDiyImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'ingredient-diy-images',
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('upload-package-image')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload package example image to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadPackageImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      // 上传到独立的 package-images 目录
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'package-images',
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('upload-shipping-logo')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload shipping company logo to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Logo uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadShippingLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      // 上传到独立的 shipping-logos 目录
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'shipping-logos',
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('upload-customer-service-icon')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload customer service floating button icon to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Icon uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadCustomerServiceIcon(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    if (!file) {
      return ApiResponseDto.error(400, '请选择要上传的图片');
    }

    const allowedMimeTypes = new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ]);
    if (!allowedMimeTypes.has(file.mimetype)) {
      return ApiResponseDto.error(400, '仅支持 PNG、JPG、WebP 格式图片');
    }

    const maxSizeBytes = 1 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return ApiResponseDto.error(400, '图片大小不能超过 1MB');
    }

    try {
      const result = await this.cosService.uploadImage(
        file.buffer,
        file.originalname || 'customer-service-icon.png',
        'customer-service-icons',
      );
      return ApiResponseDto.success(result, '上传成功');
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('upload-home-header-bg')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload home header background image to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadHomeHeaderBg(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      const optimizedImage = await this.imageOptimizationService.optimizeForUpload(
        file,
        'home-header-bg',
      );
      const result = await this.cosService.uploadImage(
        optimizedImage.buffer,
        optimizedImage.filename,
        'home-header-bg',
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('upload-diy-sheet-header-bg')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload DIY sheet header background image to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadDiySheetHeaderBg(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'diy-sheet-header-bg',
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Delete('recipes/delete-image')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Delete recipe image from Tencent COS' })
  @ApiResponse({ status: 200, description: 'Image deleted' })
  @ApiResponse({ status: 400, description: 'Delete failed' })
  async deleteRecipeImage(
    @Body() body: { key: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.cosService.deleteImage(body.key);
      return ApiResponseDto.success({ message: 'Image deleted successfully' });
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('ingredients/delete-diy-image')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Delete supplement DIY recommendation image from Tencent COS' })
  @ApiResponse({ status: 200, description: 'Image deleted' })
  @ApiResponse({ status: 400, description: 'Delete failed' })
  async deleteIngredientDiyImage(
    @Body() body: { key: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.cosService.deleteImage(body.key);
      return ApiResponseDto.success({ message: 'Image deleted successfully' });
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==================== Recipe Management Endpoints ====================

  @Get('recipes')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get all recipes (admin - includes drafts)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of recipes',
  })
  async getAllRecipes(@Query() query: any): Promise<ApiResponseDto<any>> {
    // Parse pagination parameters manually since transform is disabled
    const parsedQuery = {
      ...query,
      page: query.page ? parseInt(query.page, 10) : 1,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 20,
    };
    const result = await this.recipeService.getAllRecipes(parsedQuery);
    return ApiResponseDto.success(result);
  }

  /**
   * ============================================================
   * Recipe Metadata APIs (must come before :id routes)
   * ============================================================
   */

  @Get('recipes/metadata/life-stages')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get life stage enum options' })
  @ApiResponse({ status: 200, description: 'Life stage options' })
  async getLifeStages(): Promise<ApiResponseDto<any>> {
    return ApiResponseDto.success(RECIPE_LIFE_STAGE_OPTIONS);
  }

  @Get('recipes/metadata/health-tags')
  @ApiOperation({ summary: 'Get health tag enum options' })
  @ApiResponse({ status: 200, description: 'Health tag options' })
  async getHealthTagOptions(): Promise<ApiResponseDto<any>> {
    const healthTags = await this.prisma.recipeHealthTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });

    const data = healthTags.map((tag: any) => ({
      value: tag.id,
      label: tag.name,
    }));

    return ApiResponseDto.success(data);
  }

  // ==========================================
  // Design Source Management
  // ==========================================

  @Get('design-sources')
  @ApiOperation({ summary: 'Get all design sources' })
  @ApiResponse({ status: 200, description: 'List of design sources' })
  async getDesignSources(): Promise<ApiResponseDto<any>> {
    const designSources = await this.prisma.designSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const data = designSources.map((ds: any) => ({
      id: ds.id,
      name: ds.name,
      isActive: ds.isActive,
      createdAt: ds.createdAt,
      updatedAt: ds.updatedAt,
    }));

    return ApiResponseDto.success(data);
  }

  @Post('design-sources')
  @ApiOperation({ summary: 'Create new design source' })
  @ApiResponse({ status: 201, description: 'Design source created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createDesignSource(@Body() dto: any): Promise<ApiResponseDto<any>> {
    try {
      const designSource = await this.prisma.designSource.create({
        data: {
          name: dto.name,
          isActive: dto.isActive !== undefined ? dto.isActive : true,
        },
      });

      return ApiResponseDto.success({
        id: designSource.id,
        name: designSource.name,
        isActive: designSource.isActive,
        createdAt: designSource.createdAt,
        updatedAt: designSource.updatedAt,
      });
    } catch (error: any) {
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to create design source',
      );
    }
  }

  @Patch('design-sources/:id')
  @ApiOperation({ summary: 'Update design source' })
  @ApiParam({ name: 'id', description: 'Design source ID' })
  @ApiResponse({ status: 200, description: 'Design source updated' })
  @ApiResponse({ status: 404, description: 'Design source not found' })
  async updateDesignSource(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const designSource = await this.prisma.designSource.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      return ApiResponseDto.success({
        id: designSource.id,
        name: designSource.name,
        isActive: designSource.isActive,
        createdAt: designSource.createdAt,
        updatedAt: designSource.updatedAt,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Design source not found');
      }
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to update design source',
      );
    }
  }

  @Delete('design-sources/:id')
  @ApiOperation({ summary: 'Delete design source (soft delete)' })
  @ApiParam({ name: 'id', description: 'Design source ID' })
  @ApiResponse({ status: 200, description: 'Design source deleted' })
  @ApiResponse({ status: 404, description: 'Design source not found' })
  async deleteDesignSource(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.prisma.designSource.update({
        where: { id },
        data: { isActive: false },
      });

      return ApiResponseDto.success({
        message: 'Design source deleted successfully',
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Design source not found');
      }
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to delete design source',
      );
    }
  }

  // ==========================================
  // Recipe Health Tag Management
  // ==========================================

  @Get('health-tags')
  @ApiOperation({ summary: 'Get all health tags (flat list)' })
  @ApiResponse({ status: 200, description: 'List of health tags' })
  async getHealthTags(): Promise<ApiResponseDto<any>> {
    const healthTags = await this.prisma.recipeHealthTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return ApiResponseDto.success(healthTags);
  }

  @Get('health-tags/hierarchy')
  @ApiOperation({ summary: 'Get health tags hierarchy' })
  @ApiResponse({ status: 200, description: 'Health tag hierarchy' })
  async getHealthTagHierarchy(): Promise<ApiResponseDto<any>> {
    const allTags = await this.prisma.recipeHealthTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });

    // Build hierarchy tree
    const tagMap = new Map();
    const rootTags: any[] = [];

    allTags.forEach((tag) => {
      tagMap.set(tag.id, { ...tag, children: [] });
    });

    allTags.forEach((tag) => {
      const tagWithChildren = tagMap.get(tag.id);
      if (tag.parentId && tagMap.has(tag.parentId)) {
        tagMap.get(tag.parentId).children.push(tagWithChildren);
      } else {
        rootTags.push(tagWithChildren);
      }
    });

    return ApiResponseDto.success(rootTags);
  }

  @Get('health-tags/root')
  @ApiOperation({ summary: 'Get root health tags (no parent)' })
  @ApiResponse({ status: 200, description: 'Root health tags' })
  async getRootHealthTags(): Promise<ApiResponseDto<any>> {
    const rootTags = await this.prisma.recipeHealthTag.findMany({
      where: { parentId: null },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return ApiResponseDto.success(rootTags);
  }

  @Get('health-tags/:id')
  @ApiOperation({ summary: 'Get health tag by ID' })
  @ApiParam({ name: 'id', description: 'Health tag ID' })
  @ApiResponse({ status: 200, description: 'Health tag detail' })
  @ApiResponse({ status: 404, description: 'Health tag not found' })
  async getHealthTag(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const tag = await this.prisma.recipeHealthTag.findUnique({
        where: { id },
      });
      if (!tag) {
        return ApiResponseDto.error(404, 'Health tag not found');
      }
      return ApiResponseDto.success(tag);
    } catch (error: any) {
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to get health tag',
      );
    }
  }

  @Get('health-tags/:id/children')
  @ApiOperation({ summary: 'Get children of a health tag' })
  @ApiParam({ name: 'id', description: 'Parent health tag ID' })
  @ApiResponse({ status: 200, description: 'Children health tags' })
  async getHealthTagChildren(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const children = await this.prisma.recipeHealthTag.findMany({
        where: { parentId: id },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      });
      return ApiResponseDto.success(children);
    } catch (error: any) {
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to get children',
      );
    }
  }

  @Post('health-tags')
  @ApiOperation({ summary: 'Create new health tag' })
  @ApiResponse({ status: 201, description: 'Health tag created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createHealthTag(@Body() dto: any): Promise<ApiResponseDto<any>> {
    try {
      const healthTag = await this.prisma.recipeHealthTag.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          parentId: dto.parentId || null,
          sort: dto.sort || 0,
          color: dto.color || null,
        },
      });
      return ApiResponseDto.success(healthTag);
    } catch (error: any) {
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to create health tag',
      );
    }
  }

  @Put('health-tags/:id')
  @ApiOperation({ summary: 'Update health tag' })
  @ApiParam({ name: 'id', description: 'Health tag ID' })
  @ApiResponse({ status: 200, description: 'Health tag updated' })
  @ApiResponse({ status: 404, description: 'Health tag not found' })
  async updateHealthTag(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const healthTag = await this.prisma.recipeHealthTag.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.parentId !== undefined && { parentId: dto.parentId }),
          ...(dto.sort !== undefined && { sort: dto.sort }),
          ...(dto.color !== undefined && { color: dto.color }),
        },
      });
      return ApiResponseDto.success(healthTag);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Health tag not found');
      }
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to update health tag',
      );
    }
  }

  @Delete('health-tags/:id')
  @ApiOperation({ summary: 'Delete health tag' })
  @ApiParam({ name: 'id', description: 'Health tag ID' })
  @ApiResponse({ status: 200, description: 'Health tag deleted' })
  @ApiResponse({ status: 404, description: 'Health tag not found' })
  async deleteHealthTag(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      await this.prisma.recipeHealthTag.delete({
        where: { id },
      });
      return ApiResponseDto.success({
        message: 'Health tag deleted successfully',
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Health tag not found');
      }
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to delete health tag',
      );
    }
  }

  // ==========================================
  // Preparation Methods Management
  // ==========================================

  @Get('preparation-methods')
  @ApiOperation({ summary: 'Get all preparation methods' })
  @ApiResponse({ status: 200, description: 'List of preparation methods' })
  async getPreparationMethods(): Promise<ApiResponseDto<any>> {
    const methods = await this.prisma.preparationMethod.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return ApiResponseDto.success(methods);
  }

  @Get('preparation-methods/:id')
  @ApiOperation({ summary: 'Get preparation method by ID' })
  @ApiParam({ name: 'id', description: 'Preparation method ID' })
  @ApiResponse({ status: 200, description: 'Preparation method detail' })
  @ApiResponse({ status: 404, description: 'Preparation method not found' })
  async getPreparationMethod(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const method = await this.prisma.preparationMethod.findUnique({
        where: { id },
      });
      if (!method) {
        return ApiResponseDto.error(404, 'Preparation method not found');
      }
      return ApiResponseDto.success(method);
    } catch (error: any) {
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to get preparation method',
      );
    }
  }

  @Post('preparation-methods')
  @ApiOperation({ summary: 'Create new preparation method' })
  @ApiResponse({ status: 201, description: 'Preparation method created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createPreparationMethod(
    @Body() dto: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const method = await this.prisma.preparationMethod.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          sort: dto.sort || 0,
        },
      });
      return ApiResponseDto.success(method);
    } catch (error: any) {
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to create preparation method',
      );
    }
  }

  @Put('preparation-methods/:id')
  @ApiOperation({ summary: 'Update preparation method' })
  @ApiParam({ name: 'id', description: 'Preparation method ID' })
  @ApiResponse({ status: 200, description: 'Preparation method updated' })
  @ApiResponse({ status: 404, description: 'Preparation method not found' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async updatePreparationMethod(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const method = await this.prisma.preparationMethod.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.sort !== undefined && { sort: dto.sort }),
        },
      });
      return ApiResponseDto.success(method);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Preparation method not found');
      }
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to update preparation method',
      );
    }
  }

  @Delete('preparation-methods/:id')
  @ApiOperation({ summary: 'Delete preparation method' })
  @ApiParam({ name: 'id', description: 'Preparation method ID' })
  @ApiResponse({ status: 200, description: 'Preparation method deleted' })
  @ApiResponse({ status: 404, description: 'Preparation method not found' })
  async deletePreparationMethod(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.prisma.preparationMethod.delete({
        where: { id },
      });
      return ApiResponseDto.success({
        message: 'Preparation method deleted successfully',
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Preparation method not found');
      }
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to delete preparation method',
      );
    }
  }

  @Put('preparation-methods/sort')
  @ApiOperation({ summary: 'Batch update preparation methods sort order' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              sort: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Sort order updated' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async updatePreparationMethodsSort(
    @Body() dto: { items: { id: string; sort: number }[] },
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!dto.items || !Array.isArray(dto.items)) {
        return ApiResponseDto.error(400, 'Invalid input: items array required');
      }

      // Update sort order for each item
      const updatePromises = dto.items.map((item) =>
        this.prisma.preparationMethod.update({
          where: { id: item.id },
          data: { sort: item.sort },
        }),
      );

      await Promise.all(updatePromises);
      return ApiResponseDto.success({
        message: 'Sort order updated successfully',
      });
    } catch (error: any) {
      return ApiResponseDto.error(
        400,
        error.message || 'Failed to update sort order',
      );
    }
  }

  @Get('recipes/:id')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get recipe by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe detail' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async getRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.getRecipeById(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Post('recipes')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Create new recipe' })
  @ApiResponse({ status: 201, description: 'Recipe created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createRecipe(
    @Body() dto: Record<string, any>,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Debug: Check what we actually received
      if (!dto || typeof dto !== 'object') {
        throw new BadRequestException(
          `Invalid DTO: expected object, got ${typeof dto}`,
        );
      }

      // Check if name exists
      if (!dto.name) {
        throw new BadRequestException(
          `DTO name is missing. DTO keys: ${JSON.stringify(Object.keys(dto))}`,
        );
      }

      // Validate and transform enum values
      if (!dto.nutritionStandard) {
        throw new BadRequestException('nutritionStandard is required');
      }

      if (dto.status && !Object.values(RecipeStatus).includes(dto.status)) {
        throw new BadRequestException(`Invalid status: ${dto.status}`);
      }

      if (dto.applicableLifeStages) {
        for (const stage of dto.applicableLifeStages) {
          if (!Object.values(LifeStage).includes(stage)) {
            throw new BadRequestException(
              `Invalid applicableLifeStage: ${stage}`,
            );
          }
        }
      }

      // Transform strings to enums
      const transformedDto: Record<string, any> = {
        ...dto,
        nutritionStandard: dto.nutritionStandard,
        status: dto.status,
        targetHealthTags: dto.targetHealthTags || [], // Keep as UUID array
        applicableLifeStages: dto.applicableLifeStages,
      };

      const recipe = await this.recipeService.createRecipe(transformedDto);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Put('recipes/:id')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Update recipe (creates new version)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe updated' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async updateRecipe(
    @Param('id') id: string,
    @Body() dto: Record<string, any>,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      // Validate and transform enum values
      if (
        dto.nutritionStandard &&
        !Object.values(NutritionStandard).includes(dto.nutritionStandard)
      ) {
        throw new BadRequestException(
          `Invalid nutritionStandard: ${dto.nutritionStandard}`,
        );
      }

      if (dto.status && !Object.values(RecipeStatus).includes(dto.status)) {
        throw new BadRequestException(`Invalid status: ${dto.status}`);
      }

      if (dto.applicableLifeStages) {
        for (const stage of dto.applicableLifeStages) {
          if (!Object.values(LifeStage).includes(stage)) {
            throw new BadRequestException(
              `Invalid applicableLifeStage: ${stage}`,
            );
          }
        }
      }

      // Transform strings to enums
      const transformedDto: any = {
        ...dto,
        nutritionStandard: dto.nutritionStandard,
        status: dto.status,
        applicableLifeStages: dto.applicableLifeStages,
      };
      if (Object.prototype.hasOwnProperty.call(dto, 'targetHealthTags')) {
        transformedDto.targetHealthTags = dto.targetHealthTags || [];
      }

      const recipe = await this.recipeService.updateRecipe(id, transformedDto);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Delete('recipes/:id')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete recipe (DRAFT only)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 204, description: 'Recipe deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete non-DRAFT recipe' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async deleteRecipe(@Param('id') id: string): Promise<void> {
    await this.recipeService.deleteRecipe(id);
  }

  @Post('recipes/:id/publish')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Publish recipe (DRAFT -> PUBLIC)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe published' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async publishRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.publishRecipe(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('recipes/:id/unpublish')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Unpublish recipe (PUBLIC -> DRAFT)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe unpublished' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async unpublishRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.unpublishRecipe(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('recipes/:id/duplicate')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Duplicate recipe (create new recipe with new ID)' })
  @ApiParam({ name: 'id', description: 'Recipe ID to duplicate' })
  @ApiResponse({ status: 201, description: 'Recipe duplicated' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async duplicateRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.duplicateRecipe(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Get('recipes/:id/versions')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get recipe version history' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe versions' })
  async getRecipeVersions(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any[]>> {
    const versions = await this.recipeService.getRecipeVersions(id);
    return ApiResponseDto.success(versions);
  }

  @Get('recipes/:id/sales-stats')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get recipe sales statistics' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Sales statistics' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async getRecipeSalesStats(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const stats = await this.recipeService.getRecipeSalesStats(id);
      return ApiResponseDto.success(stats);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Post('recipes/regenerate-covers')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Deprecated: cover title rendering is disabled' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        recipeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of recipe IDs to regenerate covers for',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Cover regeneration results' })
  async regenerateCovers(
    @Body() body: { recipeIds?: string[] },
  ): Promise<ApiResponseDto<any>> {
    void body;
    return ApiResponseDto.success({
      total: 0,
      results: [],
      message:
        'Cover title rendering is disabled; use clean coverImageUrl images and display coverTitle in the miniapp UI.',
    });
  }

  // ==================== Recommended Products ====================

  @Get('ingredients/:ingredientId/recommended-products')
  @ApiOperation({ summary: 'Get all recommended products for an ingredient' })
  async getRecommendedProducts(
    @Param('ingredientId') ingredientId: string,
  ): Promise<ApiResponseDto<any[]>> {
    const data =
      await this.recommendedProductService.findByIngredientId(ingredientId);
    return ApiResponseDto.success(data);
  }

  @Post('ingredients/:ingredientId/recommended-products')
  @ApiOperation({ summary: 'Create a recommended product for an ingredient' })
  async createRecommendedProduct(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateRecommendedProductDto,
  ): Promise<ApiResponseDto<any>> {
    const data =
      await this.recommendedProductService.create(ingredientId, dto);
    return ApiResponseDto.success(data);
  }

  @Put('ingredients/:ingredientId/recommended-products/:id')
  @ApiOperation({ summary: 'Update a recommended product' })
  async updateRecommendedProduct(
    @Param('id') id: string,
    @Body() dto: UpdateRecommendedProductDto,
  ): Promise<ApiResponseDto<any>> {
    const data = await this.recommendedProductService.update(id, dto);
    return ApiResponseDto.success(data);
  }

  @Delete('ingredients/:ingredientId/recommended-products/:id')
  @ApiOperation({ summary: 'Delete a recommended product' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecommendedProduct(
    @Param('id') id: string,
  ): Promise<void> {
    await this.recommendedProductService.delete(id);
  }
}

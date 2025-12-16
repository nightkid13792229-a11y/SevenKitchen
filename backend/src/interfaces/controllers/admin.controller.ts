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
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { IngredientService } from '../../application/ingredient/ingredient.service';
import type { CreateIngredientDto, UpdateIngredientPriceDto } from '../../application/ingredient/ingredient.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { ProductionService, type CreateProductionBatchDto, type ProductionBatchSummaryDto } from '../../application/production/production.service';

@ApiTags('Admin')
@Controller('api/v1/admin')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminController {
  constructor(
    private readonly ingredientService: IngredientService,
    private readonly productionService: ProductionService,
  ) {}

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
    const ingredients = await this.ingredientService.getAllIngredients();
    
    // Map to inventory response format
    const inventory = ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      type: ing.type,
      brand: ing.brand,
      productModel: ing.productModel,
      purchaseChannel: ing.purchaseChannel,
      baseUnit: ing.baseUnit,
      unitDisplayLabel: ing.unitDisplayLabel,
      purchaseUnit: ing.purchaseUnit,
      purchaseToBaseRatio: ing.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: Number(ing.currentPricePerPurchaseUnit),
      unitCost: ing.getUnitCost(),
      weightG: ing.weightG,
      maxCapacityG: ing.maxCapacityG,
      properties: ing.properties,
      stock: null, // Placeholder for MVP - stock management comes later
    }));

    return ApiResponseDto.success(inventory);
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
    return ApiResponseDto.success({
      id: ingredient.id,
      name: ingredient.name,
      type: ingredient.type,
      currentPricePerPurchaseUnit: Number(ingredient.currentPricePerPurchaseUnit),
    });
  }

  @Put('ingredients/:id/price')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ingredient price' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiBody({ schema: { type: 'object', properties: { currentPricePerPurchaseUnit: { type: 'number' } }, required: ['currentPricePerPurchaseUnit'] } })
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
        unitCost: ingredient.getUnitCost(),
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Phase 8.10: Production Batch Endpoints
  // ==========================================

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
          description: 'Optional: specific order IDs to include. If not provided, includes all PAID unassigned orders.',
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
        status: { type: 'string', enum: ['PLANNED', 'IN_PRODUCTION', 'COMPLETED'] },
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
        orderItemCount: { type: 'number', description: 'Total count across all packagingUnits' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input or no PAID orders found' })
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
        orderItemCount: packagingUnits.reduce((sum, unit) => sum + unit.orderItemCount, 0),
      };

      return ApiResponseDto.success(summary);
    } catch (error) {
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
        orderItemCount: { type: 'number', description: 'Total count across all packagingUnits' },
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
      orderItemCount: packagingUnits.reduce((sum, unit) => sum + unit.orderItemCount, 0),
    };

    return ApiResponseDto.success(summary);
  }
}

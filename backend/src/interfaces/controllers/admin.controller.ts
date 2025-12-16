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

@ApiTags('Admin')
@Controller('api/v1/admin')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminController {
  constructor(
    private readonly ingredientService: IngredientService,
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
}

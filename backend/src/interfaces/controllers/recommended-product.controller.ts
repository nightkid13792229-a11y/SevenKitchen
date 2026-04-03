/**
 * RecommendedProduct Controller (DIY user-facing)
 * Batch query DIY recommended products for sheet display
 */

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RecommendedProductService } from '../../application/ingredient/recommended-product.service';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('DIY Recommended Products')
@Controller('api/v1/recommended-products')
export class RecommendedProductController {
  constructor(
    private readonly recommendedProductService: RecommendedProductService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Batch query active DIY recommended products by ingredient IDs',
  })
  @ApiQuery({
    name: 'ingredientIds',
    description: 'Comma-separated ingredient IDs',
    type: String,
  })
  async batchFind(
    @Query('ingredientIds') ingredientIdsStr: string,
  ): Promise<ApiResponseDto<Record<string, any[]>>> {
    const ingredientIds = ingredientIdsStr
      ? ingredientIdsStr.split(',').filter(Boolean)
      : [];

    const data =
      await this.recommendedProductService.batchFindActive(ingredientIds);
    return ApiResponseDto.success(data);
  }
}

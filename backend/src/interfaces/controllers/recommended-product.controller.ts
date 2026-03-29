/**
 * RecommendedProduct Controller (User-facing)
 * Batch query recommended products for DIY sheet display
 */

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RecommendedProductService } from '../../application/ingredient/recommended-product.service';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('Recommended Products')
@Controller('api/v1/recommended-products')
export class RecommendedProductController {
  constructor(
    private readonly recommendedProductService: RecommendedProductService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Batch query active recommended products by ingredient IDs' })
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

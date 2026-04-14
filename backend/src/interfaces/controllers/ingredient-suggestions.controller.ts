import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecommendedProductService } from '../../application/ingredient/recommended-product.service';
import { ProcurementSkuService } from '../../application/ingredient/procurement-sku.service';
import { ApiResponseDto } from '../dto/common/response.dto';

const normalizeDistinctValues = (
  values: Array<string | null | undefined>,
): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));

@ApiTags('Admin Ingredient Suggestions')
@Controller('api/v1/admin/ingredient-suggestions')
export class IngredientSuggestionsController {
  constructor(
    private readonly recommendedProductService: RecommendedProductService,
    private readonly procurementSkuService: ProcurementSkuService,
  ) {}

  @Get('brands')
  @ApiOperation({ summary: 'Get global historical ingredient/SKU brand suggestions' })
  async getBrandSuggestions(): Promise<ApiResponseDto<string[]>> {
    const [recommendedBrands, procurementBrands] = await Promise.all([
      this.recommendedProductService.listBrands(),
      this.procurementSkuService.listBrands(),
    ]);

    return ApiResponseDto.success(
      normalizeDistinctValues([
        ...recommendedBrands,
        ...procurementBrands,
      ]),
    );
  }

  @Get('purchase-channels')
  @ApiOperation({ summary: 'Get global historical ingredient/SKU purchase channel suggestions' })
  async getPurchaseChannelSuggestions(): Promise<ApiResponseDto<string[]>> {
    const [recommendedChannels, procurementChannels] = await Promise.all([
      this.recommendedProductService.listPurchaseChannels(),
      this.procurementSkuService.listPurchaseChannels(),
    ]);

    return ApiResponseDto.success(
      normalizeDistinctValues([
        ...recommendedChannels,
        ...procurementChannels,
      ]),
    );
  }
}

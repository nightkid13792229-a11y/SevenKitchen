import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IngredientService } from '../../application/ingredient/ingredient.service';
import { RecommendedProductService } from '../../application/ingredient/recommended-product.service';
import { ProcurementSkuService } from '../../application/ingredient/procurement-sku.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';

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
@UseGuards(AuthGuard, StaffGuard)
@Controller('api/v1/admin/ingredient-suggestions')
export class IngredientSuggestionsController {
  constructor(
    private readonly ingredientService: IngredientService,
    private readonly recommendedProductService: RecommendedProductService,
    private readonly procurementSkuService: ProcurementSkuService,
  ) {}

  @Get('brands')
  @ApiOperation({ summary: 'Get global historical ingredient/SKU brand suggestions' })
  async getBrandSuggestions(): Promise<ApiResponseDto<string[]>> {
    const [ingredients, recommendedBrands, procurementBrands] = await Promise.all([
      this.ingredientService.getAllIngredients(),
      this.recommendedProductService.listBrands(),
      this.procurementSkuService.listBrands(),
    ]);

    return ApiResponseDto.success(
      normalizeDistinctValues([
        ...ingredients.map((ingredient) => ingredient.brand),
        ...recommendedBrands,
        ...procurementBrands,
      ]),
    );
  }

  @Get('purchase-channels')
  @ApiOperation({ summary: 'Get global historical ingredient/SKU purchase channel suggestions' })
  async getPurchaseChannelSuggestions(): Promise<ApiResponseDto<string[]>> {
    const [ingredients, recommendedChannels, procurementChannels] = await Promise.all([
      this.ingredientService.getAllIngredients(),
      this.recommendedProductService.listPurchaseChannels(),
      this.procurementSkuService.listPurchaseChannels(),
    ]);

    return ApiResponseDto.success(
      normalizeDistinctValues([
        ...ingredients.map((ingredient) => ingredient.purchaseChannel),
        ...recommendedChannels,
        ...procurementChannels,
      ]),
    );
  }
}

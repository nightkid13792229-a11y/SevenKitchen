import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ProcurementSkuService,
} from '../../application/ingredient/procurement-sku.service';
import type {
  CreateProcurementSkuDto,
  UpdateProcurementSkuDto,
} from '../../application/ingredient/procurement-sku.service';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('Admin Procurement Skus')
@Controller('api/v1/admin/ingredients/:ingredientId/procurement-skus')
export class ProcurementSkuController {
  constructor(
    private readonly procurementSkuService: ProcurementSkuService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all procurement skus for an ingredient' })
  async list(@Param('ingredientId') ingredientId: string) {
    return ApiResponseDto.success(
      await this.procurementSkuService.findByIngredientId(ingredientId),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a procurement sku for an ingredient' })
  async create(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateProcurementSkuDto,
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.create(ingredientId, dto),
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a procurement sku' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProcurementSkuDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.update(
        id,
        dto,
        request.user?.userId ?? null,
      ),
    );
  }

  @Get(':id/price-history')
  @ApiOperation({ summary: 'Get effective purchase price history for a procurement sku' })
  async priceHistory(@Param('id') id: string) {
    return ApiResponseDto.success(
      await this.procurementSkuService.listPriceHistory(id),
    );
  }

  @Post(':id/price-history/:historyId/rollback')
  @ApiOperation({ summary: 'Rollback procurement sku current purchase price to a history row' })
  async rollbackPrice(
    @Param('id') id: string,
    @Param('historyId') historyId: string,
    @Req() request: { user?: { userId?: string } },
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.rollbackCurrentPurchasePrice(
        id,
        historyId,
        request.user?.userId ?? null,
      ),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a procurement sku' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.procurementSkuService.delete(id);
  }
}

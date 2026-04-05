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
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.update(id, dto),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a procurement sku' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.procurementSkuService.delete(id);
  }
}

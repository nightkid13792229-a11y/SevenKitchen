import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IngredientBatchReplaceService } from '../../application/ingredient/ingredient-batch-replace.service';
import {
  BatchReplaceRequestDto,
} from '../dto/ingredient-batch-replace.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';

@ApiTags('Admin Ingredient Batch Replace')
@Controller('api/v1/admin/ingredients')
export class IngredientBatchReplaceController {
  constructor(
    private readonly batchReplaceService: IngredientBatchReplaceService,
  ) {}

  @Get(':id/batch-replace/affected-recipes')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '查询使用某原料的全部食谱（批量替换范围选择）' })
  @ApiParam({ name: 'id', description: '被替换原料 ID' })
  @ApiResponse({ status: 200, description: '受影响食谱列表' })
  async getAffectedRecipes(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<unknown>> {
    const recipes = await this.batchReplaceService.getAffectedRecipes(id);
    return ApiResponseDto.success(recipes);
  }

  @Post(':id/batch-replace/preview')
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预览批量替换影响（含营养报告重算对比，不改数据）' })
  @ApiParam({ name: 'id', description: '被替换原料 ID' })
  async previewReplace(
    @Param('id') id: string,
    @Body() dto: BatchReplaceRequestDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.batchReplaceService.previewReplace({
      fromIngredientId: id,
      toIngredientId: dto.toIngredientId,
      recipeIds: dto.recipeIds,
      itemOverrides: dto.itemOverrides,
    });
    return ApiResponseDto.success(result);
  }

  @Post(':id/batch-replace/execute')
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '执行批量替换（事务内替换原料并重算覆盖营养报告）' })
  @ApiParam({ name: 'id', description: '被替换原料 ID' })
  async executeReplace(
    @Param('id') id: string,
    @Body() dto: BatchReplaceRequestDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.batchReplaceService.executeReplace({
      fromIngredientId: id,
      toIngredientId: dto.toIngredientId,
      recipeIds: dto.recipeIds,
      itemOverrides: dto.itemOverrides,
    });
    return ApiResponseDto.success(result, '批量替换完成');
  }
}

/**
 * Nutrition Food Controller
 * Handles nutrition food management endpoints
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { NutritionFoodService } from '../../application/nutrition-food/nutrition-food.service';
import {
  CreateNutritionFoodDto,
  UpdateNutritionFoodDto,
  CreateNutritionFoodMappingDto,
  NutritionFoodResponseDto,
  PaginatedNutritionFoodResponseDto,
  USDAFoodSearchResultDto,
} from '../dto/nutrition-food/nutrition-food.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { NutritionFoodCategory, NutritionFoodStatus } from '@prisma/client';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Nutrition Food')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/nutrition-foods')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NutritionFoodController {
  constructor(private readonly nutritionFoodService: NutritionFoodService) {}

  @Get()
  @ApiOperation({ summary: '获取营养原料列表' })
  @ApiQuery({ name: 'category', required: false, enum: NutritionFoodCategory })
  @ApiQuery({ name: 'status', required: false, enum: NutritionFoodStatus })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: '营养原料列表' })
  async findAll(
    @Query('category') category?: NutritionFoodCategory,
    @Query('status') status?: NutritionFoodStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponseDto<PaginatedNutritionFoodResponseDto | null>> {
    try {
      const result = await this.nutritionFoodService.findAll({
        category,
        status,
        search,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      });
      return new ApiResponseDto(0, 'Success', result);
    } catch (error) {
      console.error('获取营养原料列表失败:', error);
      return new ApiResponseDto(500, '获取列表失败', null);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: '获取营养原料详情' })
  @ApiParam({ name: 'id', description: '营养原料ID' })
  @ApiResponse({ status: 200, description: '营养原料详情' })
  @ApiResponse({ status: 404, description: '营养原料不存在' })
  async findOne(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<NutritionFoodResponseDto | null>> {
    try {
      const result = await this.nutritionFoodService.findOne(id);
      if (!result) {
        return new ApiResponseDto(404, '营养原料不存在', null);
      }
      return new ApiResponseDto(0, 'Success', result);
    } catch (error) {
      console.error('获取营养原料详情失败:', error);
      return new ApiResponseDto(500, '获取详情失败', null);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建营养原料' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async create(
    @Body() dto: CreateNutritionFoodDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<NutritionFoodResponseDto | null>> {
    try {
      const userId = user?.userId;
      const result = await this.nutritionFoodService.create(dto, userId);
      return new ApiResponseDto(0, '创建成功', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建失败';
      const code = message.includes('已存在') ? 400 : 500;
      return new ApiResponseDto(code, message, null);
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新营养原料' })
  @ApiParam({ name: 'id', description: '营养原料ID' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '营养原料不存在' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNutritionFoodDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<NutritionFoodResponseDto | null>> {
    try {
      const result = await this.nutritionFoodService.update(
        id,
        dto,
        user?.userId,
      );
      return new ApiResponseDto(0, '更新成功', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新失败';
      const code = message.includes('不存在') ? 404 : 500;
      return new ApiResponseDto(code, message, null);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除营养原料' })
  @ApiParam({ name: 'id', description: '营养原料ID' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '营养原料不存在' })
  async remove(@Param('id') id: string): Promise<ApiResponseDto<null>> {
    try {
      await this.nutritionFoodService.remove(id);
      return new ApiResponseDto(0, '删除成功', null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      const code = message.includes('不存在') ? 404 : 500;
      return new ApiResponseDto(code, message, null);
    }
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: '验证营养原料' })
  @ApiParam({ name: 'id', description: '营养原料ID' })
  @ApiResponse({ status: 200, description: '验证成功' })
  @ApiResponse({ status: 404, description: '营养原料不存在' })
  async verify(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<NutritionFoodResponseDto | null>> {
    try {
      const result = await this.nutritionFoodService.verify(id, user.userId);
      return new ApiResponseDto(0, '验证成功', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '验证失败';
      const code = message.includes('不存在') ? 404 : 500;
      return new ApiResponseDto(code, message, null);
    }
  }

  @Patch(':id/deprecate')
  @ApiOperation({ summary: '废弃营养原料' })
  @ApiParam({ name: 'id', description: '营养原料ID' })
  @ApiResponse({ status: 200, description: '废弃成功' })
  @ApiResponse({ status: 404, description: '营养原料不存在' })
  async deprecate(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<NutritionFoodResponseDto | null>> {
    try {
      const result = await this.nutritionFoodService.deprecate(id);
      return new ApiResponseDto(0, '废弃成功', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '废弃失败';
      const code = message.includes('不存在') ? 404 : 500;
      return new ApiResponseDto(code, message, null);
    }
  }

  // === USDA导入相关 ===

  @Get('usda/search')
  @ApiOperation({ summary: '从USDA数据库搜索食材' })
  @ApiQuery({ name: 'query', required: true })
  @ApiResponse({ status: 200, description: '搜索结果' })
  @ApiResponse({ status: 400, description: 'USDA API密钥未配置' })
  async searchUSDA(
    @Query('query') query: string,
  ): Promise<ApiResponseDto<USDAFoodSearchResultDto[] | null>> {
    try {
      const result = await this.nutritionFoodService.searchUSDA(query);
      return new ApiResponseDto(0, 'Success', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'USDA搜索失败';
      return new ApiResponseDto(400, message, null);
    }
  }

  @Post('usda/import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从USDA导入营养数据' })
  @ApiResponse({ status: 201, description: '导入成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async importFromUSDA(
    @Body()
    body: { fdcId: string; name: string; category: NutritionFoodCategory },
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<NutritionFoodResponseDto | null>> {
    try {
      const userId = user?.userId;
      const result = await this.nutritionFoodService.importFromUSDA(
        body.fdcId,
        body.name,
        body.category,
        userId,
      );
      return new ApiResponseDto(0, '导入成功', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'USDA导入失败';
      return new ApiResponseDto(400, message, null);
    }
  }

  // === 映射关系管理 ===

  @Post(':id/mappings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建营养原料与采购原料的映射' })
  @ApiParam({ name: 'id', description: '营养原料ID' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 400, description: '映射已存在或参数错误' })
  @ApiResponse({ status: 404, description: '营养原料或采购原料不存在' })
  async createMapping(
    @Param('id') id: string,
    @Body() dto: CreateNutritionFoodMappingDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.nutritionFoodService.createMapping(id, dto);
      return new ApiResponseDto(0, '创建成功', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建映射失败';
      const code = message.includes('不存在') ? 404 : 400;
      return new ApiResponseDto(code, message, null);
    }
  }

  @Delete(':id/mappings/:ingredientId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除营养原料与采购原料的映射' })
  @ApiParam({ name: 'id', description: '营养原料ID' })
  @ApiParam({ name: 'ingredientId', description: '采购原料ID' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async removeMapping(
    @Param('id') id: string,
    @Param('ingredientId') ingredientId: string,
  ): Promise<ApiResponseDto<null>> {
    try {
      await this.nutritionFoodService.removeMapping(id, ingredientId);
      return new ApiResponseDto(0, '删除成功', null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除映射失败';
      return new ApiResponseDto(500, message, null);
    }
  }
}

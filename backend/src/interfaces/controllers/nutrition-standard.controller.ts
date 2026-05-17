import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { NutritionStandardService } from '../../application/nutrition-standard/nutrition-standard.service';
import { CurrentUser, AuthGuard } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CreateNutritionStandardReviewDto,
  NutritionStandardEntryQueryDto,
} from '../dto/nutrition-standard/nutrition-standard.dto';
import { AdminGuard } from '../guards/role.guard';

@ApiTags('Nutrition Standards')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/admin/nutrition-standards')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NutritionStandardController {
  constructor(private readonly service: NutritionStandardService) {}

  @Get('fediaf-2025-dog/overview')
  @ApiOperation({ summary: 'Get FEDIAF 2025 dog standard overview' })
  async getFediaf2025DogOverview(): Promise<ApiResponseDto<any>> {
    const result = await this.service.getFediaf2025DogOverview();
    return ApiResponseDto.success(result);
  }

  @Get('fediaf-2025-dog/entries')
  @ApiOperation({ summary: 'List FEDIAF 2025 dog standard entries' })
  async listFediaf2025DogEntries(
    @Query() query: NutritionStandardEntryQueryDto,
  ): Promise<ApiResponseDto<any[]>> {
    const result = await this.service.listFediaf2025DogEntries(query);
    return ApiResponseDto.success(result);
  }

  @Get('fediaf-2025-dog/entries/:id')
  @ApiOperation({ summary: 'Get FEDIAF 2025 dog standard entry detail' })
  async getFediaf2025DogEntryDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.getFediaf2025DogEntryDetail(id);
    return ApiResponseDto.success(result);
  }

  @Patch('fediaf-2025-dog/entries/:id/review')
  @ApiOperation({
    summary: 'Create review marker for FEDIAF 2025 dog standard entry',
  })
  async createReviewEvent(
    @Param('id') id: string,
    @Body() dto: CreateNutritionStandardReviewDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.createReviewEvent(id, {
      status: dto.status,
      note: dto.note,
      reviewedBy: user?.userId,
    });
    return ApiResponseDto.success(result, '审核标记已保存');
  }
}

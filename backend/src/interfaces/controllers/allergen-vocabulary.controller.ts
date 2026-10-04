import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AllergenVocabularyService } from '../../application/health/allergen-vocabulary.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { HealthService } from '../../application/health/health.service';

/**
 * 过敏原词表 · 顾客端只读接口（2026-10-04 第一期）
 *
 * 两个用途：
 *   1. `/allergens/common` —— 小程序「一点即选」的标签
 *      改造前这 12 个标签是**硬编码在小程序里**的，后台无法维护，
 *      而且实测有 8 个匹配不到任何真实食材。现在改成读词表，
 *      顺序按知识库 skin-005 的循证常见度排，营养师也能在后台维护。
 *   2. `/dogs/:dogId/allergen-profile` —— 这只狗的过敏档案
 *      首页筛选、健康页「不能吃的」、后台营养师面板共用同一份口径。
 */
@ApiTags('Allergens')
@Controller('api/v1')
export class AllergenVocabularyController {
  constructor(
    private readonly allergenVocabulary: AllergenVocabularyService,
    private readonly healthService: HealthService,
  ) {}

  @Get('allergens/common')
  @ApiOperation({
    summary: 'List common food allergens ordered by evidence-based frequency',
  })
  @ApiResponse({ status: 200, description: 'Allergens retrieved successfully' })
  async listCommonAllergens() {
    const entries = await this.allergenVocabulary.listCommonAllergens();
    return ApiResponseDto.success({
      allergens: entries.map((entry) => ({
        code: entry.code,
        name: entry.name,
        aliases: entry.aliases,
        commonRank: entry.commonRank ?? null,
      })),
    });
  }

  @Get('dogs/:dogId/allergen-profile')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get a dog allergy profile: allergens plus ingredients to avoid',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getDogAllergenProfile(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    // 复用 HealthService 的归属校验，避免每个新接口各写一遍
    await this.healthService.assertDogOwnership(dogId, user.customerId);
    const profile = await this.allergenVocabulary.getDogAllergenProfile(dogId);
    return ApiResponseDto.success(profile);
  }
}

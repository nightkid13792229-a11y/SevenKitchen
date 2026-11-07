import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  FeedAdditiveCatalogService,
  type CatalogMatch
} from '../../domain/ingredient/feed-additive-catalog.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';

/**
 * 目录查询单独一支控制器。
 *
 * 不塞进 ingredient-creation 那个控制器：它已经有十来个依赖，再加一个会逼着
 * 每一处建它的测试都跟着改一遍——为一次查询付这个代价不值。
 */
@ApiTags('Admin Ingredient Catalog')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-catalog')
@UseGuards(AuthGuard, AdminGuard)
export class IngredientCatalogController {
  constructor(private readonly catalogService: FeedAdditiveCatalogService) {}

  @Get('feed-additives')
  @ApiOperation({ summary: '按关键词查《饲料添加剂品种目录》，顺带给出数据规模与出处' })
  @ApiQuery({ name: 'q', required: false, description: '关键词，例如「锌」' })
  async lookupFeedAdditives(
    @Query('q') q?: string
  ): Promise<
    ApiResponseDto<{
      summary: ReturnType<FeedAdditiveCatalogService['getSummary']>;
      matches: CatalogMatch[];
    }>
  > {
    return new ApiResponseDto(0, 'Success', {
      summary: this.catalogService.getSummary(),
      matches: this.catalogService.lookup(q ?? '', 20)
    });
  }
}

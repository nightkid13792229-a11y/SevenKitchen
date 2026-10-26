import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { RecipeTaxonomyService } from '../../application/recipe-taxonomy/recipe-taxonomy.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  BatchClassifyDto,
  CreateTaxonomyNodeDto,
  ListTaxonomySeriesQueryDto,
  ReplaceSeriesLinksDto,
  UpdateTaxonomyNodeDto,
} from '../dto/recipe-taxonomy/recipe-taxonomy.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { AdminGuard, StaffGuard } from '../guards/role.guard';

/**
 * 食谱需求分类 · 后台接口（2026-10-26 第一阶段）
 *
 * 权限口径沿用平台选项字典的既有约定：
 *   · **查看与归类**：员工都能做（`StaffGuard`）——整理食谱本来就是他们的活；
 *   · **改结构（增删节点、改名改定义、停用）**：仅管理员（`AdminGuard`）——
 *     节点定义是所有人的判断口径，改一次影响所有之后的归类。
 */
@ApiTags('Admin Recipe Taxonomy')
@ApiSecurity('X-Customer-Id')
@Controller('api/v1/admin/recipe-taxonomy')
@UseGuards(AuthGuard, StaffGuard)
export class AdminRecipeTaxonomyController {
  constructor(private readonly taxonomy: RecipeTaxonomyService) {}

  @Get('tree')
  @ApiOperation({ summary: '需求分类树（含每节点归属数）' })
  async getTree(@Query() query: ListTaxonomySeriesQueryDto) {
    return ApiResponseDto.success({
      kinds: await this.taxonomy.getTree({
        designMode: query.designMode,
        businessStatus: query.businessStatus,
      }),
    });
  }

  @Get('series')
  @ApiOperation({ summary: '按节点 / 未归类 / 关键词查系列' })
  async listSeries(@Query() query: ListTaxonomySeriesQueryDto) {
    const result = await this.taxonomy.listSeries({
      nodeId: query.nodeId,
      unclassified: query.unclassified === 'true',
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize,
      designMode: query.designMode,
      businessStatus: query.businessStatus,
    });
    return ApiResponseDto.success(result);
  }

  @Put('series/:seriesId/links')
  @ApiOperation({ summary: '覆盖一个系列的归属' })
  async replaceLinks(
    @Param('seriesId') seriesId: string,
    @Body() body: ReplaceSeriesLinksDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.taxonomy.replaceSeriesLinks(
      seriesId,
      body.nodeIds,
      user?.userId ?? null,
    );
    return ApiResponseDto.success({ ok: true });
  }

  @Post('series/batch-links')
  @ApiOperation({ summary: '批量归类' })
  async batchLinks(
    @Body() body: BatchClassifyDto,
    @CurrentUser() user: RequestUser,
  ) {
    const result = await this.taxonomy.batchClassify(
      body.seriesIds,
      body.nodeIds,
      user?.userId ?? null,
    );
    return ApiResponseDto.success(result);
  }

  @Post('nodes')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '新增节点' })
  async createNode(@Body() body: CreateTaxonomyNodeDto) {
    return ApiResponseDto.success(await this.taxonomy.createNode(body));
  }

  @Patch('nodes/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '修改节点（名称 / 定义 / 排序 / 停用）' })
  async updateNode(
    @Param('id') id: string,
    @Body() body: UpdateTaxonomyNodeDto,
  ) {
    return ApiResponseDto.success(await this.taxonomy.updateNode(id, body));
  }

  @Delete('nodes/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '删除节点（无子节点且无归属才允许）' })
  async deleteNode(@Param('id') id: string) {
    await this.taxonomy.deleteNode(id);
    return ApiResponseDto.success({ ok: true });
  }
}

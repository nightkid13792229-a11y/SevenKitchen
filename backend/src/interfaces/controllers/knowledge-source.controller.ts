/**
 * 知识库原文层查询接口（内部使用）。
 *
 * 只读，不写。数据由 `scripts/import-knowledge-source-layer.ts` 导入。
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SourceLayerService } from '../../application/knowledge-base/source-layer.service';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('Knowledge Source Layer')
@Controller('api/v1/knowledge-source')
export class KnowledgeSourceController {
  constructor(private readonly sourceLayer: SourceLayerService) {}

  @Get('scope')
  @ApiOperation({ summary: '库里有什么（文档/段落/表格/图片数）' })
  async scope(): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(await this.sourceLayer.getScope());
  }

  @Get('documents')
  @ApiOperation({ summary: '列出文档' })
  @ApiQuery({ name: 'sourceId', required: false, type: String })
  async documents(
    @Query('sourceId') sourceId?: string,
  ): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(await this.sourceLayer.listDocuments(sourceId));
  }

  @Get('paragraphs/search')
  @ApiOperation({ summary: '在原文里搜段落' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'documentId', required: false, type: String })
  @ApiQuery({ name: 'sourceId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async search(
    @Query('q') q: string,
    @Query('documentId') documentId?: string,
    @Query('sourceId') sourceId?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(
      await this.sourceLayer.searchParagraphs(q, {
        documentId,
        sourceId,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get('paragraphs/:id')
  @ApiOperation({ summary: '取某一段原文' })
  async paragraph(@Param('id') id: string): Promise<ApiResponseDto<unknown>> {
    const row = await this.sourceLayer.getParagraph(id);
    return row
      ? ApiResponseDto.success(row)
      : ApiResponseDto.error(404, '段落不存在');
  }

  @Get('paragraphs/:id/context')
  @ApiOperation({ summary: '取某段前后若干段' })
  @ApiQuery({ name: 'before', required: false, type: Number })
  @ApiQuery({ name: 'after', required: false, type: Number })
  async context(
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(
      await this.sourceLayer.getParagraphContext(
        id,
        before ? Number(before) : 1,
        after ? Number(after) : 1,
      ),
    );
  }

  @Get('tables/search')
  @ApiOperation({ summary: '按表题搜表格' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async searchTables(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(
      await this.sourceLayer.searchTables(q, limit ? Number(limit) : undefined),
    );
  }

  @Get('tables/:id')
  @ApiOperation({ summary: '取整张表' })
  async table(@Param('id') id: string): Promise<ApiResponseDto<unknown>> {
    const row = await this.sourceLayer.getTable(id);
    return row ? ApiResponseDto.success(row) : ApiResponseDto.error(404, '表格不存在');
  }

  @Get('figures/:id')
  @ApiOperation({ summary: '取图片记录（含文件路径与图注）' })
  async figure(@Param('id') id: string): Promise<ApiResponseDto<unknown>> {
    const row = await this.sourceLayer.getFigure(id);
    return row ? ApiResponseDto.success(row) : ApiResponseDto.error(404, '图片不存在');
  }

  @Get('entries/:entryId/anchors')
  @ApiOperation({ summary: '某条知识的全部出处锚点' })
  async anchors(
    @Param('entryId') entryId: string,
  ): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(await this.sourceLayer.getEntryAnchors(entryId));
  }

  @Get('entries/:entryId/verify')
  @ApiOperation({ summary: '校验一处引用是否靠得住（段落存在 + 同文档 + 关键词命中）' })
  @ApiQuery({ name: 'paragraphId', required: true, type: String })
  @ApiQuery({ name: 'keywords', required: false, type: String, description: '逗号分隔' })
  async verify(
    @Param('entryId') entryId: string,
    @Query('paragraphId') paragraphId: string,
    @Query('keywords') keywords?: string,
  ): Promise<ApiResponseDto<unknown>> {
    const list = (keywords ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    return ApiResponseDto.success(
      await this.sourceLayer.verifyCitation(entryId, paragraphId, list),
    );
  }

  @Get('entries/:entryId/evidence')
  @ApiOperation({ summary: '某条知识的出处 + 原文（核对用）' })
  @ApiQuery({ name: 'perAnchor', required: false, type: Number })
  async evidence(
    @Param('entryId') entryId: string,
    @Query('perAnchor') perAnchor?: string,
  ): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(
      await this.sourceLayer.getEntryEvidence(
        entryId,
        perAnchor ? Number(perAnchor) : 3,
      ),
    );
  }
}

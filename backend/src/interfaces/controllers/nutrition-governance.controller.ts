import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  NutritionCandidateStatus,
  NutritionMatchConfidence,
  SupplementNutritionDraftStatus,
} from '@prisma/client';
import { NutritionGovernanceService } from '../../application/nutrition-governance/nutrition-governance.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AdminGuard } from '../guards/role.guard';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import {
  ApplyIngredientCandidateConfigurationDto,
  BatchConfirmNutritionCandidatesDto,
  BatchAgentReviewCandidatesDto,
  ConfirmNutritionCandidateDto,
  GetLocalCfctStructuredLibraryQueryDto,
  ImportCfctReviewedSourceRowsDto,
  GenerateFoodCandidatesDto,
  ImportUsdaSourceDto,
  ListNutritionCandidatesQueryDto,
  ListSupplementDraftsQueryDto,
  RankFoodCandidatesWithAgentDto,
  ReviewCandidateWithAgentDto,
  UpdateAgentSettingsDto,
} from '../dto/nutrition-governance/nutrition-governance.dto';

const SUPPLEMENT_LABEL_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPLEMENT_LABEL_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

function supplementLabelFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!SUPPLEMENT_LABEL_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(
      new BadRequestException('仅支持 JPG、PNG、WEBP 格式的补剂标签图片'),
      false,
    );
    return;
  }

  callback(null, true);
}

@ApiTags('Admin Nutrition Governance')
@ApiBearerAuth()
@Controller('api/v1/admin/nutrition-governance')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NutritionGovernanceController {
  constructor(
    private readonly nutritionGovernanceService: NutritionGovernanceService,
    private readonly cosService: TencentCosService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取营养治理概览' })
  @ApiResponse({ status: 200, description: '营养治理概览' })
  async getOverview(): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.getOverview();
    return new ApiResponseDto(0, 'Success', result);
  }

  @Get('candidates')
  @ApiOperation({ summary: '获取营养候选列表' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: NutritionCandidateStatus,
  })
  @ApiQuery({
    name: 'confidence',
    required: false,
    enum: NutritionMatchConfidence,
  })
  @ApiQuery({
    name: 'reviewGroup',
    required: false,
    description: '审核队列分组',
  })
  @ApiQuery({
    name: 'ingredientId',
    required: false,
    description: '按后台标准原料筛选候选',
  })
  @ApiResponse({ status: 200, description: '营养候选列表' })
  async listCandidates(
    @Query() query: ListNutritionCandidatesQueryDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.listCandidates(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('candidates/generate-food')
  @ApiOperation({ summary: '为食材原料生成营养候选' })
  @ApiResponse({ status: 201, description: '生成候选成功' })
  async generateFoodCandidates(
    @Body() dto: GenerateFoodCandidatesDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.generateFoodCandidatesForIngredient(
        dto.ingredientId,
      );
    return new ApiResponseDto(0, '生成候选成功', result);
  }

  @Post('candidates/rank-with-agent')
  @ApiOperation({ summary: '按人工要求让 Agent 对同原料候选排序' })
  @ApiResponse({ status: 201, description: 'Agent 候选排序完成' })
  async rankFoodCandidatesWithAgent(
    @Body() dto: RankFoodCandidatesWithAgentDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.rankFoodCandidatesWithAgent(dto);
    return new ApiResponseDto(0, 'Agent 候选排序完成', result);
  }

  @Post('sources/usda/import')
  @ApiOperation({ summary: '导入USDA来源营养记录' })
  @ApiResponse({ status: 201, description: 'USDA 来源导入成功' })
  async importUsdaSourceRecord(
    @Body() dto: ImportUsdaSourceDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.importUsdaSourceRecord(dto.fdcId, {
        ingredientId: dto.ingredientId,
      });
    return new ApiResponseDto(0, 'USDA 来源导入成功', result);
  }

  @Get('sources/cfct/local-library')
  @ApiOperation({ summary: '读取本地 CFCT 全量结构化中间库' })
  @ApiQuery({
    name: 'queue',
    required: false,
    enum: ['full', 'auto-ready', 'needs-review'],
    description: '本地中间库队列',
  })
  @ApiResponse({ status: 200, description: 'CFCT 本地中间库' })
  async getLocalCfctStructuredLibrary(
    @Query() query: GetLocalCfctStructuredLibraryQueryDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.getLocalCfctStructuredLibrary(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('sources/cfct/import-reviewed')
  @ApiOperation({ summary: '导入已审核 CFCT OCR 来源营养记录' })
  @ApiResponse({ status: 201, description: 'CFCT 来源导入成功' })
  async importReviewedCfctSourceRows(
    @Body() dto: ImportCfctReviewedSourceRowsDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.importReviewedCfctSourceRows(dto);
    return new ApiResponseDto(0, 'CFCT 来源已导入', result);
  }

  @Get('agent-settings')
  @ApiOperation({ summary: '获取 Agent 设置（可按用途）' })
  @ApiResponse({ status: 200, description: 'Agent 设置' })
  async getAgentSettings(
    @Query('purpose') purpose?: string,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.getAgentSettings(
      purpose,
    );
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('agent-settings/test')
  @ApiOperation({ summary: '测试 DeepSeek Agent 连接' })
  @ApiResponse({ status: 201, description: 'DeepSeek 连接测试完成' })
  async testAgentSettings(
    @Query('purpose') purpose?: string,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.testAgentSettings(
      purpose,
    );
    return new ApiResponseDto(0, 'DeepSeek 连接测试完成', result);
  }

  @Put('agent-settings')
  @ApiOperation({ summary: '保存 Agent 设置（可按用途）' })
  @ApiResponse({ status: 200, description: 'Agent 设置已保存' })
  async updateAgentSettings(
    @Body() dto: UpdateAgentSettingsDto,
    @CurrentUser() user: RequestUser,
    @Query('purpose') purpose?: string,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.updateAgentSettings(
      dto,
      user.userId,
      purpose,
    );
    return new ApiResponseDto(0, 'Agent 设置已保存', result);
  }

  @Post('candidates/batch-agent-review')
  @ApiOperation({ summary: '批量运行 Agent 匹配审核' })
  @ApiResponse({ status: 201, description: '批量 Agent 匹配完成' })
  async batchAgentReviewCandidates(
    @Body() dto: BatchAgentReviewCandidatesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.startBatchAgentReview(
      dto,
      user.userId,
    );
    return new ApiResponseDto(0, '批量 Agent 匹配完成', result);
  }

  @Get('candidates/agent-review-jobs/latest')
  @ApiOperation({ summary: '获取最新 Agent 匹配任务' })
  @ApiResponse({ status: 200, description: '最新 Agent 匹配任务' })
  async getLatestAgentReviewJob(): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.getLatestAgentReviewJob();
    return new ApiResponseDto(0, 'Success', result);
  }

  @Get('candidates/agent-review-jobs/:id')
  @ApiOperation({ summary: '获取 Agent 匹配任务详情' })
  @ApiParam({ name: 'id', description: 'Agent 匹配任务ID' })
  @ApiResponse({ status: 200, description: 'Agent 匹配任务详情' })
  async getAgentReviewJob(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.getAgentReviewJob(id);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('candidates/:id/agent-review')
  @ApiOperation({ summary: '运行 Agent 语义审核并缓存结果' })
  @ApiParam({ name: 'id', description: '营养候选ID' })
  @ApiResponse({ status: 201, description: 'Agent 审核已完成' })
  async reviewCandidateWithAgent(
    @Param('id') id: string,
    @Body() _dto: ReviewCandidateWithAgentDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.reviewCandidateWithAgent(id);
    return new ApiResponseDto(0, 'Agent 审核已完成', result);
  }

  @Post('candidates/:id/nutrition-validation')
  @ApiOperation({ summary: '校验候选营养数据并生成 Agent 风险总结' })
  @ApiParam({ name: 'id', description: '营养候选ID' })
  @ApiResponse({ status: 201, description: '营养数据校验完成' })
  async validateCandidateNutritionWithAgent(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.validateCandidateNutritionWithAgent(
        id,
      );
    return new ApiResponseDto(0, '营养数据校验完成', result);
  }

  @Get('supplement-drafts')
  @ApiOperation({ summary: '获取补剂标签草稿列表' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: SupplementNutritionDraftStatus,
  })
  @ApiQuery({
    name: 'ingredientId',
    required: false,
    description: '补剂原料ID',
  })
  @ApiResponse({ status: 200, description: '补剂标签草稿列表' })
  async listSupplementDrafts(
    @Query() query: ListSupplementDraftsQueryDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.listSupplementDrafts(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('supplement-drafts/:ingredientId/upload-label')
  @ApiOperation({ summary: '上传补剂标签图片并生成待确认草稿' })
  @ApiParam({ name: 'ingredientId', description: '补剂原料ID' })
  @ApiResponse({ status: 201, description: '补剂标签草稿已生成' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: SUPPLEMENT_LABEL_MAX_FILE_SIZE_BYTES },
      fileFilter: supplementLabelFileFilter,
    }),
  )
  async uploadSupplementLabel(
    @Param('ingredientId') ingredientId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    this.assertSupplementLabelFile(file);
    const upload = await this.cosService.uploadImage(
      file,
      file.originalname,
      'supplement-labels',
    );
    try {
      const result =
        await this.nutritionGovernanceService.createSupplementDraftFromLabelImage(
          {
            ingredientId,
            imageUrl: upload.url,
            imageKey: upload.key,
            createdBy: user.userId,
          },
        );
      return new ApiResponseDto(0, '补剂标签草稿已生成', result);
    } catch (error) {
      await this.cleanupSupplementLabelUpload(upload.key);
      throw error;
    }
  }

  @Post('candidates/batch-confirm')
  @ApiOperation({ summary: '批量确认通过硬闸门的营养候选' })
  @ApiResponse({ status: 201, description: '批量确认成功' })
  async batchConfirmCandidates(
    @Body() dto: BatchConfirmNutritionCandidatesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.batchConfirmCandidatesFromWorkbench(
        dto.candidateIds,
        user.userId,
      );
    return new ApiResponseDto(0, '批量确认成功', result);
  }

  @Post('candidates/apply-ingredient-config')
  @ApiOperation({ summary: '按原料一次保存主档案和次级营养档案' })
  @ApiResponse({ status: 201, description: '原料营养配置已保存' })
  async applyIngredientCandidateConfiguration(
    @Body() dto: ApplyIngredientCandidateConfigurationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.applyIngredientCandidateConfiguration(
        dto,
        user.userId,
      );
    return new ApiResponseDto(0, '原料营养配置已保存', result);
  }

  @Post('candidates/:id/confirm')
  @ApiOperation({ summary: '确认营养候选' })
  @ApiParam({ name: 'id', description: '营养候选ID' })
  @ApiResponse({ status: 201, description: '确认成功' })
  async confirmCandidate(
    @Param('id') id: string,
    @Body() dto: ConfirmNutritionCandidateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.confirmCandidateFromWorkbench(
        id,
        user.userId,
        dto ?? { mappingRole: 'PRIMARY' },
      );
    return new ApiResponseDto(0, '确认成功', result);
  }

  @Post('candidates/:id/reject')
  @ApiOperation({ summary: '拒绝营养候选' })
  @ApiParam({ name: 'id', description: '营养候选ID' })
  @ApiResponse({ status: 201, description: '已拒绝' })
  async rejectCandidate(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.rejectCandidate(id);
    return new ApiResponseDto(0, '已拒绝', result);
  }

  @Post('supplement-drafts/:id/confirm')
  @ApiOperation({ summary: '确认补剂标签草稿并写入营养档案' })
  @ApiParam({ name: 'id', description: '补剂标签草稿ID' })
  @ApiResponse({ status: 201, description: '补剂草稿已确认' })
  async confirmSupplementDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.confirmSupplementDraft(
        id,
        user.userId,
      );
    return new ApiResponseDto(0, '补剂草稿已确认', result);
  }

  @Post('supplement-drafts/:id/reject')
  @ApiOperation({ summary: '拒绝补剂标签草稿' })
  @ApiParam({ name: 'id', description: '补剂标签草稿ID' })
  @ApiResponse({ status: 201, description: '补剂草稿已拒绝' })
  async rejectSupplementDraft(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.rejectSupplementDraft(id);
    return new ApiResponseDto(0, '补剂草稿已拒绝', result);
  }

  private assertSupplementLabelFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file) {
      throw new BadRequestException('请选择补剂标签图片');
    }

    if (file.size > SUPPLEMENT_LABEL_MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('补剂标签图片大小不能超过10MB');
    }

    if (!SUPPLEMENT_LABEL_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('仅支持 JPG、PNG、WEBP 格式的补剂标签图片');
    }

    if (!hasSupportedSupplementLabelImageSignature(file.buffer)) {
      throw new BadRequestException('补剂标签图片内容格式无效');
    }
  }

  private async cleanupSupplementLabelUpload(key: string): Promise<void> {
    try {
      await this.cosService.deleteImage(key);
    } catch (error) {
      console.error('[NutritionGovernance] Failed to cleanup label upload:', error);
    }
  }
}

function hasSupportedSupplementLabelImageSignature(buffer?: Buffer): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  return isJpeg || isPng || isWebp;
}

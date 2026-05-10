import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
} from '@prisma/client';
import { NutritionGovernanceService } from '../../application/nutrition-governance/nutrition-governance.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AdminGuard } from '../guards/role.guard';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import {
  GenerateFoodCandidatesDto,
  ImportUsdaSourceDto,
  ListNutritionCandidatesQueryDto,
} from '../dto/nutrition-governance/nutrition-governance.dto';

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

  @Post('sources/usda/import')
  @ApiOperation({ summary: '导入USDA来源营养记录' })
  @ApiResponse({ status: 201, description: 'USDA 来源导入成功' })
  async importUsdaSourceRecord(
    @Body() dto: ImportUsdaSourceDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result =
      await this.nutritionGovernanceService.importUsdaSourceRecord(dto.fdcId);
    return new ApiResponseDto(0, 'USDA 来源导入成功', result);
  }

  @Post('supplement-drafts/:ingredientId/upload-label')
  @ApiOperation({ summary: '上传补剂标签图片并生成待确认草稿' })
  @ApiParam({ name: 'ingredientId', description: '补剂原料ID' })
  @ApiResponse({ status: 201, description: '补剂标签草稿已生成' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadSupplementLabel(
    @Param('ingredientId') ingredientId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const upload = await this.cosService.uploadImage(
      file,
      file.originalname,
      'supplement-labels',
    );
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
  }

  @Post('candidates/:id/confirm')
  @ApiOperation({ summary: '确认营养候选' })
  @ApiParam({ name: 'id', description: '营养候选ID' })
  @ApiResponse({ status: 201, description: '确认成功' })
  async confirmCandidate(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.nutritionGovernanceService.confirmCandidate(
      id,
      user.userId,
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
}

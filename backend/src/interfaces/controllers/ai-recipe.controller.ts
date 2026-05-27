import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { AdminGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';
import { KnowledgeBaseService } from '../../application/ai-recipe/knowledge-base.service';
import { CreateNutritionAssessmentDto } from '../dto/ai-recipe/assessment.dto';
import { NutritionAssessmentRecordService } from '../../application/ai-recipe/nutrition-assessment-record.service';

@ApiTags('AI Recipe')
@ApiBearerAuth()
@Controller('api/v1/ai-recipe')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiRecipeController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly nutritionAssessmentRecordService: NutritionAssessmentRecordService,
  ) {}

  @Get('knowledge-sources')
  async listKnowledgeSources(): Promise<ApiResponseDto<any>> {
    const data = await this.knowledgeBaseService.listActiveSources();
    return new ApiResponseDto(0, 'Success', data);
  }

  @Get('rule-packages')
  async listRulePackages(): Promise<ApiResponseDto<any>> {
    const data = await this.knowledgeBaseService.listActiveRulePackages();
    return new ApiResponseDto(0, 'Success', data);
  }

  @Post('assessments')
  async createAssessment(
    @Body() dto: CreateNutritionAssessmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const data = await this.nutritionAssessmentRecordService.createAssessment({
      dogId: dto.dogId,
      prompt: dto.prompt,
      confirmedInputs: dto.confirmedInputs,
      createdBy: user.userId,
    });

    return new ApiResponseDto(0, 'Assessment created', data);
  }

  @Get('assessments/:id')
  async getAssessment(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const data = await this.nutritionAssessmentRecordService.getAssessment(id);

    return new ApiResponseDto(0, 'Success', data);
  }
}

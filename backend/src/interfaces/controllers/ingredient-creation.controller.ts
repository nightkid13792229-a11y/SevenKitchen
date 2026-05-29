import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IngredientCreationService } from '../../application/ingredient-creation/ingredient-creation.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CreateIngredientCreationJobDto,
  IngredientCreationMessageDto,
  UpdateIngredientCreationDraftDto,
  UpdateIngredientCreationDraftProfileDto,
} from '../dto/ingredient-creation.dto';
import { StaffGuard } from '../guards/role.guard';

function userContext(user: RequestUser) {
  return {
    userId: user.userId,
    role: user.role,
  };
}

@ApiTags('Admin Ingredient Creation')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-creation')
@UseGuards(AuthGuard, StaffGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class IngredientCreationController {
  constructor(
    private readonly ingredientCreationService: IngredientCreationService,
  ) {}

  @Post('jobs')
  async createJob(
    @Body() dto: CreateIngredientCreationJobDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.createJob({
      requestText: dto.requestText,
      userId: user.userId,
    });
    return ApiResponseDto.success(result);
  }

  @Get('jobs')
  async listJobs(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.listJobs(
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Get('jobs/:id')
  async getJobDetail(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.getJobDetail(
      id,
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('jobs/:id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: IngredientCreationMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.addUserMessage(
      id,
      { content: dto.content },
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('jobs/:id/answer')
  async answerQuestion(
    @Param('id') id: string,
    @Body() dto: IngredientCreationMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.answerQuestion(
      id,
      { content: dto.content },
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('jobs/:id/rerun')
  async rerunDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.rerunDraft(
      id,
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Patch('drafts/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientCreationDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.updateDraft(
      id,
      dto,
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Patch('draft-profiles/:id')
  async updateDraftProfile(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientCreationDraftProfileDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.updateDraftProfile(
      id,
      dto,
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('drafts/:id/confirm')
  async confirmDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.ingredientCreationService.confirmDraft(
      id,
      userContext(user),
    );
    return ApiResponseDto.success(result);
  }
}

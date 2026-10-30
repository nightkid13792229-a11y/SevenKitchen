import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { DesignRecipeCoverImageService } from '../../application/recipe-designer/design-recipe-cover-image.service';
import { RecipeDesignerService } from '../../application/recipe-designer/recipe-designer.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AdminGuard } from '../guards/role.guard';

function toAccess(user: RequestUser) {
  const context: { userId: string; role: string; customerId?: string } = {
    userId: user.userId,
    role: user.role,
  };
  if (user.customerId && user.customerId !== user.userId) {
    context.customerId = user.customerId;
  }
  return context;
}

/** 定制草稿 AI 封面（2026-10-28）：只返回预览，保存仍走展示资料 PATCH */
@ApiTags('Recipe Designer')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/recipe-designer')
@UseGuards(AuthGuard, AdminGuard)
export class DesignRecipeCoverController {
  constructor(
    private readonly recipeDesignerService: RecipeDesignerService,
    private readonly designRecipeCoverImageService: DesignRecipeCoverImageService,
  ) {}

  @Post('drafts/:draftId/ai-cover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI 生成定制草稿封面（只预览，不写库）',
  })
  async generateDraftAiCover(
    @Param('draftId') draftId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.designRecipeCoverImageService.generateForDraft(
      draftId,
      toAccess(user),
    );
    return ApiResponseDto.success(result);
  }
}

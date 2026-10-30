import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { RecipeCoverSettingsService } from '../../application/recipe-designer/recipe-cover-settings.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AdminGuard } from '../guards/role.guard';

@ApiTags('Nutrition Governance')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/admin/nutrition-governance/agent-providers/recipe-cover')
@UseGuards(AuthGuard, AdminGuard)
export class RecipeCoverConfigController {
  constructor(
    private readonly recipeCoverSettingsService: RecipeCoverSettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取 AI 食谱封面配置（DeepSeek + Seedream + 提示词）' })
  async getConfig(): Promise<ApiResponseDto<unknown>> {
    return ApiResponseDto.success(await this.recipeCoverSettingsService.get());
  }

  @Put()
  @ApiOperation({ summary: '保存 AI 食谱封面配置（Key 只回末四位）' })
  async updateConfig(
    @Body()
    dto: {
      deepseek?: Record<string, unknown>;
      ark?: Record<string, unknown>;
      promptTemplate?: string;
    },
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.recipeCoverSettingsService.update(
      {
        deepseek: dto?.deepseek as never,
        ark: dto?.ark as never,
        promptTemplate: String(dto?.promptTemplate ?? ''),
      },
      user.userId,
    );
    return ApiResponseDto.success(result);
  }
}

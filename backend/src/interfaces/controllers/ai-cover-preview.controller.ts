import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { AiCoverPreviewService } from '../../application/recipe-designer/ai-cover-preview.service';
import { AuthGuard } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AdminGuard } from '../guards/role.guard';

/** 预览 / 未保存上传图清理：管理员，引用安全 + 7 天回收站 */
@ApiTags('Admin AI Cover')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/admin/ai-covers')
@UseGuards(AuthGuard, AdminGuard)
export class AiCoverPreviewController {
  constructor(private readonly aiCoverPreviewService: AiCoverPreviewService) {}

  @Delete('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '丢弃未采用的 AI 封面预览 / 上传' })
  async discardPreview(
    @Body() dto: { url?: string; reason?: string },
  ): Promise<ApiResponseDto<{ trashed: boolean }>> {
    const reason =
      dto?.reason === 'UPLOAD_DISCARDED'
        ? 'UPLOAD_DISCARDED'
        : 'PREVIEW_DISCARDED';
    const result = await this.aiCoverPreviewService.discard(
      String(dto?.url ?? ''),
      reason,
    );
    return ApiResponseDto.success(result);
  }
}

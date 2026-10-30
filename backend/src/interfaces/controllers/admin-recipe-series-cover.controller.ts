import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  SeriesCoverImageService,
  type SeriesCoverGenerationResult,
} from '../../application/recipe-designer/series-cover-image.service';
import { AuthGuard } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AdminGuard } from '../guards/role.guard';

/**
 * 产品线系列封面 · 后台接口（2026-10-27）
 *
 * 单独一个控制器，而不是塞进 5000 行的 `AdminController`：
 *   · 路由只服务「系列封面」这一件事；
 *   · 不动 `AdminController` 的构造函数（现有测试按位置 new，动一次要改 18 处）。
 *
 * 权限：仅管理员。生图**要花钱**（约 0.2 元/张），不该让员工随手点。
 */
@ApiTags('Admin Recipe Series')
@ApiSecurity('bearer')
@Controller('api/v1/admin/recipe-series')
@UseGuards(AuthGuard, AdminGuard)
export class AdminRecipeSeriesCoverController {
  constructor(
    private readonly seriesCoverImageService: SeriesCoverImageService,
  ) {}

  /**
   * `save` 默认 false（只返回 COS 地址、不写库），和单食谱 AI 封面语义一致。
   * 只有「封面为空 + 系列未上线」的首生成传 true；后端还会再兜一层：
   * 系列已上线时即使传 true 也不落库，响应 `saved=false`。
   */
  @Post(':seriesId/ai-cover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI 生成产品线封面（只返回预览，保存由发布设置负责）',
  })
  async generateSeriesAiCover(
    @Param('seriesId') seriesId: string,
  ): Promise<ApiResponseDto<SeriesCoverGenerationResult>> {
    const result = await this.seriesCoverImageService.generateForSeries(seriesId);
    return ApiResponseDto.success(result);
  }
}

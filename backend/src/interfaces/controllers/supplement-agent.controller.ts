import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';
import { ReadLabelImagesDto } from '../dto/ingredient-creation/supplement-agent.dto';
import {
  SupplementLabelIntakeService,
  type LabelIntakeResult,
} from '../../application/ingredient-creation/supplement-label-intake.service';

/**
 * 补剂建档时的机器动作。
 *
 * 定形态与比价已经移到 DSH 的 supplement-product-selection Skill，
 * 这里只剩一件机器活：把两张图读成档案初稿。
 */
@ApiTags('Admin Supplement Agent')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-supplement-agent')
@UseGuards(AuthGuard, AdminGuard)
export class SupplementAgentController {
  constructor(private readonly labelIntake: SupplementLabelIntakeService) {}

  @Post('read-label-images')
  @ApiOperation({
    summary: '两张图读成档案初稿：正面认规格剂型，标签认 Serving Size 与成分表',
  })
  async readLabelImages(
    @Body() dto: ReadLabelImagesDto,
  ): Promise<ApiResponseDto<LabelIntakeResult>> {
    const result = await this.labelIntake.read({
      frontImageUrl: dto.frontImageUrl,
      labelImageUrl: dto.labelImageUrl,
    });
    return new ApiResponseDto(0, 'Success', result);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ProcurementSkuService,
} from '../../application/ingredient/procurement-sku.service';
import type {
  CreateProcurementSkuDto,
  UpdateProcurementSkuDto,
} from '../../application/ingredient/procurement-sku.service';
import { ProcurementSkuDraftService } from '../../application/purchasing/procurement-sku-draft.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard, StaffGuard } from '../guards/role.guard';

@ApiTags('Admin Procurement Skus')
@UseGuards(AuthGuard, StaffGuard)
@Controller('api/v1/admin/ingredients/:ingredientId/procurement-skus')
export class ProcurementSkuController {
  constructor(
    private readonly procurementSkuService: ProcurementSkuService,
    @Optional()
    private readonly procurementSkuDraftService?: ProcurementSkuDraftService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all procurement skus for an ingredient' })
  async list(@Param('ingredientId') ingredientId: string) {
    return ApiResponseDto.success(
      await this.procurementSkuService.findByIngredientId(ingredientId),
    );
  }

  /**
   * 后台版「商品截图识别」（2026-11-07 AI 建档收尾）。
   *
   * 与员工端同一套识别服务、同一份每日配额：模型和密钥只有一份，
   * 两个入口各接一套必然漂移（一个能认、一个认不出）。
   */
  @Post('procurement-sku-draft')
  @ApiOperation({ summary: '从商品详情页截图识别采购商品（只出草稿，不落库）' })
  async draftFromScreenshot(
    @Param('ingredientId') ingredientId: string,
    @Body() body: { imageUrl?: string },
    @Req() request: { user?: { userId?: string } },
  ) {
    if (!this.procurementSkuDraftService) {
      return ApiResponseDto.success({ draft: null, degraded: true });
    }

    const imageUrl = body?.imageUrl;
    if (!imageUrl) {
      return ApiResponseDto.error(400, '缺少截图地址');
    }

    try {
      const draft = await this.procurementSkuDraftService.draftFromScreenshot({
        imageUrl,
        ingredientId,
        userId: request?.user?.userId ?? '',
      });
      return ApiResponseDto.success({ draft, degraded: false });
    } catch (error) {
      // 识别不了就降级为手填，绝不卡住建档收尾（同员工端口径）
      return ApiResponseDto.success({ draft: null, degraded: true });
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a procurement sku for an ingredient' })
  async create(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateProcurementSkuDto,
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.create(ingredientId, dto),
    );
  }

  @Put(':id')
  // 2026-11-01 老板定：员工只能新增采购商品，不能改、不能删
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a procurement sku' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProcurementSkuDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.update(
        id,
        dto,
        request.user?.userId ?? null,
      ),
    );
  }

  @Get(':id/price-history')
  @ApiOperation({ summary: 'Get effective purchase price history for a procurement sku' })
  async priceHistory(@Param('id') id: string) {
    return ApiResponseDto.success(
      await this.procurementSkuService.listPriceHistory(id),
    );
  }

  @Post(':id/price-history/:historyId/rollback')
  // 改价同样只允许管理员：否则"员工不能改商品"这条会被绕开（改价也是改账）
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Rollback procurement sku current purchase price to a history row' })
  async rollbackPrice(
    @Param('id') id: string,
    @Param('historyId') historyId: string,
    @Req() request: { user?: { userId?: string } },
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.rollbackCurrentPurchasePrice(
        id,
        historyId,
        request.user?.userId ?? null,
      ),
    );
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a procurement sku' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.procurementSkuService.delete(id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PurchasingService } from '../../application/purchasing/purchasing.service';
import { InventoryService } from '../../application/inventory/inventory.service';
import { InventoryHomeService } from '../../application/inventory/inventory-home.service';
import {
  InventoryAdjustmentCategory,
  InventoryAdjustmentMode,
} from '../../domain/inventory';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';
import { UserId, UserRole } from '../auth/user.decorator';

@ApiTags('Staff Inventory')
@Controller('api/v1/staff/inventory')
@UseGuards(AuthGuard, StaffGuard)
@ApiSecurity('bearer')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class StaffInventoryController {
  constructor(
    private readonly purchasingService: PurchasingService,
    private readonly inventoryService: InventoryService,
    private readonly inventoryHomeService: InventoryHomeService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取员工端库存总览与补货建议' })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: '按原料名称/采购渠道/规格搜索',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    type: String,
    enum: ['FOOD', 'SUPPLEMENT', 'PACKAGING'],
    description: '按原料类型筛选',
  })
  @ApiQuery({
    name: 'onlyNeedsReplenishment',
    required: false,
    type: Boolean,
    description: '仅返回需要补货的原料',
  })
  async getOverview(
    @Query('keyword') keyword?: string,
    @Query('type') type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING',
    @Query('onlyNeedsReplenishment') onlyNeedsReplenishment?: string,
  ): Promise<ApiResponseDto<any[]>> {
    const inventory =
      await this.purchasingService.getStockReplenishmentIngredients({
        includeDaily: true,
        keyword,
        type,
        onlyNeedsReplenishment:
          onlyNeedsReplenishment === 'true' || onlyNeedsReplenishment === '1',
      });

    return ApiResponseDto.success(inventory);
  }

  @Get('home')
  @ApiOperation({ summary: '员工端库存首页（余额、缺什么、最近一笔、上次盘点）' })
  async getHome(): Promise<ApiResponseDto<any>> {
    const home = await this.inventoryHomeService.getHome();
    return ApiResponseDto.success(home);
  }

  @Get('ledger')
  @ApiOperation({ summary: '获取库存流水' })
  @ApiQuery({
    name: 'ingredientId',
    required: false,
    type: String,
    description: '按原料筛选流水',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '返回条数，默认 50，最大 200',
  })
  async getLedger(
    @Query('ingredientId') ingredientId?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<any[]>> {
    const ledger = await this.inventoryService.listLedgerEntries({
      ingredientId,
      limit: limit ? Number(limit) : undefined,
    });

    return ApiResponseDto.success(ledger);
  }

  @Get('stocktakes')
  @ApiOperation({ summary: '获取盘点记录列表' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '返回条数，默认 20，最大 50',
  })
  async getStocktakes(
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<any[]>> {
    const stocktakes = await this.inventoryService.listStocktakesForStaff(
      limit ? Number(limit) : undefined,
    );

    return ApiResponseDto.success(stocktakes);
  }

  @Post('adjustments')
  @ApiOperation({ summary: '记一笔：报废 / 内部领用' })
  async createAdjustment(
    @Body()
    body: {
      ingredientId: string;
      quantity: number;
      category: InventoryAdjustmentCategory;
      note?: string;
    },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const labels: Record<string, string> = {
      INTERNAL_USE: '内部领用',
      EXPIRED: '过期报废',
      DAMAGED: '破损污染',
      OTHER: '其他',
    };
    const allowedCategories = [
      InventoryAdjustmentCategory.INTERNAL_USE,
      InventoryAdjustmentCategory.EXPIRED,
      InventoryAdjustmentCategory.DAMAGED,
      InventoryAdjustmentCategory.OTHER,
    ];
    if (!allowedCategories.includes(body.category)) {
      throw new BadRequestException('分类不对');
    }
    const quantity = Math.abs(Number(body.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('数量必须大于 0');
    }
    const adjustment = await this.inventoryService.createManualAdjustment(
      {
        ingredientId: body.ingredientId,
        adjustmentMode: InventoryAdjustmentMode.DELTA,
        quantity: -quantity,
        reason: labels[body.category] || '其他',
        note: body.note,
        category: body.category,
      },
      userId,
    );
    return ApiResponseDto.success(adjustment, '已记账');
  }

  @Get('stocktakes/draft')
  @ApiOperation({ summary: '获取当前盘点草稿（没有则 204）' })
  async getDraftStocktake(
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.inventoryService.getDraftStocktake(userId);
    return ApiResponseDto.success(draft);
  }

  @Post('stocktakes')
  @ApiOperation({ summary: '开始盘点（开单即锁账面）' })
  async startStocktake(
    @Body() body: { note?: string; type?: 'OPENING' | 'ROUTINE' },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.startStocktake({
      userId,
      note: body?.note ?? null,
      type: body?.type === 'OPENING' ? 'OPENING' : 'ROUTINE',
    });
    return ApiResponseDto.success(stocktake, '盘点已开始');
  }

  @Get('stocktakes/:id')
  @ApiOperation({ summary: '查看盘点（草稿盲盘）' })
  async getStocktake(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.getStocktakeForStaff(
      id,
      userId,
    );
    return ApiResponseDto.success(stocktake);
  }

  @Delete('stocktakes/:id')
  @ApiOperation({ summary: '取消盘点草稿' })
  async cancelStocktake(
    @Param('id') id: string,
    @UserId() userId: string,
    @UserRole() role: string,
  ): Promise<ApiResponseDto<any>> {
    await this.inventoryService.cancelStocktakeDraft(
      id,
      userId,
      role === 'ADMIN',
    );
    return ApiResponseDto.success({ cancelled: true }, '草稿已取消');
  }

  @Patch('stocktakes/:id/lines')
  @ApiOperation({ summary: '保存盘点草稿' })
  async saveStocktakeLines(
    @Param('id') id: string,
    @Body()
    body: {
      lines?: Array<{ ingredientId: string; countedQuantityG: number | null }>;
      portions?: Array<{
        id: string;
        countedQuantityG?: number | null;
        remove?: boolean;
      }>;
      newPortions?: Array<{
        lineId: string;
        procurementSkuId?: string | null;
        locationLabel?: string | null;
      }>;
    },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.saveStocktakeLines(
      id,
      {
        lines: body?.lines ?? [],
        portions: body?.portions ?? [],
        newPortions: body?.newPortions ?? [],
      },
      userId,
    );
    return ApiResponseDto.success(stocktake, '已保存');
  }

  @Get('stocktakes/:id/preview')
  @ApiOperation({ summary: '完成录入后的差异预览（不写库）' })
  async previewStocktake(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('confirmPartial') confirmPartial?: string,
  ): Promise<ApiResponseDto<any>> {
    const preview = await this.inventoryService.previewStocktake(id, userId, {
      confirmPartial: confirmPartial === 'true' || confirmPartial === '1',
    });
    return ApiResponseDto.success(preview);
  }

  @Post('stocktakes/:id/submit')
  @ApiOperation({ summary: '提交盘点复核' })
  async submitStocktake(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @UserId() userId: string,
  ): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.submitStocktake(
      id,
      userId,
      body?.note ?? null,
    );
    return ApiResponseDto.success(stocktake, '盘点已提交');
  }
}

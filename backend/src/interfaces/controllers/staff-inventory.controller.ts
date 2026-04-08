import {
  Body,
  Controller,
  Get,
  Param,
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
import type { CreateInventoryStocktakeDto } from '../../application/inventory/inventory.service';
import { PurchasingService } from '../../application/purchasing/purchasing.service';
import { InventoryService } from '../../application/inventory/inventory.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';

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
    const stocktakes = await this.inventoryService.listStocktakes(
      limit ? Number(limit) : undefined,
    );

    return ApiResponseDto.success(stocktakes);
  }

  @Post('stocktakes')
  @ApiOperation({ summary: '创建移动端盘点单' })
  async createStocktake(
    @Body() dto: CreateInventoryStocktakeDto,
  ): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.createStocktake(dto);
    return ApiResponseDto.success(stocktake, '盘点单创建成功');
  }

  @Post('stocktakes/:id/apply')
  @ApiOperation({ summary: '将移动端盘点草稿立即入账' })
  async applyStocktake(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const stocktake = await this.inventoryService.applyStocktake(id);
    return ApiResponseDto.success(stocktake, '盘点差异已入账');
  }
}

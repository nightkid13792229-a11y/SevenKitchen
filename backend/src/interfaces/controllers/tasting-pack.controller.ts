import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  TastingPackConfigService,
  type UpdateTastingPackConfigDto,
} from '../../application/tasting-pack/tasting-pack-config.service';
import {
  TastingPackPricingService,
  type TastingPackRecipeSpec,
} from '../../application/tasting-pack/tasting-pack-pricing.service';
import {
  TastingPackService,
  type UpsertTastingPackDto,
} from '../../application/tasting-pack/tasting-pack.service';
import {
  TastingPackStockService,
  type TastingPackStockReasonCode,
} from '../../application/tasting-pack/tasting-pack-stock.service';
import {
  TastingPackProductionService,
  type TastingPackPlanStatus,
} from '../../application/tasting-pack/tasting-pack-production.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { StaffGuard } from '../guards/role.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user.interface';
import type { IngredientSourcePlanCode } from '../../domain/order/ingredient-source-plan';

/**
 * 试吃装 · 后台
 *
 * 试吃装是"提前做好、现货发售"的第二条鲜食产品线：
 * 顾客买到的是一整套（默认 5 道菜 × 2 袋 × 80g = 800g），
 * 价格由「成本 × 试吃倍率」自动算出，下单只扣库存、不排产。
 *
 * 后台职责分三块：
 *   1. 设置（倍率 / 限购 / 补货阈值）
 *   2. 组货（挑菜、规格、上架、生成购买链接）
 *   3. 成品库存（入库、报损、流水、过期下账）
 */
@ApiTags('Admin Tasting Pack')
@UseGuards(AuthGuard, StaffGuard)
@Controller('api/v1/admin/tasting-pack')
export class AdminTastingPackController {
  constructor(
    private readonly configService: TastingPackConfigService,
    private readonly pricingService: TastingPackPricingService,
    private readonly packService: TastingPackService,
    private readonly stockService: TastingPackStockService,
    private readonly planService: TastingPackProductionService,
  ) {}

  // ---------- 设置 ----------

  @Get('config')
  @ApiOperation({ summary: '读取试吃装设置（倍率 / 限购 / 补货阈值 / 保质期）' })
  async getConfig() {
    return ApiResponseDto.success(await this.configService.getConfig());
  }

  @Put('config')
  @ApiOperation({ summary: '更新试吃装设置' })
  async updateConfig(@Body() dto: UpdateTastingPackConfigDto) {
    return ApiResponseDto.success(await this.configService.updateConfig(dto));
  }

  // ---------- 价格与用料试算（调参用） ----------

  @Post('quote-preview')
  @ApiOperation({ summary: '按当前设置试算一套试吃装的价格（后台调参用）' })
  async quotePreview(
    @Body()
    body: {
      specs: TastingPackRecipeSpec[];
      sets?: number;
      ingredientSourcePlan?: IngredientSourcePlanCode | null;
      manualUnitPrice?: number | null;
    },
  ) {
    return ApiResponseDto.success(
      await this.pricingService.quote({
        specs: body.specs || [],
        sets: body.sets,
        ingredientSourcePlan: body.ingredientSourcePlan,
        manualUnitPrice: body.manualUnitPrice,
      }),
    );
  }

  @Post('stock-requirement-preview')
  @ApiOperation({
    summary: '备货用料测算：做 N 套需要多少原料（后台备货前核对）',
  })
  async stockRequirementPreview(
    @Body()
    body: {
      specs: TastingPackRecipeSpec[];
      sets: number;
      ingredientSourcePlan?: IngredientSourcePlanCode | null;
    },
  ) {
    return ApiResponseDto.success(
      await this.pricingService.buildStockRequirement({
        specs: body.specs || [],
        sets: body.sets,
        ingredientSourcePlan: body.ingredientSourcePlan,
      }),
    );
  }

  // ---------- 组货 ----------

  @Get('packs')
  @ApiOperation({ summary: '试吃装商品列表（含库存与价格）' })
  async listPacks() {
    const [packs, overviews] = await Promise.all([
      this.packService.listForAdmin(),
      this.stockService.listOverviews(),
    ]);

    const stockByPack = new Map(
      overviews.map((overview) => [overview.tastingPackId, overview]),
    );

    const items = await Promise.all(
      packs.map(async (pack) => {
        const stock = stockByPack.get(pack.id);
        const quote = await this.packService.quoteForPack(pack.id, 1);
        return {
          ...pack,
          availableSets: stock?.availableSets ?? 0,
          expiringSoonSets: stock?.expiringSoonSets ?? 0,
          expiredSets: stock?.expiredSets ?? 0,
          lowStockThreshold: stock?.lowStockThreshold ?? 0,
          needsRestock: stock?.needsRestock ?? false,
          unitCost: quote.unitCost,
          liveUnitCost: quote.liveUnitCost,
          unitPrice: quote.unitPrice,
          unitListPrice: quote.unitListPrice,
          costBasis: quote.costBasis,
        };
      }),
    );

    return ApiResponseDto.success({ items });
  }

  @Get('packs/:id')
  @ApiOperation({ summary: '试吃装商品详情（含价格试算）' })
  async getPack(@Param('id') id: string) {
    const [pack, quote] = await Promise.all([
      this.packService.getForAdmin(id),
      this.packService.quoteForPack(id, 1),
    ]);
    return ApiResponseDto.success({ ...pack, quote });
  }

  @Post('packs')
  @ApiOperation({ summary: '新建试吃装商品' })
  async createPack(
    @Body() dto: UpsertTastingPackDto,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.packService.create(dto, user?.customerId ?? null),
    );
  }

  @Put('packs/:id')
  @ApiOperation({ summary: '编辑试吃装商品' })
  async updatePack(@Param('id') id: string, @Body() dto: UpsertTastingPackDto) {
    return ApiResponseDto.success(await this.packService.update(id, dto));
  }

  @Post('packs/:id/publish')
  @ApiOperation({ summary: '上架试吃装' })
  async publishPack(@Param('id') id: string) {
    return ApiResponseDto.success(await this.packService.publish(id));
  }

  @Post('packs/:id/unpublish')
  @ApiOperation({ summary: '下架试吃装' })
  async unpublishPack(@Param('id') id: string) {
    return ApiResponseDto.success(await this.packService.unpublish(id));
  }

  @Delete('packs/:id')
  @ApiOperation({ summary: '删除试吃装（有库存记录时不允许，请改为下架）' })
  async removePack(@Param('id') id: string) {
    await this.packService.remove(id);
    return ApiResponseDto.success({ deleted: true });
  }

  // ---------- 成品库存 ----------

  @Get('stock')
  @ApiOperation({ summary: '全部试吃装的库存总览（含补货提醒）' })
  async listStock() {
    const items = await this.stockService.listOverviews();
    return ApiResponseDto.success({
      items,
      needsRestockCount: items.filter((item) => item.needsRestock).length,
    });
  }

  @Get('stock/ledger')
  @ApiOperation({ summary: '库存流水' })
  async listLedger(
    @Query('tastingPackId') tastingPackId?: string,
    @Query('reason') reason?: TastingPackStockReasonCode,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return ApiResponseDto.success(
      await this.stockService.listLedger({
        tastingPackId,
        reason,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
    );
  }

  @Get('stock/:tastingPackId')
  @ApiOperation({ summary: '单个试吃装的库存批次明细' })
  async getStock(@Param('tastingPackId') tastingPackId: string) {
    return ApiResponseDto.success(
      await this.stockService.getOverview(tastingPackId),
    );
  }

  @Post('stock/in')
  @ApiOperation({ summary: '备货入库（登记一批做好的试吃装）' })
  async stockIn(
    @Body()
    body: {
      tastingPackId: string;
      sets: number;
      producedAt: string;
      expiresAt?: string | null;
      unitCost?: number | null;
      note?: string | null;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.stockService.stockIn({
        tastingPackId: body.tastingPackId,
        sets: body.sets,
        producedAt: body.producedAt,
        expiresAt: body.expiresAt ?? null,
        unitCost: body.unitCost ?? null,
        note: body.note ?? null,
        operatorId: user?.customerId ?? null,
      }),
    );
  }

  @Post('stock/batches/:batchId/adjust')
  @ApiOperation({ summary: '人工调整批次库存（报损 / 盘盈盘亏）' })
  async adjustBatch(
    @Param('batchId') batchId: string,
    @Body() body: { delta: number; note: string },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.stockService.adjust({
        batchId,
        delta: body.delta,
        note: body.note,
        operatorId: user?.customerId ?? null,
      }),
    );
  }

  @Post('stock/batches/:batchId/void')
  @ApiOperation({ summary: '作废整个批次（整批报废）' })
  async voidBatch(
    @Param('batchId') batchId: string,
    @Body() body: { note: string },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.stockService.voidBatch({
        batchId,
        note: body.note,
        operatorId: user?.customerId ?? null,
      }),
    );
  }

  @Post('stock/expiry-sweep')
  @ApiOperation({ summary: '把已过期的批次下账（不影响到期前已排除的可售量）' })
  async expirySweep(@CurrentUser() user: RequestUser) {
    return ApiResponseDto.success(
      await this.stockService.runExpirySweep(user?.customerId ?? null),
    );
  }

  // ---------- 备货生产 ----------

  @Get('restock-suggestions')
  @ApiOperation({
    summary: '需要补货的试吃装（含建议备货套数，供一键备货）',
  })
  async restockSuggestions() {
    return ApiResponseDto.success(
      await this.planService.getRestockSuggestions(),
    );
  }

  @Get('production-plans')
  @ApiOperation({ summary: '备货生产单列表' })
  async listPlans(
    @Query('status') status?: TastingPackPlanStatus,
    @Query('tastingPackId') tastingPackId?: string,
  ) {
    return ApiResponseDto.success(
      await this.planService.listPlans({ status, tastingPackId }),
    );
  }

  @Get('production-plans/:id')
  @ApiOperation({ summary: '备货生产单详情（含建议入库套数）' })
  async getPlan(@Param('id') id: string) {
    return ApiResponseDto.success(await this.planService.getPlan(id));
  }

  @Post('production-plans')
  @ApiOperation({
    summary: '建备货生产单：把"做几套"换算成每道菜做多少、原料买多少',
  })
  async createPlan(
    @Body()
    body: {
      tastingPackId: string;
      sets: number;
      plannedDate: string;
      note?: string | null;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.planService.createPlan({
        tastingPackId: body.tastingPackId,
        sets: body.sets,
        plannedDate: body.plannedDate,
        note: body.note ?? null,
        createdById: user?.customerId ?? null,
      }),
    );
  }

  @Post('production-plans/:id/purchase-list')
  @ApiOperation({ summary: '按备货单的用料生成采购清单（含原料库存抵扣）' })
  async createPurchaseList(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.planService.generatePurchaseList(id, user?.customerId ?? ''),
    );
  }

  @Post('production-plans/:id/schedule')
  @ApiOperation({ summary: '排产：生成备货生产批次' })
  async schedulePlan(
    @Param('id') id: string,
    @Body() body: { productionDate?: string; force?: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.planService.schedule(id, {
        productionDate: body?.productionDate,
        force: body?.force === true,
        createdById: user?.customerId ?? null,
      }),
    );
  }

  @Post('production-plans/:id/stock-in')
  @ApiOperation({ summary: '完工确认入库（不填套数则用系统建议值）' })
  async stockInPlan(
    @Param('id') id: string,
    @Body()
    body: {
      sets?: number;
      unitCost?: number | null;
      producedAt?: string;
      note?: string | null;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.planService.stockIn(id, {
        sets: body?.sets,
        unitCost: body?.unitCost ?? null,
        producedAt: body?.producedAt,
        note: body?.note ?? null,
        operatorId: user?.customerId ?? null,
      }),
    );
  }

  @Post('production-plans/:id/cancel')
  @ApiOperation({ summary: '取消备货生产单（已排产/已入库的不允许）' })
  async cancelPlan(
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return ApiResponseDto.success(
      await this.planService.cancelPlan(id, body?.reason ?? ''),
    );
  }
}

/**
 * 试吃装 · 顾客端
 */
@ApiTags('Tasting Pack')
@UseGuards(AuthGuard)
@Controller('api/v1/tasting-packs')
export class PublicTastingPackController {
  constructor(
    private readonly configService: TastingPackConfigService,
    private readonly packService: TastingPackService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: '试吃装是否开放（供小程序决定是否展示入口）' })
  async status() {
    const config = await this.configService.getConfig();
    return ApiResponseDto.success({
      enabled: config.enabled,
      maxSetsPerOrder: config.maxSetsPerOrder,
    });
  }

  @Get()
  @ApiOperation({ summary: '试吃装货架（仅上架商品，含实时价格与可售套数）' })
  async list() {
    const config = await this.configService.getConfig();
    if (!config.enabled) {
      return ApiResponseDto.success({ items: [], enabled: false });
    }
    const items = await this.packService.listShelf();
    return ApiResponseDto.success({ items, enabled: true });
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: '试吃装详情（按 id 或面客编号）' })
  async detail(@Param('idOrCode') idOrCode: string) {
    const config = await this.configService.getConfig();
    if (!config.enabled) {
      return ApiResponseDto.success({ enabled: false, pack: null });
    }
    const pack = await this.packService.getShelfItem(idOrCode);
    return ApiResponseDto.success({ enabled: true, pack });
  }

  @Post(':idOrCode/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '生成购买报价（含价格快照，下单时凭快照锁价）',
  })
  async quote(
    @Param('idOrCode') idOrCode: string,
    @Body() body: { sets?: number; addressId?: string | null },
    @CurrentUser() user: RequestUser,
  ) {
    const config = await this.configService.getConfig();
    if (!config.enabled) {
      return ApiResponseDto.error(400, '试吃装暂未开放');
    }

    const sets = Number(body?.sets ?? 1);
    return ApiResponseDto.success(
      await this.packService.createPurchaseQuote({
        idOrCode,
        sets,
        addressId: body?.addressId ?? null,
        customerId: user.customerId,
      }),
    );
  }
}

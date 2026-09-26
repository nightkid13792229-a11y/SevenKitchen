/**
 * 试吃装商品（目录）
 *
 * 后台在这里组货：挑哪几道菜、什么规格、上不上架、要不要手动定价。
 * 顾客端拿到的是"上架商品 + 实时可售套数 + 实时价格"。
 *
 * 两条必须守住的规则：
 *   1. **只能选已公开的食谱**。私有定制食谱属于某位顾客，
 *      一旦被组进对外售卖的商品，就是把顾客的定制配方卖给别人。
 *   2. **价格不在商品上写死**（除非运营手动覆盖）：按「库存批次成本 × 试吃倍率」实时算，
 *      这样原料涨价不会让已做好的库存凭空少赚。
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import type { IOrderPricingSnapshotRepository } from '../../domain/order-pricing-snapshot/order-pricing-snapshot.repository.interface';
import {
  buildTastingPackOrderSnapshot,
  TASTING_PACK_SNAPSHOT_KIND,
} from './tasting-pack-snapshot';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { RECIPE_REPOSITORY } from '../dog/dog.service';
import { TastingPackConfigService } from './tasting-pack-config.service';
import { TastingPackStockService } from './tasting-pack-stock.service';
import {
  TastingPackPricingService,
  type TastingPackQuote,
} from './tasting-pack-pricing.service';

export interface TastingPackItemInput {
  recipeId: string;
  sortOrder?: number;
}

export interface UpsertTastingPackDto {
  name: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  detailImages?: unknown;
  bagsPerRecipe?: number;
  packSpecG?: number;
  manualPrice?: number | null;
  maxSetsOverride?: number | null;
  sortOrder?: number;
  items: TastingPackItemInput[];
}

export interface TastingPackItemView {
  id: string;
  recipeId: string;
  sortOrder: number;
  name: string;
  coverImageUrl: string | null;
  sellingPoint: string | null;
}

export interface TastingPackAdminView {
  id: string;
  code: string;
  name: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  detailImages: unknown;
  status: string;
  bagsPerRecipe: number;
  packSpecG: number;
  manualPrice: number | null;
  maxSetsOverride: number | null;
  sortOrder: number;
  totalNetWeightG: number;
  totalPacks: number;
  items: TastingPackItemView[];
  createdAt: string;
  updatedAt: string;
}

export interface TastingPackShelfView extends TastingPackAdminView {
  /** 可售套数 */
  availableSets: number;
  /** 单次限购（已算上商品级覆盖） */
  maxSetsPerOrder: number;
  /** 一套实收 */
  unitPrice: number;
  /** 一套划线价 */
  unitListPrice: number;
  /** 库存不足时仍展示商品，但顾客不能下单 */
  soldOut: boolean;
}

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

@Injectable()
export class TastingPackService {
  private readonly logger = new Logger(TastingPackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: TastingPackConfigService,
    private readonly pricingService: TastingPackPricingService,
    private readonly stockService: TastingPackStockService,
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: {
      findLatestPublicById(id: string): Promise<any>;
    },
    @Inject('IOrderPricingSnapshotRepository')
    private readonly pricingSnapshotRepository: IOrderPricingSnapshotRepository,
  ) {}

  // ==========================================================
  // 后台
  // ==========================================================

  async listForAdmin(): Promise<TastingPackAdminView[]> {
    const packs = await this.prisma.tastingPack.findMany({
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return packs.map((pack) => this.toAdminView(pack));
  }

  async getForAdmin(id: string): Promise<TastingPackAdminView> {
    const pack = await this.prisma.tastingPack.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) {
      throw new NotFoundException(`试吃装不存在: ${id}`);
    }
    return this.toAdminView(pack);
  }

  async create(
    dto: UpsertTastingPackDto,
    operatorId?: string | null,
  ): Promise<TastingPackAdminView> {
    this.assertUpsertDto(dto);
    const itemSnapshots = await this.buildItemSnapshots(dto.items);
    const config = await this.configService.getConfig();

    const pack = await this.prisma.tastingPack.create({
      data: {
        code: await this.nextCode(),
        name: dto.name.trim(),
        subtitle: dto.subtitle?.trim() || null,
        coverImageUrl: dto.coverImageUrl || null,
        detailImages: (dto.detailImages ?? null) as any,
        status: 'DRAFT',
        bagsPerRecipe: dto.bagsPerRecipe ?? config.defaultBagsPerRecipe,
        packSpecG: dto.packSpecG ?? config.defaultPackSpecG,
        manualPrice: this.toDecimalOrNull(dto.manualPrice),
        maxSetsOverride: dto.maxSetsOverride ?? null,
        sortOrder: dto.sortOrder ?? 0,
        createdById: operatorId ?? null,
        items: {
          create: itemSnapshots.map((item, index) => ({
            recipeId: item.recipeId,
            recipeSnapshot: item.snapshot as any,
            sortOrder: dto.items[index]?.sortOrder ?? index,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    this.logger.log(`[TastingPack] 新建试吃装 ${pack.code} ${pack.name}`);
    return this.toAdminView(pack);
  }

  async update(
    id: string,
    dto: UpsertTastingPackDto,
  ): Promise<TastingPackAdminView> {
    this.assertUpsertDto(dto);
    const existing = await this.prisma.tastingPack.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`试吃装不存在: ${id}`);
    }

    const itemSnapshots = await this.buildItemSnapshots(dto.items);

    const pack = await this.prisma.$transaction(async (tx) => {
      // 菜品是「整体替换」语义：传什么就是什么，避免残留上一版的道数
      await tx.tastingPackItem.deleteMany({ where: { tastingPackId: id } });
      await tx.tastingPackItem.createMany({
        data: itemSnapshots.map((item, index) => ({
          tastingPackId: id,
          recipeId: item.recipeId,
          recipeSnapshot: item.snapshot as any,
          sortOrder: dto.items[index]?.sortOrder ?? index,
        })),
      });

      return tx.tastingPack.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          subtitle: dto.subtitle?.trim() || null,
          coverImageUrl: dto.coverImageUrl || null,
          detailImages: (dto.detailImages ?? null) as any,
          bagsPerRecipe: dto.bagsPerRecipe ?? existing.bagsPerRecipe,
          packSpecG: dto.packSpecG ?? existing.packSpecG,
          manualPrice: this.toDecimalOrNull(dto.manualPrice),
          maxSetsOverride: dto.maxSetsOverride ?? null,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return this.toAdminView(pack);
  }

  async publish(id: string): Promise<TastingPackAdminView> {
    const pack = await this.prisma.tastingPack.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!pack) {
      throw new NotFoundException(`试吃装不存在: ${id}`);
    }
    if (pack.items.length === 0) {
      throw new BadRequestException('没有配菜的试吃装不能上架');
    }

    const updated = await this.prisma.tastingPack.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    this.logger.log(`[TastingPack] 上架 ${updated.code}`);
    return this.toAdminView(updated);
  }

  async unpublish(id: string): Promise<TastingPackAdminView> {
    const updated = await this.prisma.tastingPack.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.toAdminView(updated);
  }

  /**
   * 删除商品。
   *
   * 有库存或有过流水就不允许删 —— 历史台账不能凭空消失，
   * 这种情况应该下架而不是删除。
   */
  async remove(id: string): Promise<void> {
    const batchCount = await this.prisma.tastingPackStockBatch.count({
      where: { tastingPackId: id },
    });
    if (batchCount > 0) {
      throw new ConflictException(
        '该试吃装已有库存批次记录，不能删除。请改为「下架」',
      );
    }
    await this.prisma.tastingPack.delete({ where: { id } });
    this.logger.warn(`[TastingPack] 删除试吃装 ${id}`);
  }

  /** 后台试算：这套菜按当前库存成本卖多少钱 */
  async quoteForPack(id: string, sets = 1): Promise<TastingPackQuote> {
    const pack = await this.loadPackWithItems(id);
    return this.buildQuote(pack, sets);
  }

  // ==========================================================
  // 顾客端
  // ==========================================================

  /** 上架商品列表（含实时价格与可售套数） */
  async listShelf(): Promise<TastingPackShelfView[]> {
    const packs = await this.prisma.tastingPack.findMany({
      where: { status: 'ACTIVE' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const result: TastingPackShelfView[] = [];
    for (const pack of packs) {
      result.push(await this.toShelfView(pack));
    }
    return result;
  }

  /** 单个上架商品（按 id 或面客 code 都能查） */
  async getShelfItem(idOrCode: string): Promise<TastingPackShelfView> {
    const pack = await this.prisma.tastingPack.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) {
      throw new NotFoundException('试吃装不存在或已下架');
    }
    return this.toShelfView(pack);
  }

  /**
   * 生成购买报价（下单前的最后一步）
   *
   * 做三件事：
   *   1. 再确认一次商品可买（在架 / 没超限购 / 有货）
   *   2. 按当前库存批次成本实时算价
   *   3. 把价格写进**价格快照**并把快照 ID 交给前端 ——
   *      下单时只认这个快照，前端改不了价（沿用鲜食的防篡改机制）
   */
  async createPurchaseQuote(params: {
    idOrCode: string;
    sets: number;
    addressId?: string | null;
    customerId: string;
  }): Promise<{
    snapshotId: string;
    sets: number;
    unitPrice: number;
    unitListPrice: number;
    amountProduct: number;
    amountShipping: number;
    amountTotal: number;
    availableSets: number;
    maxSetsPerOrder: number;
  }> {
    const shelfItem = await this.getShelfItem(params.idOrCode);

    const { pack, availableSets, maxSetsPerOrder } =
      await this.assertPurchasable({
        tastingPackId: shelfItem.id,
        sets: params.sets,
      });

    const sets = Number(params.sets);
    const quote = await this.buildQuote(pack, sets);

    const snapshot = await this.pricingSnapshotRepository.create({
      customerId: params.customerId,
      requestParams: {
        kind: TASTING_PACK_SNAPSHOT_KIND,
        tastingPackId: pack.id,
        sets,
        addressId: params.addressId ?? null,
      },
      pricingResult: {
        amountProduct: quote.amountProduct,
        amountShipping: quote.amountShipping,
        amountTotal: quote.amountTotal,
        unitPrice: quote.unitPrice,
        unitListPrice: quote.unitListPrice,
        unitCost: quote.unitCost,
        costBasis: quote.costBasis,
        costBreakdown: quote.costBreakdown,
        packSnapshot: buildTastingPackOrderSnapshot({
          id: pack.id,
          code: pack.code,
          name: pack.name,
          bagsPerRecipe: pack.bagsPerRecipe,
          packSpecG: pack.packSpecG,
          items: pack.items as any,
        }),
      },
      // 与鲜食一致：15 分钟有效
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    return {
      snapshotId: snapshot.id,
      sets,
      unitPrice: quote.unitPrice,
      unitListPrice: quote.unitListPrice,
      amountProduct: quote.amountProduct,
      amountShipping: quote.amountShipping,
      amountTotal: quote.amountTotal,
      availableSets,
      maxSetsPerOrder,
      // 刻意不回传 unitCost / costBasis：
      // 顾客不需要知道我们的成本，也不需要知道我们按哪个口径定价。
      // 后台要看这些数字，走 /admin/tasting-pack/packs。
    };
  }


  /** 下单前的库存与限购校验（第 3 批下单链路调用） */
  async assertPurchasable(params: {
    tastingPackId: string;
    sets: number;
  }): Promise<{ pack: any; availableSets: number; maxSetsPerOrder: number }> {
    const pack = await this.prisma.tastingPack.findUnique({
      where: { id: params.tastingPackId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) {
      throw new NotFoundException(`试吃装不存在: ${params.tastingPackId}`);
    }
    if (pack.status !== 'ACTIVE') {
      throw new BadRequestException('该试吃装已下架');
    }
    if (pack.items.length === 0) {
      throw new BadRequestException('该试吃装没有配菜，无法下单');
    }

    const sets = Number(params.sets);
    if (!Number.isInteger(sets) || sets <= 0) {
      throw new BadRequestException('购买套数必须是大于 0 的整数');
    }

    const config = await this.configService.getConfig();
    const maxSetsPerOrder = pack.maxSetsOverride ?? config.maxSetsPerOrder;
    if (sets > maxSetsPerOrder) {
      throw new BadRequestException(
        `试吃装单次最多购买 ${maxSetsPerOrder} 套`,
      );
    }

    const availableSets = await this.stockService.getAvailableSets(pack.id);
    if (availableSets < sets) {
      throw new ConflictException(
        availableSets === 0
          ? '试吃装已售罄，请稍后再来'
          : `试吃装库存不足，当前只剩 ${availableSets} 套`,
      );
    }

    return { pack, availableSets, maxSetsPerOrder };
  }

  /** 把商品转成定价服务的输入规格 */
  buildSpecs(pack: {
    bagsPerRecipe: number;
    packSpecG: number;
    items: Array<{ recipeId: string }>;
  }): Array<{ recipeId: string; packageCount: number; packageSpecG: number }> {
    return pack.items.map((item) => ({
      recipeId: item.recipeId,
      packageCount: pack.bagsPerRecipe,
      packageSpecG: pack.packSpecG,
    }));
  }

  // ==========================================================
  // 内部
  // ==========================================================

  private async loadPackWithItems(id: string) {
    const pack = await this.prisma.tastingPack.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) {
      throw new NotFoundException(`试吃装不存在: ${id}`);
    }
    return pack;
  }

  private async buildQuote(
    pack: {
      id: string;
      bagsPerRecipe: number;
      packSpecG: number;
      manualPrice: unknown;
      items: Array<{ recipeId: string }>;
    },
    sets: number,
  ): Promise<TastingPackQuote> {
    // 按后台选的口径决定成本基数：
    //   LIVE        → 传 null，定价服务会把每道菜按**今天的原料价**重算一遍
    //   STOCK_BATCH → 传库存加权成本，卖的是早先做好的货就按那批的实际成本定价
    // 顺手少查一次库：按今日原料价时根本不需要库存成本
    const config = await this.configService.getConfig();
    const stockUnitCost =
      config.costBasisMode === 'STOCK_BATCH'
        ? await this.stockService.getWeightedUnitCost(pack.id)
        : null;

    return this.pricingService.quote({
      specs: this.buildSpecs(pack),
      sets,
      manualUnitPrice:
        pack.manualPrice === null || pack.manualPrice === undefined
          ? null
          : Number(pack.manualPrice),
      stockUnitCost,
    });
  }

  private async toShelfView(pack: any): Promise<TastingPackShelfView> {
    const [availableSets, quote] = await Promise.all([
      this.stockService.getAvailableSets(pack.id),
      this.buildQuote(pack, 1),
    ]);
    const config = await this.configService.getConfig();

    return {
      ...this.toAdminView(pack),
      availableSets,
      maxSetsPerOrder: pack.maxSetsOverride ?? config.maxSetsPerOrder,
      unitPrice: quote.unitPrice,
      unitListPrice: quote.unitListPrice,
      // 顾客端不暴露我们的成本口径；后台看这些数字走 /admin/tasting-pack/packs
      soldOut: availableSets <= 0,
    };
  }

  private toAdminView(pack: any): TastingPackAdminView {
    const items: TastingPackItemView[] = (pack.items ?? []).map((item: any) => {
      const snapshot = (item.recipeSnapshot ?? {}) as Record<string, any>;
      return {
        id: item.id,
        recipeId: item.recipeId,
        sortOrder: item.sortOrder,
        name: snapshot.name ?? '未知食谱',
        coverImageUrl: snapshot.coverImageUrl ?? null,
        sellingPoint: snapshot.sellingPoint ?? null,
      };
    });

    const totalPacks = items.length * pack.bagsPerRecipe;

    return {
      id: pack.id,
      code: pack.code,
      name: pack.name,
      subtitle: pack.subtitle,
      coverImageUrl: pack.coverImageUrl,
      detailImages: pack.detailImages ?? null,
      status: pack.status,
      bagsPerRecipe: pack.bagsPerRecipe,
      packSpecG: pack.packSpecG,
      manualPrice:
        pack.manualPrice === null || pack.manualPrice === undefined
          ? null
          : Number(pack.manualPrice),
      maxSetsOverride: pack.maxSetsOverride ?? null,
      sortOrder: pack.sortOrder,
      totalNetWeightG: totalPacks * pack.packSpecG,
      totalPacks,
      items,
      createdAt: pack.createdAt.toISOString(),
      updatedAt: pack.updatedAt.toISOString(),
    };
  }

  private assertUpsertDto(dto: UpsertTastingPackDto): void {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('试吃装名称不能为空');
    }
    if (dto.name.trim().length > 100) {
      throw new BadRequestException('试吃装名称不能超过 100 个字');
    }
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('试吃装至少要配一道菜');
    }
    if (dto.items.length > 12) {
      // 上限 12 是防呆：再多就不叫试吃装了，分装与本钱也算不过来
      throw new BadRequestException('试吃装最多配 12 道菜');
    }

    const ids = dto.items.map((item) => item.recipeId);
    if (ids.some((id) => !id)) {
      throw new BadRequestException('配菜缺少食谱编号');
    }
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('同一道菜不能重复配置');
    }

    if (dto.bagsPerRecipe !== undefined) {
      if (
        !Number.isInteger(dto.bagsPerRecipe) ||
        dto.bagsPerRecipe < 1 ||
        dto.bagsPerRecipe > 20
      ) {
        throw new BadRequestException('每道菜袋数必须是 1~20 的整数');
      }
    }
    if (dto.packSpecG !== undefined) {
      if (
        !Number.isInteger(dto.packSpecG) ||
        dto.packSpecG < 10 ||
        dto.packSpecG > 1000
      ) {
        throw new BadRequestException('每袋克重必须是 10~1000 的整数');
      }
    }
    if (dto.manualPrice !== undefined && dto.manualPrice !== null) {
      const price = Number(dto.manualPrice);
      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException('手动定价必须大于 0');
      }
    }
    if (dto.maxSetsOverride !== undefined && dto.maxSetsOverride !== null) {
      if (
        !Number.isInteger(dto.maxSetsOverride) ||
        dto.maxSetsOverride < 1 ||
        dto.maxSetsOverride > 50
      ) {
        throw new BadRequestException('单次限购必须是 1~50 的整数');
      }
    }
  }

  /**
   * 生成菜品展示快照。
   *
   * ⚠️ 只允许**已公开**的食谱，且取**已公开的最新版本**：
   *
   * 1. 私有定制食谱属于某位顾客，组进对外售卖的商品等于把顾客的定制配方卖给别人；
   * 2. `findById` 取的是最新版本，可能是还没发布的草稿修订版 ——
   *    它的菜名还带着"修订"字样、配方也可能没定稿，拿它做展示快照是错的。
   */
  private async buildItemSnapshots(
    items: TastingPackItemInput[],
  ): Promise<Array<{ recipeId: string; snapshot: Record<string, any> }>> {
    const snapshots: Array<{ recipeId: string; snapshot: Record<string, any> }> =
      [];

    for (const item of items) {
      const recipe = await this.recipeRepository.findLatestPublicById(
        item.recipeId,
      );
      if (!recipe) {
        throw new BadRequestException(
          `食谱 ${item.recipeId} 没有已公开的版本，不能组进对外售卖的试吃装`,
        );
      }

      snapshots.push({
        recipeId: item.recipeId,
        snapshot: {
          recipeId: recipe.recipeId ?? recipe.id,
          name: recipe.name,
          version: recipe.version,
          coverImageUrl: recipe.coverImageUrl ?? null,
          sellingPoint: recipe.sellingPoint ?? null,
          capturedAt: new Date().toISOString(),
        },
      });
    }

    return snapshots;
  }

  private toDecimalOrNull(value: number | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    return Number(value).toFixed(2);
  }

  private async nextCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const bytes = randomBytes(6);
      let code = 'TP';
      for (let i = 0; i < 6; i += 1) {
        code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      }

      const exists = await this.prisma.tastingPack.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new ConflictException('生成试吃装编号失败，请重试');
  }
}

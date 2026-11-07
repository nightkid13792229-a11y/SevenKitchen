import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseUnit, IngredientType } from '../../domain/ingredient/enums';
import { PrismaService } from '../../infrastructure/prisma.service';
import { composePackSpec } from '../purchasing/procurement-sku-net-content';
import {
  channelMatchKey,
  resolveChannelCode,
  toChannelOptions,
  type ChannelOption,
} from '../purchasing/channel-catalog';
import { PURCHASE_CHANNEL_SET } from '../platform-options/option-sets.registry';
import { perBaseUnitCostOrInfinity } from '../../domain/ingredient/unit-price';
import { IngredientCostHistoryService } from './ingredient-cost-history.service';

type DecimalLike = {
  toNumber: () => number;
};

type ProcurementSkuRecord = {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: DecimalLike | number | null;
  referencePurchasePrice: DecimalLike | number | null;
  referencePricePerPurchaseUnit: DecimalLike | number | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  createdAt: Date;
};

type ProcurementSkuPriceHistorySourceCode =
  | 'MANUAL'
  | 'REIMBURSEMENT'
  | 'ROLLBACK';

type ProcurementSkuPriceHistoryRecord = {
  id: string;
  procurementSkuId: string;
  ingredientId: string;
  oldPrice: DecimalLike | number | null;
  newPrice: DecimalLike | number;
  source: ProcurementSkuPriceHistorySourceCode;
  reimbursementId: string | null;
  purchaseRecordId: string | null;
  rollbackFromHistoryId: string | null;
  operatorId: string | null;
  note: string | null;
  createdAt: Date;
};

export interface ProcurementSkuSummary {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: number | null;
  referencePurchasePrice: number | null;
  referencePricePerPurchaseUnit: number | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  /** 谁加的（后台原料页给员工新增的卡片标一行小字用） */
  createdById?: string | null;
  createdSource?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface ProcurementSkuPriceHistoryView {
  id: string;
  procurementSkuId: string;
  ingredientId: string;
  oldPrice: number | null;
  newPrice: number;
  source: ProcurementSkuPriceHistorySourceCode;
  reimbursementId: string | null;
  purchaseRecordId: string | null;
  rollbackFromHistoryId: string | null;
  operatorId: string | null;
  note: string | null;
  createdAt: string;
}

/** 后台「员工新增的采购商品」清单的一行 */
export interface StaffCreatedProcurementSkuView {
  id: string;
  ingredientId: string;
  ingredientName: string | null;
  baseUnit: string | null;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: number | null;
  isActive: boolean;
  createdById: string | null;
  createdByName: string | null;
  createdSource: string | null;
  createdAt: string;
  sourceScreenshotUrl: string | null;
}

export interface CreateProcurementSkuDto {
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPurchasePrice?: number | null;
  referencePurchasePrice?: number | null;
  referencePricePerPurchaseUnit?: number | null;
  notes?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  /** 期初库存：按采购单位填写；0/不填表示没有库存 */
  openingStock?: number | null;
}

export interface UpdateProcurementSkuDto extends Partial<CreateProcurementSkuDto> {}

export interface ApplyProcurementSkuPriceOptions {
  source: ProcurementSkuPriceHistorySourceCode;
  reimbursementId?: string | null;
  purchaseRecordId?: string | null;
  rollbackFromHistoryId?: string | null;
  operatorId?: string | null;
  note?: string | null;
}

const normalizeOptionalText = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value.trim().length === 0 ? null : value;
};

const PROCUREMENT_UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  克: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  公斤: 'kg',
  千克: 'kg',
  ml: 'ml',
  毫升: 'ml',
  l: 'L',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  升: 'L',
};

/** 净含量没给单位时，按原料基准单位兜底的写法（拼 productModel 用） */
const DEFAULT_NET_CONTENT_UNIT_TEXT: Record<BaseUnit, string> = {
  [BaseUnit.G]: 'g',
  [BaseUnit.ML]: 'ml',
  [BaseUnit.PCS]: '个',
};

export const ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT: Record<BaseUnit, string[]> = {
  [BaseUnit.G]: [
    'g',
    'kg',
    '斤',
    '两',
    '吨',
    '个',
    '只',
    '条',
    '块',
    '片',
    '颗',
    '粒',
    '包',
    '袋',
    '盒',
    '箱',
    '瓶',
    '桶',
    '罐',
    '份',
  ],
  [BaseUnit.ML]: ['ml', 'L', '瓶', '桶', '罐', '盒', '箱', '袋', '包'],
  [BaseUnit.PCS]: [
    '个',
    '只',
    '片',
    '粒',
    '颗',
    '条',
    '块',
    '包',
    '袋',
    '盒',
    '箱',
    '瓶',
    '罐',
    '卷',
  ],
};

export const normalizeOptionalPurchaseUnit = (
  value: string | null | undefined,
  baseUnit: BaseUnit | string,
): string | null | undefined => {
  const normalizedText = normalizeOptionalText(value);
  if (normalizedText === undefined || normalizedText === null) {
    return normalizedText;
  }

  const canonical =
    PROCUREMENT_UNIT_ALIASES[normalizedText.toLowerCase()] ?? normalizedText;
  const allowedUnits =
    ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT[baseUnit as BaseUnit] ?? [];
  if (allowedUnits.includes(canonical)) {
    return canonical;
  }

  throw new BadRequestException(
    `采购单位必须从允许选项中选择：${allowedUnits.join('、')}`,
  );
};

const toNullableNumber = (
  value: DecimalLike | number | null | undefined,
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' ? value : value.toNumber();
};

const toSummary = (sku: ProcurementSkuRecord): ProcurementSkuSummary => ({
  id: sku.id,
  ingredientId: sku.ingredientId,
  name: sku.name,
  brand: sku.brand,
  productModel: sku.productModel,
  purchaseChannel: sku.purchaseChannel,
  purchaseUnit: sku.purchaseUnit ?? null,
  purchaseToBaseRatio: sku.purchaseToBaseRatio ?? null,
  currentPurchasePrice: toNullableNumber(sku.currentPurchasePrice),
  referencePurchasePrice: toNullableNumber(sku.referencePurchasePrice),
  referencePricePerPurchaseUnit: toNullableNumber(
    sku.referencePurchasePrice ?? sku.referencePricePerPurchaseUnit,
  ),
  notes: sku.notes,
  isDefault: sku.isDefault ?? false,
  isActive: sku.isActive,
  sortOrder: sku.sortOrder,
  safetyStock: sku.safetyStock ?? null,
  reorderPoint: sku.reorderPoint ?? null,
  targetStock: sku.targetStock ?? null,
  createdById: (sku as any).createdById ?? null,
  createdSource: (sku as any).createdSource ?? null,
  createdByName: (sku as any).createdBy?.nickname ?? null,
  createdAt: sku.createdAt ? sku.createdAt.toISOString() : null,
});

const toPriceHistoryView = (
  row: ProcurementSkuPriceHistoryRecord,
): ProcurementSkuPriceHistoryView => ({
  id: row.id,
  procurementSkuId: row.procurementSkuId,
  ingredientId: row.ingredientId,
  oldPrice: toNullableNumber(row.oldPrice),
  newPrice: toNullableNumber(row.newPrice) ?? 0,
  source: row.source,
  reimbursementId: row.reimbursementId,
  purchaseRecordId: row.purchaseRecordId,
  rollbackFromHistoryId: row.rollbackFromHistoryId,
  operatorId: row.operatorId,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

const getSkuPurchasePrice = (
  sku: Pick<
    ProcurementSkuRecord,
    'currentPurchasePrice'
  >,
): number | null =>
  toNullableNumber(sku.currentPurchasePrice);

const getSkuUnitCost = (
  sku: Pick<
    ProcurementSkuRecord,
    | 'currentPurchasePrice'
    | 'purchaseToBaseRatio'
  >,
): number => {
  const price = getSkuPurchasePrice(sku);
  if (
    price === null ||
    price <= 0 ||
    sku.purchaseToBaseRatio === null ||
    sku.purchaseToBaseRatio === undefined ||
    sku.purchaseToBaseRatio <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return perBaseUnitCostOrInfinity(price, sku.purchaseToBaseRatio);
};

const sortProcurementSkus = <T extends ProcurementSkuRecord>(skus: T[]): T[] =>
  [...skus].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    const unitCostDiff = getSkuUnitCost(left) - getSkuUnitCost(right);
    if (unitCostDiff !== 0) {
      return unitCostDiff;
    }

    const nameCompare = left.name.localeCompare(right.name, 'zh-Hans-CN');
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return (
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id)
    );
  });

@Injectable()
export class ProcurementSkuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costHistory: IngredientCostHistoryService,
  ) {}

  /**
   * 建档初始化成本（2026-11-07 成本口径归位）。
   *
   * 规则：**只补空，不覆盖**。成本已是 0 的原料，用第一条带价的采购商品
   * 算出「元/基准单位」写进去；已经有成本的一律不动。
   *
   * 为什么用 `updateMany + where 成本=0` 而不是先读后写：
   * 两个会话同时给同一原料建商品时，先读后写会把成本写两遍（第二遍覆盖第一遍），
   * 而这里由数据库保证只有一个能命中。
   *
   * 为什么换算固定写成 1：食材的成本口径就是「每基准单位」，
   * 采购口径（一件多少克）留在采购商品上。两处都存一份必然分叉。
   */
  private async initializeIngredientCostFromSku(
    tx: PrismaService | any,
    params: {
      ingredientId: string;
      skuId: string;
      pricePerPurchaseUnit: number | null;
      purchaseToBaseRatio: number | null;
    },
  ): Promise<void> {
    const price = Number(params.pricePerPurchaseUnit);
    const ratio = Number(params.purchaseToBaseRatio);

    if (!Number.isFinite(price) || price <= 0) {
      return;
    }
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return;
    }

    const cost = Math.round((price / ratio) * 1e6) / 1e6;

    const result = await tx.ingredient.updateMany({
      where: { id: params.ingredientId, currentPricePerPurchaseUnit: 0 },
      data: { currentPricePerPurchaseUnit: cost, purchaseToBaseRatio: 1 },
    });

    if (!result || result.count === 0) {
      return;
    }

    await this.costHistory.record({
      ingredientId: params.ingredientId,
      oldCost: 0,
      newCost: cost,
      source: 'INIT_FROM_SKU',
      procurementSkuId: params.skuId,
      note: '建档时用第一条采购商品的价初始化',
      tx: tx as any,
    });
  }

  /**
   * 渠道字典读一次，判重和归一都用它（2026-11-07）。
   * 一次建档里会问两遍「这条文字是哪个渠道」，没必要各查一次库。
   */
  private async loadChannelCatalog(): Promise<{
    options: ChannelOption[];
    known: Set<string>;
  }> {
    const items = await this.prisma.platformOptionItem.findMany({
      where: { setId: PURCHASE_CHANNEL_SET },
      select: { code: true, label: true, enabled: true, extra: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return {
      options: toChannelOptions(items.filter((item) => item.enabled)),
      known: new Set(items.map((item: { code: string }) => item.code)),
    };
  }

  /**
   * 「在哪买的」只认字典（2026-11-05 第二步）：
   * 能归一到标准项就归一，归不上就拒绝 —— 商品档案是渠道的身份，
   * 这里放过一个错字，以后每一条采购记录都会继承它。
   */
  private async resolvePurchaseChannel(
    value: string | null | undefined,
    catalog?: { options: ChannelOption[]; known: Set<string> },
  ): Promise<string | null | undefined> {
    if (value === undefined) return undefined;
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return null;
    const { options, known } = catalog ?? (await this.loadChannelCatalog());
    const resolved = resolveChannelCode(text, options, known);
    if (!resolved) {
      throw new BadRequestException(
        `「${text}」不在采购渠道清单里，请从后台维护的渠道中选择`,
      );
    }
    return resolved;
  }

  private roundPrice(value: number): number {
    return Number(value.toFixed(2));
  }

  private assertValidPrice(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('采购 SKU 当前采购价不能为负数');
    }
  }

  private areSamePrice(
    left: DecimalLike | number | null | undefined,
    right: number | null | undefined,
  ): boolean {
    if (right === undefined) {
      return true;
    }

    const leftPrice = toNullableNumber(left);
    if (leftPrice === null || right === null) {
      return leftPrice === right;
    }

    return this.roundPrice(leftPrice) === this.roundPrice(right);
  }

  private buildPriceHistoryData(params: {
    procurementSkuId: string;
    ingredientId: string;
    oldPrice: DecimalLike | number | null | undefined;
    newPrice: number;
    options: ApplyProcurementSkuPriceOptions;
  }) {
    return {
      procurementSkuId: params.procurementSkuId,
      ingredientId: params.ingredientId,
      oldPrice: toNullableNumber(params.oldPrice),
      newPrice: this.roundPrice(params.newPrice),
      source: params.options.source,
      reimbursementId: params.options.reimbursementId ?? null,
      purchaseRecordId: params.options.purchaseRecordId ?? null,
      rollbackFromHistoryId: params.options.rollbackFromHistoryId ?? null,
      operatorId: params.options.operatorId ?? null,
      note: normalizeOptionalText(params.options.note) ?? null,
    };
  }

  private assertFoodIngredientCanOwnProcurementSkus(
    ingredient: {
      id: string;
      type: string;
    } | null,
  ): asserts ingredient is { id: string; type: string } {
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    if (ingredient.type !== IngredientType.FOOD) {
      throw new BadRequestException(
        'Only FOOD ingredients can own procurement SKUs',
      );
    }
  }

  private normalizeDistinctValues(
    values: Array<string | null | undefined>,
  ): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }

  async batchFindActive(
    ingredientIds: string[],
  ): Promise<Record<string, ProcurementSkuSummary[]>> {
    if (ingredientIds.length === 0) {
      return {};
    }

    const skus = await this.prisma.procurementSku.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        isActive: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const grouped: Record<string, ProcurementSkuSummary[]> = {};
    for (const sku of sortProcurementSkus(skus as ProcurementSkuRecord[])) {
      if (!grouped[sku.ingredientId]) {
        grouped[sku.ingredientId] = [];
      }

      grouped[sku.ingredientId].push(toSummary(sku));
    }

    return grouped;
  }

  async create(
    ingredientId: string,
    dto: CreateProcurementSkuDto,
  ): Promise<ProcurementSkuSummary> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: {
        id: true,
        type: true,
        baseUnit: true,
      },
    });
    this.assertFoodIngredientCanOwnProcurementSkus(ingredient);

    const currentPurchasePrice =
      dto.currentPurchasePrice === undefined || dto.currentPurchasePrice === null
        ? null
        : this.roundPrice(dto.currentPurchasePrice);

    if (currentPurchasePrice !== null) {
      this.assertValidPrice(currentPurchasePrice);
    }

    const openingStock =
      dto.openingStock === undefined || dto.openingStock === null
        ? 0
        : dto.openingStock;
    if (!Number.isFinite(openingStock) || openingStock < 0) {
      throw new BadRequestException('期初库存必须是不小于 0 的数字');
    }
    if (
      openingStock > 0 &&
      (dto.purchaseToBaseRatio === undefined ||
        dto.purchaseToBaseRatio === null ||
        !Number.isFinite(dto.purchaseToBaseRatio) ||
        dto.purchaseToBaseRatio <= 0)
    ) {
      throw new BadRequestException('填了期初库存时，换算倍数必须大于 0');
    }

    const data = {
      ingredientId,
      name: dto.name,
      brand: normalizeOptionalText(dto.brand) ?? null,
      productModel: normalizeOptionalText(dto.productModel) ?? null,
      purchaseChannel:
        (await this.resolvePurchaseChannel(dto.purchaseChannel)) ?? null,
      purchaseUnit:
        normalizeOptionalPurchaseUnit(dto.purchaseUnit, ingredient!.baseUnit) ??
        null,
      purchaseToBaseRatio: dto.purchaseToBaseRatio ?? null,
      currentPurchasePrice,
      referencePurchasePrice:
        dto.referencePurchasePrice ??
        dto.referencePricePerPurchaseUnit ??
        null,
      referencePricePerPurchaseUnit:
        dto.referencePricePerPurchaseUnit ??
        dto.referencePurchasePrice ??
        null,
      notes: normalizeOptionalText(dto.notes) ?? null,
      isDefault: false,
      isActive: dto.isActive ?? true,
      sortOrder: 0,
      safetyStock: dto.safetyStock ?? null,
      reorderPoint: dto.reorderPoint ?? null,
      targetStock: dto.targetStock ?? null,
    };

    const runCreate = async (tx: PrismaService) => {
      const created = await tx.procurementSku.create({ data });

      if (currentPurchasePrice !== null) {
        await tx.procurementSkuPriceHistory.create({
          data: this.buildPriceHistoryData({
            procurementSkuId: created.id,
            ingredientId,
            oldPrice: null,
            newPrice: currentPurchasePrice,
            options: {
              source: 'MANUAL',
              note: '创建 SKU 时设置初始采购价',
            },
          }),
        });
      }

      // 建档初始化：只在原料还没有成本时生效（只补空，不覆盖）
      await this.initializeIngredientCostFromSku(tx, {
        ingredientId,
        skuId: created.id,
        pricePerPurchaseUnit: currentPurchasePrice,
        purchaseToBaseRatio: data.purchaseToBaseRatio,
      });

      if (openingStock > 0) {
        const ratio = dto.purchaseToBaseRatio as number;
        const deltaG = openingStock * ratio;
        const balance = await tx.inventoryLedgerEntry.aggregate({
          where: { ingredientId },
          _sum: { deltaG: true },
        });
        const quantityBeforeG = Number(balance._sum.deltaG ?? 0);
        const adjustmentId = randomUUID();
        await tx.inventoryAdjustment.create({
          data: {
            id: adjustmentId,
            ingredientId,
            procurementSkuId: created.id,
            adjustmentMode: 'DELTA' as any,
            quantityBeforeG,
            quantityAfterG: quantityBeforeG + deltaG,
            deltaG,
            reason: '期初库存',
            note: '新增采购 SKU 时录入',
          },
        });
        await tx.inventoryLedgerEntry.create({
          data: {
            id: randomUUID(),
            ingredientId,
            procurementSkuId: created.id,
            deltaG,
            sourceType: 'MANUAL_ADJUSTMENT' as any,
            sourceId: adjustmentId,
          },
        });
      }

      return created;
    };

    const created = await this.prisma.$transaction(runCreate as any);

    return toSummary(created as unknown as ProcurementSkuRecord);
  }

  /**
   * 小程序「新增采购商品」页要用的选项：这道原料的基准单位 + 这个基准单位下允许的采购单位。
   *
   * 为什么不把白名单抄一份到前端：前台抄一份就必然和后台漂移，
   * 员工就会看到"选了却被服务端拒掉"的死路（2026-11-01 定的单一事实来源）。
   */
  async getFormOptions(ingredientId: string): Promise<{
    baseUnit: BaseUnit;
    purchaseUnits: string[];
  }> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true, type: true, baseUnit: true },
    });
    this.assertFoodIngredientCanOwnProcurementSkus(ingredient);

    const baseUnit = ingredient!.baseUnit as BaseUnit;

    return {
      baseUnit,
      purchaseUnits: [...ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT[baseUnit]],
    };
  }

  /**
   * 员工在小程序里新增采购商品（2026-11-01）。
   *
   * 与后台 `create()` 的区别，都是老板定过的规矩：
   *   1. 换算 = 件数 × 每件净含量 —— **服务端算**，不信前端乘好的数（只填单件规格会让账目差 N 倍）；
   *   2. 同一原料下同名商品不重复建，直接返回既有那条，让员工选它；
   *   3. 记录是谁加的、从哪来（`STAFF_APP`）、当时传的截图；
   *   4. 从识别结果页过来的（带 `sourceImportId`），渠道必须是那笔订单的渠道 ——
   *      否则等于绕开「同名同渠道才算重复」的判重，把商品建到别家去（2026-11-07）。
   */
  async createFromStaff(input: {
    ingredientId: string;
    createdById: string;
    name: string;
    purchaseChannel: string;
    purchaseUnit: string;
    packCount: number;
    netContentPerPack: number;
    netContentUnitText?: string | null;
    currentPurchasePrice?: number | null;
    brand?: string | null;
    productModel?: string | null;
    sourceScreenshotUrl?: string | null;
    /** 从识别结果页新建时，带上那条识别记录，用来校验渠道 */
    sourceImportId?: string | null;
  }): Promise<{
    status: 'created' | 'duplicate';
    sku: ProcurementSkuSummary;
  }> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
      select: { id: true, type: true, baseUnit: true },
    });
    this.assertFoodIngredientCanOwnProcurementSkus(ingredient);

    const baseUnit = ingredient!.baseUnit as BaseUnit;
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('商品名称不能为空');
    }

    if (!Number.isInteger(input.packCount) || input.packCount <= 0) {
      throw new BadRequestException('一箱/一袋件数必须是正整数');
    }

    if (
      !Number.isFinite(input.netContentPerPack) ||
      input.netContentPerPack <= 0
    ) {
      throw new BadRequestException('净含量必须大于 0');
    }

    const purchaseUnit = normalizeOptionalPurchaseUnit(
      input.purchaseUnit,
      baseUnit,
    );
    if (!purchaseUnit) {
      throw new BadRequestException('采购单位不能为空');
    }

    // 判重按「同一渠道」算（2026-11-07 老板定）：同名商品在不同渠道是两件货，
    // 比如沃尔玛和山姆各有一条「冷鲜 鲜切黄牛后腿肉」。渠道先归一到字典码，
    // 老数据里的别名写法（「山姆」）也要认成同一条，否则会悄悄建出重复。
    const channelCatalog = await this.loadChannelCatalog();
    const purchaseChannel = await this.resolvePurchaseChannel(
      input.purchaseChannel,
      channelCatalog,
    );
    const channelKey = channelMatchKey(
      purchaseChannel,
      channelCatalog.options,
    );

    // 从识别结果页新建：商品就是给那笔订单买的，渠道不能换。
    // 这一道在服务端做，前端把渠道锁了也挡不住旧版本 / 改参数（2026-11-07）。
    if (input.sourceImportId) {
      const orderImport = await this.prisma.purchaseOrderImport.findUnique({
        where: { id: input.sourceImportId },
        select: { channel: true },
      });
      if (!orderImport) {
        throw new BadRequestException(
          '对应的订单识别记录不存在，请返回重试',
        );
      }
      const orderChannelKey = channelMatchKey(
        orderImport.channel,
        channelCatalog.options,
      );
      if (!orderChannelKey) {
        throw new BadRequestException(
          '这笔订单还没确认渠道，请先回识别结果页选好渠道',
        );
      }
      if (orderChannelKey !== channelKey) {
        throw new BadRequestException(
          `这个商品只能建在这笔订单的渠道（${orderImport.channel}）下，要换渠道请先改订单渠道`,
        );
      }
    }

    const sameName = await this.prisma.procurementSku.findMany({
      where: {
        ingredientId: input.ingredientId,
        isActive: true,
        name: { equals: name, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'asc' },
    });
    const existing =
      sameName.find(
        (row) =>
          channelMatchKey(
            (row as ProcurementSkuRecord).purchaseChannel,
            channelCatalog.options,
          ) === channelKey,
      ) ?? null;

    if (existing) {
      return {
        status: 'duplicate',
        sku: toSummary(existing as ProcurementSkuRecord),
      };
    }

    const currentPurchasePrice =
      input.currentPurchasePrice === undefined ||
      input.currentPurchasePrice === null
        ? null
        : this.roundPrice(input.currentPurchasePrice);

    if (currentPurchasePrice !== null) {
      this.assertValidPrice(currentPurchasePrice);
    }

    const purchaseToBaseRatio = input.packCount * input.netContentPerPack;
    const productModel =
      normalizeOptionalText(input.productModel) ??
      composePackSpec({
        packCount: input.packCount,
        value: input.netContentPerPack,
        unit:
          normalizeOptionalText(input.netContentUnitText) ??
          DEFAULT_NET_CONTENT_UNIT_TEXT[baseUnit] ??
          String(baseUnit).toLowerCase(),
      });

    const data = {
      ingredientId: input.ingredientId,
      name,
      brand: normalizeOptionalText(input.brand) ?? null,
      productModel,
      purchaseChannel: purchaseChannel ?? null,
      purchaseUnit,
      purchaseToBaseRatio,
      currentPurchasePrice,
      referencePurchasePrice: null,
      referencePricePerPurchaseUnit: null,
      notes: null,
      isDefault: false,
      isActive: true,
      sortOrder: 0,
      safetyStock: null,
      reorderPoint: null,
      targetStock: null,
      createdById: input.createdById,
      createdSource: 'STAFF_APP',
      sourceScreenshotUrl: normalizeOptionalText(input.sourceScreenshotUrl) ?? null,
    };

    const runCreate = async (tx: PrismaService) => {
      const created = await tx.procurementSku.create({ data });

      if (currentPurchasePrice !== null) {
        await tx.procurementSkuPriceHistory.create({
          data: this.buildPriceHistoryData({
            procurementSkuId: created.id,
            ingredientId: input.ingredientId,
            oldPrice: null,
            newPrice: currentPurchasePrice,
            options: {
              source: 'MANUAL',
              operatorId: input.createdById,
              note: '员工在小程序新增采购商品时填的单价',
            },
          }),
        });
      }

      // 建档初始化：只在原料还没有成本时生效（只补空，不覆盖）
      await this.initializeIngredientCostFromSku(tx, {
        ingredientId: input.ingredientId,
        skuId: created.id,
        pricePerPurchaseUnit: currentPurchasePrice,
        purchaseToBaseRatio,
      });

      return created;
    };

    const created =
      currentPurchasePrice === null
        ? await runCreate(this.prisma)
        : await this.prisma.$transaction(runCreate as any);

    return {
      status: 'created',
      sku: toSummary(created as ProcurementSkuRecord),
    };
  }

  async findByIngredientId(
    ingredientId: string,
  ): Promise<ProcurementSkuSummary[]> {
    const skus = await this.prisma.procurementSku.findMany({
      where: { ingredientId },
      include: { createdBy: { select: { nickname: true } } },
      orderBy: [{ createdAt: 'asc' }],
    });

    return sortProcurementSkus(skus as ProcurementSkuRecord[]).map(toSummary);
  }

  async findById(id: string): Promise<ProcurementSkuSummary> {
    const sku = await this.prisma.procurementSku.findUnique({
      where: { id },
    });

    if (!sku) {
      throw new NotFoundException(`Procurement sku not found: ${id}`);
    }

    return toSummary(sku as ProcurementSkuRecord);
  }

  async update(
    id: string,
    dto: UpdateProcurementSkuDto,
    operatorId?: string | null,
  ): Promise<ProcurementSkuSummary> {
    const existing = await this.prisma.procurementSku.findUnique({
      where: { id },
      select: {
        id: true,
        ingredientId: true,
        currentPurchasePrice: true,
        ingredient: {
          select: {
            id: true,
            type: true,
            baseUnit: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Procurement sku not found: ${id}`);
    }
    this.assertFoodIngredientCanOwnProcurementSkus(existing.ingredient);

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    const brand = normalizeOptionalText(dto.brand);
    if (brand !== undefined) {
      data.brand = brand;
    }

    const productModel = normalizeOptionalText(dto.productModel);
    if (productModel !== undefined) {
      data.productModel = productModel;
    }

    const purchaseChannel = await this.resolvePurchaseChannel(
      dto.purchaseChannel,
    );
    if (purchaseChannel !== undefined) {
      data.purchaseChannel = purchaseChannel;
    }


    const purchaseUnit = normalizeOptionalPurchaseUnit(
      dto.purchaseUnit,
      existing.ingredient.baseUnit,
    );
    if (purchaseUnit !== undefined) {
      data.purchaseUnit = purchaseUnit;
    }

    if (dto.purchaseToBaseRatio !== undefined) {
      data.purchaseToBaseRatio = dto.purchaseToBaseRatio;
    }

    const nextCurrentPurchasePrice =
      dto.currentPurchasePrice === undefined
        ? undefined
        : dto.currentPurchasePrice === null
          ? null
          : this.roundPrice(dto.currentPurchasePrice);

    if (nextCurrentPurchasePrice !== undefined) {
      if (nextCurrentPurchasePrice !== null) {
        this.assertValidPrice(nextCurrentPurchasePrice);
      }
      data.currentPurchasePrice = nextCurrentPurchasePrice;
    }

    if (dto.referencePurchasePrice !== undefined) {
      data.referencePurchasePrice = dto.referencePurchasePrice;
      data.referencePricePerPurchaseUnit = dto.referencePurchasePrice;
    }

    if (dto.referencePricePerPurchaseUnit !== undefined) {
      data.referencePricePerPurchaseUnit = dto.referencePricePerPurchaseUnit;
      if (dto.referencePurchasePrice === undefined) {
        data.referencePurchasePrice = dto.referencePricePerPurchaseUnit;
      }
    }

    const notes = normalizeOptionalText(dto.notes);
    if (notes !== undefined) {
      data.notes = notes;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.safetyStock !== undefined) {
      data.safetyStock = dto.safetyStock;
    }

    if (dto.reorderPoint !== undefined) {
      data.reorderPoint = dto.reorderPoint;
    }

    if (dto.targetStock !== undefined) {
      data.targetStock = dto.targetStock;
    }

    const shouldRecordManualPriceHistory =
      nextCurrentPurchasePrice !== undefined &&
      nextCurrentPurchasePrice !== null &&
      !this.areSamePrice(
        existing.currentPurchasePrice,
        nextCurrentPurchasePrice,
      );

    const runUpdate = async (tx: PrismaService) => {
      const updated = await tx.procurementSku.update({
        where: { id },
        data,
      });

      if (shouldRecordManualPriceHistory) {
        await tx.procurementSkuPriceHistory.create({
          data: this.buildPriceHistoryData({
            procurementSkuId: existing.id,
            ingredientId: existing.ingredientId,
            oldPrice: existing.currentPurchasePrice,
            newPrice: nextCurrentPurchasePrice,
            options: {
              source: 'MANUAL',
              operatorId: operatorId ?? null,
              note: '管理员手动修改当前采购价',
            },
          }),
        });
      }

      return updated;
    };

    const updated = shouldRecordManualPriceHistory
      ? await this.prisma.$transaction(runUpdate as any)
      : await runUpdate(this.prisma);

    return toSummary(updated as ProcurementSkuRecord);
  }

  async applyCurrentPurchasePrice(
    id: string,
    currentPurchasePrice: number,
    options: ApplyProcurementSkuPriceOptions,
  ): Promise<ProcurementSkuSummary> {
    const nextPrice = this.roundPrice(currentPurchasePrice);
    this.assertValidPrice(nextPrice);

    const existing = await this.prisma.procurementSku.findUnique({
      where: { id },
      select: {
        id: true,
        ingredientId: true,
        currentPurchasePrice: true,
        ingredient: {
          select: {
            id: true,
            type: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Procurement sku not found: ${id}`);
    }
    this.assertFoodIngredientCanOwnProcurementSkus(existing.ingredient);

    const applyPrice = async (tx: PrismaService) => {
      const row = await tx.procurementSku.update({
        where: { id },
        data: {
          currentPurchasePrice: nextPrice,
        },
      });

      await tx.procurementSkuPriceHistory.create({
        data: this.buildPriceHistoryData({
          procurementSkuId: existing.id,
          ingredientId: existing.ingredientId,
          oldPrice: existing.currentPurchasePrice,
          newPrice: nextPrice,
          options,
        }),
      });

      return row;
    };

    const updated = (await (this.prisma.$transaction as any)(
      applyPrice,
    )) as ProcurementSkuRecord;

    return toSummary(updated);
  }

  async listPriceHistory(
    procurementSkuId: string,
  ): Promise<ProcurementSkuPriceHistoryView[]> {
    const rows = await this.prisma.procurementSkuPriceHistory.findMany({
      where: { procurementSkuId },
      orderBy: { createdAt: 'desc' },
    });

    return (rows as ProcurementSkuPriceHistoryRecord[]).map(toPriceHistoryView);
  }

  async rollbackCurrentPurchasePrice(
    procurementSkuId: string,
    historyId: string,
    operatorId?: string | null,
  ): Promise<ProcurementSkuSummary> {
    const targetHistory = await this.prisma.procurementSkuPriceHistory.findFirst({
      where: {
        id: historyId,
        procurementSkuId,
      },
    });

    if (!targetHistory) {
      throw new NotFoundException(`Procurement sku price history not found: ${historyId}`);
    }

    return this.applyCurrentPurchasePrice(
      procurementSkuId,
      toNullableNumber((targetHistory as ProcurementSkuPriceHistoryRecord).newPrice) ?? 0,
      {
        source: 'ROLLBACK',
        rollbackFromHistoryId: historyId,
        operatorId: operatorId ?? null,
        note: '管理员回退生效采购价',
      },
    );
  }

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.procurementSku.findUnique({
      where: { id },
      select: {
        id: true,
        ingredient: {
          select: {
            id: true,
            type: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Procurement sku not found: ${id}`);
    }
    this.assertFoodIngredientCanOwnProcurementSkus(existing.ingredient);

    await this.prisma.procurementSku.delete({
      where: { id },
    });
  }

  /**
   * 后台「原料管理 › 员工新增的采购商品」清单（2026-11-01）。
   *
   * `createdSource` 固定写死 `STAFF_APP`，不接受前端传 —— 否则前台传个空就把全部
   * 历史 SKU 都算成"员工新增"了。
   */
  async listStaffCreated(query: {
    ingredientId?: string;
    createdById?: string;
    createdFrom?: string;
    createdTo?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: StaffCreatedProcurementSkuView[]; total: number }> {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.trunc(query.pageSize ?? 20)));

    const where: Record<string, unknown> = { createdSource: 'STAFF_APP' };

    if (query.ingredientId) {
      where.ingredientId = query.ingredientId;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    const createdAtRange: Record<string, Date> = {};
    if (query.createdFrom) {
      // 用本地时间构造：界面按本地时间显示，用 UTC 边界会漏掉早上 8 点前的条目
      createdAtRange.gte = new Date(`${query.createdFrom}T00:00:00`);
    }
    if (query.createdTo) {
      createdAtRange.lte = new Date(`${query.createdTo}T23:59:59.999`);
    }
    if (Object.keys(createdAtRange).length > 0) {
      where.createdAt = createdAtRange;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { purchaseChannel: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.procurementSku.findMany({
        where,
        include: {
          ingredient: { select: { name: true, baseUnit: true } },
          createdBy: { select: { nickname: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.procurementSku.count({ where }),
    ]);

    return {
      items: rows.map((row: any) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        ingredientName: row.ingredient?.name ?? null,
        baseUnit: row.ingredient?.baseUnit ?? null,
        name: row.name,
        brand: row.brand ?? null,
        productModel: row.productModel ?? null,
        purchaseChannel: row.purchaseChannel ?? null,
        purchaseUnit: row.purchaseUnit ?? null,
        purchaseToBaseRatio: row.purchaseToBaseRatio ?? null,
        currentPurchasePrice: toNullableNumber(row.currentPurchasePrice),
        isActive: row.isActive,
        createdById: row.createdById ?? null,
        createdByName: row.createdBy?.nickname ?? null,
        createdSource: row.createdSource ?? null,
        createdAt: row.createdAt.toISOString(),
        sourceScreenshotUrl: row.sourceScreenshotUrl ?? null,
      })),
      total,
    };
  }

  async listBrands(): Promise<string[]> {
    const rows = await this.prisma.procurementSku.findMany({
      where: {
        brand: { not: null },
      },
      select: {
        brand: true,
      },
    });

    return this.normalizeDistinctValues(rows.map((row) => row.brand));
  }

  async listPurchaseChannels(): Promise<string[]> {
    const rows = await this.prisma.procurementSku.findMany({
      where: {
        purchaseChannel: { not: null },
      },
      select: {
        purchaseChannel: true,
      },
    });

    return this.normalizeDistinctValues(rows.map((row) => row.purchaseChannel));
  }

  async listActivePurchaseChannels(): Promise<string[]> {
    return this.listPurchaseChannels();
  }
}

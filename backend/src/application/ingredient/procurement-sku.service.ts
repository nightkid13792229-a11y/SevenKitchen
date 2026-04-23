import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseUnit, IngredientType } from '../../domain/ingredient/enums';
import {
  INGREDIENT_SOURCE_TIER_CODES,
  type IngredientSourceTierCode,
} from '../../domain/order/ingredient-source-plan';
import { PrismaService } from '../../infrastructure/prisma.service';

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
  supplierName: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: DecimalLike | number | null;
  referencePurchasePrice: DecimalLike | number | null;
  referencePricePerPurchaseUnit: DecimalLike | number | null;
  sourceTier: IngredientSourceTierCode | null;
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
  supplierName: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: number | null;
  referencePurchasePrice: number | null;
  referencePricePerPurchaseUnit: number | null;
  sourceTier: IngredientSourceTierCode | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
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

export interface CreateProcurementSkuDto {
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  supplierName?: string | null;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPurchasePrice?: number | null;
  referencePurchasePrice?: number | null;
  referencePricePerPurchaseUnit?: number | null;
  sourceTier?: IngredientSourceTierCode | string | null;
  notes?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
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

const ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT: Record<BaseUnit, string[]> = {
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
    '份',
  ],
  [BaseUnit.ML]: ['ml', 'L', '瓶', '桶', '盒', '箱', '袋', '包'],
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
    '卷',
  ],
};

const normalizeOptionalPurchaseUnit = (
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

const normalizeOptionalSourceTier = (
  value: IngredientSourceTierCode | string | null | undefined,
): IngredientSourceTierCode | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    return null;
  }

  if (
    INGREDIENT_SOURCE_TIER_CODES.includes(
      normalized as IngredientSourceTierCode,
    )
  ) {
    return normalized as IngredientSourceTierCode;
  }

  throw new BadRequestException(
    `Unknown procurement SKU source tier: ${value}`,
  );
};

const toSummary = (sku: ProcurementSkuRecord): ProcurementSkuSummary => ({
  id: sku.id,
  ingredientId: sku.ingredientId,
  name: sku.name,
  brand: sku.brand,
  productModel: sku.productModel,
  purchaseChannel: sku.purchaseChannel,
  supplierName: sku.supplierName ?? null,
  purchaseUnit: sku.purchaseUnit ?? null,
  purchaseToBaseRatio: sku.purchaseToBaseRatio ?? null,
  currentPurchasePrice: toNullableNumber(sku.currentPurchasePrice),
  referencePurchasePrice: toNullableNumber(sku.referencePurchasePrice),
  referencePricePerPurchaseUnit: toNullableNumber(
    sku.referencePurchasePrice ?? sku.referencePricePerPurchaseUnit,
  ),
  sourceTier: sku.sourceTier ?? null,
  notes: sku.notes,
  isDefault: sku.isDefault ?? false,
  isActive: sku.isActive,
  sortOrder: sku.sortOrder,
  safetyStock: sku.safetyStock ?? null,
  reorderPoint: sku.reorderPoint ?? null,
  targetStock: sku.targetStock ?? null,
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

const SOURCE_TIER_RANK: Record<IngredientSourceTierCode, number> = {
  ORGANIC: 0,
  MARKET_PREMIUM: 1,
  WHOLESALE: 2,
};

const getSourceTierRank = (
  sourceTier: IngredientSourceTierCode | null | undefined,
): number =>
  sourceTier && SOURCE_TIER_RANK[sourceTier] !== undefined
    ? SOURCE_TIER_RANK[sourceTier]
    : Number.POSITIVE_INFINITY;

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

  return price / sku.purchaseToBaseRatio;
};

const sortProcurementSkus = <T extends ProcurementSkuRecord>(skus: T[]): T[] =>
  [...skus].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    const tierDiff =
      getSourceTierRank(left.sourceTier) - getSourceTierRank(right.sourceTier);
    if (tierDiff !== 0) {
      return tierDiff;
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
  constructor(private readonly prisma: PrismaService) {}

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

    const data = {
      ingredientId,
      name: dto.name,
      brand: normalizeOptionalText(dto.brand) ?? null,
      productModel: normalizeOptionalText(dto.productModel) ?? null,
      purchaseChannel: normalizeOptionalText(dto.purchaseChannel) ?? null,
      supplierName: normalizeOptionalText(dto.supplierName) ?? null,
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
      sourceTier: normalizeOptionalSourceTier(dto.sourceTier) ?? null,
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

      return created;
    };

    const created =
      currentPurchasePrice === null
        ? await runCreate(this.prisma)
        : await this.prisma.$transaction(runCreate as any);

    return toSummary(created as ProcurementSkuRecord);
  }

  async findByIngredientId(
    ingredientId: string,
  ): Promise<ProcurementSkuSummary[]> {
    const skus = await this.prisma.procurementSku.findMany({
      where: { ingredientId },
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

    const purchaseChannel = normalizeOptionalText(dto.purchaseChannel);
    if (purchaseChannel !== undefined) {
      data.purchaseChannel = purchaseChannel;
    }

    const supplierName = normalizeOptionalText(dto.supplierName);
    if (supplierName !== undefined) {
      data.supplierName = supplierName;
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

    const sourceTier = normalizeOptionalSourceTier(dto.sourceTier);
    if (sourceTier !== undefined) {
      data.sourceTier = sourceTier;
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

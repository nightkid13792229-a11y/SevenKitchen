import { Injectable, NotFoundException } from '@nestjs/common';
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
  referencePricePerPurchaseUnit: DecimalLike | number | null;
  displayUnit: string | null;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
};

export interface ProcurementSkuSummary {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  referencePricePerPurchaseUnit: number | null;
  displayUnit: string | null;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CreateProcurementSkuDto {
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  referencePricePerPurchaseUnit?: number | null;
  displayUnit?: string | null;
  notes?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateProcurementSkuDto
  extends Partial<CreateProcurementSkuDto> {}

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

const toNullableNumber = (
  value: DecimalLike | number | null,
): number | null => {
  if (value === null) {
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
  referencePricePerPurchaseUnit: toNullableNumber(
    sku.referencePricePerPurchaseUnit,
  ),
  displayUnit: sku.displayUnit,
  notes: sku.notes,
  isActive: sku.isActive,
  sortOrder: sku.sortOrder,
});

const sortProcurementSkus = <T extends ProcurementSkuRecord>(skus: T[]): T[] =>
  [...skus].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  });

@Injectable()
export class ProcurementSkuService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDistinctValues(values: Array<string | null | undefined>): string[] {
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
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
      select: { id: true },
    });

    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${ingredientId}`);
    }

    const created = await this.prisma.procurementSku.create({
      data: {
        ingredientId,
        name: dto.name,
        brand: normalizeOptionalText(dto.brand) ?? null,
        productModel: normalizeOptionalText(dto.productModel) ?? null,
        purchaseChannel: normalizeOptionalText(dto.purchaseChannel) ?? null,
        referencePricePerPurchaseUnit:
          dto.referencePricePerPurchaseUnit ?? null,
        displayUnit: normalizeOptionalText(dto.displayUnit) ?? null,
        notes: normalizeOptionalText(dto.notes) ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return toSummary(created as ProcurementSkuRecord);
  }

  async findByIngredientId(
    ingredientId: string,
  ): Promise<ProcurementSkuSummary[]> {
    const skus = await this.prisma.procurementSku.findMany({
      where: { ingredientId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
  ): Promise<ProcurementSkuSummary> {
    const existing = await this.prisma.procurementSku.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Procurement sku not found: ${id}`);
    }

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

    if (dto.referencePricePerPurchaseUnit !== undefined) {
      data.referencePricePerPurchaseUnit = dto.referencePricePerPurchaseUnit;
    }

    const displayUnit = normalizeOptionalText(dto.displayUnit);
    if (displayUnit !== undefined) {
      data.displayUnit = displayUnit;
    }

    const notes = normalizeOptionalText(dto.notes);
    if (notes !== undefined) {
      data.notes = notes;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    const updated = await this.prisma.procurementSku.update({
      where: { id },
      data,
    });

    return toSummary(updated as ProcurementSkuRecord);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.procurementSku.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Procurement sku not found: ${id}`);
    }

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

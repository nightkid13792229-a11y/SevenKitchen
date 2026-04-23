/**
 * Prisma Ingredient Repository
 * Production-ready implementation using PostgreSQL database
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Ingredient } from '../../domain/ingredient/ingredient.entity';
import {
  IngredientType,
  BaseUnit,
  IngredientProcurementStrategy,
} from '../../domain/ingredient/enums';
import {
  denormalizeNutritionProfileForPersistence,
  normalizeNutritionProfileForRead,
} from '../../domain/ingredient/nutrition-profile.utils';
import { PrismaService } from '../prisma.service';

const isIngredientIdentityUniqueError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybePrismaError = error as {
    code?: string;
    meta?: {
      target?: unknown;
    };
  };

  if (maybePrismaError.code !== 'P2002') {
    return false;
  }

  const target = maybePrismaError.meta?.target;
  const fields = Array.isArray(target)
    ? target
    : typeof target === 'string'
      ? target.split(',').map((field) => field.trim())
      : [];

  return ['name', 'brand', 'product_model'].every((field) =>
    fields.includes(field),
  );
};

@Injectable()
export class PrismaIngredientRepository implements IngredientRepository {
  private readonly logger = new Logger(PrismaIngredientRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Ingredient | null> {
    const record = await this.prisma.ingredient.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findByIds(ids: string[]): Promise<Ingredient[]> {
    const records = await this.prisma.ingredient.findMany({
      where: { id: { in: ids } },
    });

    // 创建映射表用于快速查找
    const recordMap = new Map(records.map((r) => [r.id, r]));

    // 按输入 ids 的顺序返回结果
    return ids
      .map((id) => recordMap.get(id))
      .filter(
        (record): record is (typeof records)[number] => record !== undefined,
      )
      .map((r) => this.mapToDomain(r));
  }

  async findAll(): Promise<Ingredient[]> {
    const records = await this.prisma.ingredient.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async findByType(type: IngredientType): Promise<Ingredient[]> {
    const records = await this.prisma.ingredient.findMany({
      where: { type: type as any },
      orderBy: { name: 'asc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async save(ingredient: Ingredient, tagIds?: string[]): Promise<Ingredient> {
    const data = {
      name: ingredient.name,
      type: ingredient.type as any,
      procurementStrategy: ingredient.procurementStrategy as any,
      diyEnabled: ingredient.diyEnabled,
      procurementEnabled: ingredient.procurementEnabled,
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      purchaseChannel: ingredient.purchaseChannel,
      notes: ingredient.notes,
      baseUnit: ingredient.baseUnit as any,
      unitDisplayLabel: ingredient.unitDisplayLabel,
      purchaseUnit: ingredient.purchaseUnit,
      purchaseToBaseRatio: ingredient.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: ingredient.currentPricePerPurchaseUnit,
      effectivePricePerPurchaseUnit: ingredient.effectivePricePerPurchaseUnit,
      weightG: ingredient.weightG,
      maxCapacityG: ingredient.maxCapacityG,
      safetyStock: ingredient.safetyStock,
      reorderPoint: ingredient.reorderPoint,
      targetStock: ingredient.targetStock,
      properties: ingredient.properties as any,
      nutritionProfile: denormalizeNutritionProfileForPersistence(
        ingredient.nutritionProfile as any,
      ) as any,
    };

    this.logger.debug(`Saving ingredient ${ingredient.id}: ${ingredient.name}`);

    let saved: Awaited<ReturnType<typeof this.prisma.ingredient.upsert>>;
    try {
      saved = await this.prisma.ingredient.upsert({
        where: { id: ingredient.id },
        update: data,
        create: { id: ingredient.id, ...data },
      });
    } catch (error) {
      if (isIngredientIdentityUniqueError(error)) {
        throw new BadRequestException(
          `已存在名称、品牌、规格相同的标准原料：${ingredient.name}。请合并已有原料，或调整名称/品牌/规格后再保存。`,
        );
      }

      throw error;
    }

    // Save tag associations if provided
    if (tagIds !== undefined) {
      await this.setTags(ingredient.id, tagIds);
    }

    this.logger.debug(`Ingredient ${ingredient.id} saved successfully`);
    return this.mapToDomain(saved);
  }

  async updatePrice(
    id: string,
    pricePerPurchaseUnit: number,
  ): Promise<Ingredient | null> {
    this.logger.debug(
      `Updating price for ingredient ${id} to ${pricePerPurchaseUnit}`,
    );

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: { currentPricePerPurchaseUnit: pricePerPurchaseUnit },
    });

    return this.mapToDomain(updated);
  }

  async updateEffectivePrice(
    id: string,
    effectivePricePerPurchaseUnit: number,
  ): Promise<Ingredient | null> {
    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: { effectivePricePerPurchaseUnit },
    });

    return this.mapToDomain(updated);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting ingredient ${id}`);

    await this.prisma.ingredient.delete({
      where: { id },
    });

    this.logger.debug(`Ingredient ${id} deleted successfully`);
  }

  async update(id: string, data: Partial<any>): Promise<Ingredient> {
    this.logger.debug(`Updating ingredient ${id}`);

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data,
    });

    this.logger.debug(`Ingredient ${id} updated successfully`);
    return this.mapToDomain(updated);
  }

  async setTags(ingredientId: string, tagIds: string[]): Promise<void> {
    this.logger.debug(
      `Setting tags for ingredient ${ingredientId}: ${tagIds.length} tags`,
    );

    // Delete existing associations
    await this.prisma.ingredientTagAssignment.deleteMany({
      where: { ingredientId },
    });

    // Create new associations
    if (tagIds.length > 0) {
      const assignments = tagIds.map((tagId) => ({
        ingredientId,
        tagId,
      }));
      await this.prisma.ingredientTagAssignment.createMany({
        data: assignments,
      });
    }

    this.logger.debug(`Tags set successfully for ingredient ${ingredientId}`);
  }

  async getTags(ingredientId: string): Promise<any[]> {
    const assignments = await this.prisma.ingredientTagAssignment.findMany({
      where: { ingredientId },
      include: {
        tag: true,
      },
    });

    return assignments.map((a) => a.tag);
  }

  /**
   * Map Prisma record to Domain entity
   */
  private mapToDomain(record: any): Ingredient {
    return new Ingredient(
      record.id,
      record.name,
      record.type as IngredientType,
      record.procurementStrategy as IngredientProcurementStrategy,
      record.diyEnabled ?? false,
      record.procurementEnabled ?? false,
      record.brand,
      record.productModel,
      record.purchaseChannel,
      record.notes,
      record.baseUnit as BaseUnit,
      record.unitDisplayLabel,
      record.purchaseUnit,
      record.purchaseToBaseRatio,
      parseFloat(record.currentPricePerPurchaseUnit.toString()),
      record.effectivePricePerPurchaseUnit
        ? parseFloat(record.effectivePricePerPurchaseUnit.toString())
        : null,
      record.weightG,
      record.maxCapacityG,
      record.safetyStock,
      record.reorderPoint,
      record.targetStock,
      record.properties,
      normalizeNutritionProfileForRead(record.nutritionProfile ?? null),
    );
  }
}

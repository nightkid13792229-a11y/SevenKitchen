/**
 * Prisma Ingredient Repository
 * Production-ready implementation using PostgreSQL database
 */

import { Injectable, Logger } from '@nestjs/common';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Ingredient } from '../../domain/ingredient/ingredient.entity';
import { IngredientType, BaseUnit } from '../../domain/ingredient/enums';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaIngredientRepository implements IngredientRepository {
  private readonly logger = new Logger(PrismaIngredientRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Ingredient | null> {
    const record = await this.prisma.ingredient.findUnique({
      where: { id }
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findByIds(ids: string[]): Promise<Ingredient[]> {
    const records = await this.prisma.ingredient.findMany({
      where: { id: { in: ids } }
    });
    return records.map(r => this.mapToDomain(r));
  }

  async findAll(): Promise<Ingredient[]> {
    const records = await this.prisma.ingredient.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    return records.map(r => this.mapToDomain(r));
  }

  async findByType(type: IngredientType): Promise<Ingredient[]> {
    const records = await this.prisma.ingredient.findMany({
      where: { type: type as any },
      orderBy: { name: 'asc' }
    });
    return records.map(r => this.mapToDomain(r));
  }

  async save(ingredient: Ingredient, tagIds?: string[]): Promise<Ingredient> {
    const data = {
      name: ingredient.name,
      type: ingredient.type as any,
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      purchaseChannel: ingredient.purchaseChannel,
      notes: ingredient.notes,
      baseUnit: ingredient.baseUnit as any,
      unitDisplayLabel: ingredient.unitDisplayLabel,
      purchaseUnit: ingredient.purchaseUnit,
      purchaseToBaseRatio: ingredient.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: ingredient.currentPricePerPurchaseUnit,
      weightG: ingredient.weightG,
      maxCapacityG: ingredient.maxCapacityG,
      properties: ingredient.properties as any
    };

    this.logger.debug(`Saving ingredient ${ingredient.id}: ${ingredient.name}`);

    const saved = await this.prisma.ingredient.upsert({
      where: { id: ingredient.id },
      update: data,
      create: { id: ingredient.id, ...data }
    });

    // Save tag associations if provided
    if (tagIds) {
      await this.setTags(ingredient.id, tagIds);
    }

    this.logger.debug(`Ingredient ${ingredient.id} saved successfully`);
    return this.mapToDomain(saved);
  }

  async updatePrice(
    id: string,
    pricePerPurchaseUnit: number,
  ): Promise<Ingredient | null> {
    this.logger.debug(`Updating price for ingredient ${id} to ${pricePerPurchaseUnit}`);

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: { currentPricePerPurchaseUnit: pricePerPurchaseUnit }
    });

    return this.mapToDomain(updated);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting ingredient ${id}`);

    await this.prisma.ingredient.delete({
      where: { id }
    });

    this.logger.debug(`Ingredient ${id} deleted successfully`);
  }

  async update(
    id: string,
    data: Partial<any>,
  ): Promise<Ingredient> {
    this.logger.debug(`Updating ingredient ${id}`);

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data
    });

    this.logger.debug(`Ingredient ${id} updated successfully`);
    return this.mapToDomain(updated);
  }

  async setTags(ingredientId: string, tagIds: string[]): Promise<void> {
    this.logger.debug(`Setting tags for ingredient ${ingredientId}: ${tagIds.length} tags`);

    // Delete existing associations
    await this.prisma.ingredientTagAssignment.deleteMany({
      where: { ingredientId }
    });

    // Create new associations
    if (tagIds.length > 0) {
      const assignments = tagIds.map(tagId => ({
        ingredientId,
        tagId
      }));
      await this.prisma.ingredientTagAssignment.createMany({
        data: assignments
      });
    }

    this.logger.debug(`Tags set successfully for ingredient ${ingredientId}`);
  }

  async getTags(ingredientId: string): Promise<any[]> {
    const assignments = await this.prisma.ingredientTagAssignment.findMany({
      where: { ingredientId },
      include: {
        tag: true
      }
    });

    return assignments.map(a => a.tag);
  }

  /**
   * Map Prisma record to Domain entity
   */
  private mapToDomain(record: any): Ingredient {
    return new Ingredient(
      record.id,
      record.name,
      record.type as IngredientType,
      record.brand,
      record.productModel,
      record.purchaseChannel,
      record.notes,
      record.baseUnit as BaseUnit,
      record.unitDisplayLabel,
      record.purchaseUnit,
      record.purchaseToBaseRatio,
      parseFloat(record.currentPricePerPurchaseUnit.toString()),
      record.weightG,
      record.maxCapacityG,
      record.properties
    );
  }
}

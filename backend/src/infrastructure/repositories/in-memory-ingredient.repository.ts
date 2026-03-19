/**
 * In-Memory Ingredient Repository
 * Implementation of IngredientRepository for development/testing
 */

import { Injectable } from '@nestjs/common';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Ingredient } from '../../domain/ingredient/ingredient.entity';
import { IngredientType } from '../../domain/ingredient/enums';

@Injectable()
export class InMemoryIngredientRepository implements IngredientRepository {
  private ingredients: Map<string, Ingredient> = new Map();
  private ingredientTags: Map<string, string[]> = new Map();

  async findById(id: string): Promise<Ingredient | null> {
    return this.ingredients.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Ingredient[]> {
    return ids
      .map((id) => this.ingredients.get(id))
      .filter((ing): ing is Ingredient => ing !== undefined);
  }

  async findAll(): Promise<Ingredient[]> {
    return Array.from(this.ingredients.values());
  }

  async findByType(type: IngredientType): Promise<Ingredient[]> {
    return Array.from(this.ingredients.values()).filter(
      (ing) => ing.type === type,
    );
  }

  async save(ingredient: Ingredient, tagIds?: string[]): Promise<Ingredient> {
    this.ingredients.set(ingredient.id, ingredient);
    if (tagIds) {
      this.ingredientTags.set(ingredient.id, tagIds);
    }
    return ingredient;
  }

  async update(id: string, data: Partial<any>): Promise<Ingredient> {
    const existing = this.ingredients.get(id);
    if (!existing) {
      throw new Error(`Ingredient not found: ${id}`);
    }

    const updated = new Ingredient(
      existing.id,
      data.name ?? existing.name,
      existing.type,
      data.brand ?? existing.brand,
      data.productModel ?? existing.productModel,
      data.purchaseChannel ?? existing.purchaseChannel,
      data.notes ?? existing.notes,
      existing.baseUnit,
      data.unitDisplayLabel ?? existing.unitDisplayLabel,
      data.purchaseUnit ?? existing.purchaseUnit,
      data.purchaseToBaseRatio ?? existing.purchaseToBaseRatio,
      data.currentPricePerPurchaseUnit ?? existing.currentPricePerPurchaseUnit,
      data.weightG ?? existing.weightG,
      data.maxCapacityG ?? existing.maxCapacityG,
      data.properties ?? existing.properties,
    );

    this.ingredients.set(id, updated);
    return updated;
  }

  async updatePrice(
    id: string,
    pricePerPurchaseUnit: number,
  ): Promise<Ingredient | null> {
    const existing = this.ingredients.get(id);
    if (!existing) {
      return null;
    }

    const updated = new Ingredient(
      existing.id,
      existing.name,
      existing.type,
      existing.brand,
      existing.productModel,
      existing.purchaseChannel,
      existing.notes,
      existing.baseUnit,
      existing.unitDisplayLabel,
      existing.purchaseUnit,
      existing.purchaseToBaseRatio,
      pricePerPurchaseUnit,
      existing.weightG,
      existing.maxCapacityG,
      existing.properties,
    );

    this.ingredients.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.ingredients.delete(id);
    this.ingredientTags.delete(id);
  }

  async setTags(ingredientId: string, tagIds: string[]): Promise<void> {
    this.ingredientTags.set(ingredientId, tagIds);
  }

  async getTags(_ingredientId: string): Promise<any[]> {
    // Return empty array for in-memory implementation
    return [];
  }
}

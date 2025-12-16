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

  async save(ingredient: Ingredient): Promise<Ingredient> {
    this.ingredients.set(ingredient.id, ingredient);
    return ingredient;
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
}

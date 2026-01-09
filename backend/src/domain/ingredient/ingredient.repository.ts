/**
 * Ingredient Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { Ingredient } from './ingredient.entity';
import { IngredientType } from './enums';

export interface IngredientRepository {
  findById(id: string): Promise<Ingredient | null>;
  findByIds(ids: string[]): Promise<Ingredient[]>;
  findAll(): Promise<Ingredient[]>;
  findByType(type: IngredientType): Promise<Ingredient[]>;
  save(ingredient: Ingredient, tagIds?: string[]): Promise<Ingredient>;
  update(
    id: string,
    data: Partial<any>,
  ): Promise<Ingredient>;
  updatePrice(
    id: string,
    pricePerPurchaseUnit: number,
  ): Promise<Ingredient | null>;
  delete(id: string): Promise<void>;
  setTags(ingredientId: string, tagIds: string[]): Promise<void>;
  getTags(ingredientId: string): Promise<any[]>;
}


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
  save(ingredient: Ingredient): Promise<Ingredient>;
  updatePrice(
    id: string,
    pricePerPurchaseUnit: number,
  ): Promise<Ingredient | null>;
}

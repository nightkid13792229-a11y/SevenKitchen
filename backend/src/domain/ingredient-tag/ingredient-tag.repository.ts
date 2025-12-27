/**
 * IngredientTag Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { IngredientTag } from './ingredient-tag.entity';

export interface IngredientTagRepository {
  /**
   * Find tag by ID
   */
  findById(id: string): Promise<IngredientTag | null>;

  /**
   * Find all tags
   */
  findAll(): Promise<IngredientTag[]>;

  /**
   * Find root tags (no parent)
   */
  findRootTags(): Promise<IngredientTag[]>;

  /**
   * Find children by parent ID
   */
  findChildren(parentId: string): Promise<IngredientTag[]>;

  /**
   * Find tags by ingredient ID
   */
  findByIngredient(ingredientId: string): Promise<IngredientTag[]>;

  /**
   * Save tag (create or update)
   */
  save(tag: IngredientTag): Promise<IngredientTag>;

  /**
   * Delete tag by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Check if tag has children
   */
  hasChildren(id: string): Promise<boolean>;

  /**
   * Get tag hierarchy (tree structure)
   */
  getHierarchy(): Promise<IngredientTag[]>;
}

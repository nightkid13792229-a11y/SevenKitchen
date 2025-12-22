/**
 * DogBreed Repository Interface
 * Domain repository for DogBreed aggregate
 */

import { DogBreed } from './dog-breed.entity';

/**
 * DogBreed Repository
 * Handles persistence operations for DogBreed
 */
export interface DogBreedRepository {
  /**
   * Find breed by ID
   */
  findById(id: string): Promise<DogBreed | null>;

  /**
   * Find all breeds
   */
  findAll(): Promise<DogBreed[]>;

  /**
   * Find breeds by size category
   */
  findBySizeCategory(sizeCategory: string): Promise<DogBreed[]>;
}

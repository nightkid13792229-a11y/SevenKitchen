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
   * Find hot standard breeds ranked by dog profile usage
   */
  findHotBreeds(limit?: number): Promise<DogBreed[]>;

  /**
   * Find breeds by size category
   */
  findBySizeCategory(sizeCategory: string): Promise<DogBreed[]>;

  /**
   * Save new breed
   */
  save(breed: DogBreed): Promise<DogBreed>;

  /**
   * Update existing breed
   */
  update(id: string, breed: DogBreed): Promise<DogBreed | null>;

  /**
   * Delete breed by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Check if breed exists by name
   */
  existsByName(name: string, excludeId?: string): Promise<boolean>;

  /**
   * Count how many dogs use this breed
   */
  countUsage(breedId: string): Promise<number>;

  /**
   * Find dogs that use this breed
   */
  findUsage(
    breedId: string,
    limit?: number,
  ): Promise<Array<{ id: string; name: string; ownerId: string }>>;
}

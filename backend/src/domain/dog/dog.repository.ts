/**
 * Dog Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { Dog } from './dog.entity';

export interface DogRepository {
  findById(id: string): Promise<Dog | null>;
  findByOwnerId(ownerId: string): Promise<Dog[]>;
  save(dog: Dog): Promise<Dog>;
  delete(id: string): Promise<void>;
}


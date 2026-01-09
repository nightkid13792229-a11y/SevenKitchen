/**
 * InMemory Dog Repository Implementation
 * Temporary implementation for development/testing without database
 */

import { Injectable } from '@nestjs/common';
import { Dog } from '../../domain/dog/dog.entity';
import type { DogRepository } from '../../domain/dog/dog.repository';

@Injectable()
export class InMemoryDogRepository implements DogRepository {
  private dogs: Map<string, Dog> = new Map();

  async findById(id: string): Promise<Dog | null> {
    return Promise.resolve(this.dogs.get(id) || null);
  }

  async findByOwnerId(ownerId: string): Promise<Dog[]> {
    return Promise.resolve(
      Array.from(this.dogs.values()).filter((dog) => dog.ownerId === ownerId),
    );
  }

  async save(dog: Dog): Promise<Dog> {
    this.dogs.set(dog.id, dog);
    return Promise.resolve(dog);
  }

  async delete(id: string): Promise<void> {
    this.dogs.delete(id);
    return Promise.resolve();
  }
}


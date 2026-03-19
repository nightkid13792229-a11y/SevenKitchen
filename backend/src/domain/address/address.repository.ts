/**
 * Address Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { Address } from './address.entity';

export interface AddressRepository {
  findById(id: string): Promise<Address | null>;
  findByUserId(userId: string): Promise<Address[]>;
  save(address: Address): Promise<Address>;
  delete(id: string): Promise<void>;
}

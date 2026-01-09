/**
 * InMemory Address Repository Implementation
 * Temporary implementation for development/testing without database
 */

import { Injectable } from '@nestjs/common';
import { Address } from '../../domain/address/address.entity';
import type { AddressRepository } from '../../domain/address/address.repository';

@Injectable()
export class InMemoryAddressRepository implements AddressRepository {
  private addresses: Map<string, Address> = new Map();

  async findById(id: string): Promise<Address | null> {
    return Promise.resolve(this.addresses.get(id) || null);
  }

  async findByUserId(userId: string): Promise<Address[]> {
    return Promise.resolve(
      Array.from(this.addresses.values()).filter(
        (address) => address.userId === userId,
      ),
    );
  }

  async save(address: Address): Promise<Address> {
    this.addresses.set(address.id, address);
    return Promise.resolve(address);
  }

  async delete(id: string): Promise<void> {
    this.addresses.delete(id);
    return Promise.resolve();
  }
}


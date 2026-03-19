/**
 * Address Application Service
 * Application layer service for Address domain operations
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AddressRepository } from '../../domain/address/address.repository';
import { Address, AddressRegion } from '../../domain/address/address.entity';

export interface CreateAddressDto {
  userId: string;
  recipientName: string;
  phone: string;
  region: AddressRegion;
  detail: string;
  isDefault?: boolean;
}

export interface UpdateAddressDto {
  recipientName?: string;
  phone?: string;
  region?: AddressRegion;
  detail?: string;
}

export const ADDRESS_REPOSITORY = Symbol('AddressRepository');

@Injectable()
export class AddressService {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addressRepository: AddressRepository,
  ) {}

  /**
   * List all addresses for a user
   */
  async listAddresses(userId: string): Promise<Address[]> {
    return this.addressRepository.findByUserId(userId);
  }

  /**
   * Create a new address
   * If isDefault is true, unset other default addresses for the user
   */
  async createAddress(dto: CreateAddressDto): Promise<Address> {
    const id = randomUUID();

    // If setting as default, unset other default addresses
    if (dto.isDefault) {
      await this.unsetOtherDefaults(dto.userId);
    }

    const address = new Address(
      id,
      dto.userId,
      dto.recipientName,
      dto.phone,
      dto.region,
      dto.detail,
      dto.isDefault ?? false,
    );

    return this.addressRepository.save(address);
  }

  /**
   * Update an existing address
   */
  async updateAddress(
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const address = await this.addressRepository.findById(addressId);
    if (!address) {
      throw new NotFoundException(`Address not found: ${addressId}`);
    }

    address.update(dto);

    return this.addressRepository.save(address);
  }

  /**
   * Set an address as default
   * Ensures only one default address per user
   */
  async setDefaultAddress(addressId: string): Promise<Address> {
    const address = await this.addressRepository.findById(addressId);
    if (!address) {
      throw new NotFoundException(`Address not found: ${addressId}`);
    }

    // Unset other default addresses for the same user
    await this.unsetOtherDefaults(address.userId);

    // Set this address as default
    address.setAsDefault();

    return this.addressRepository.save(address);
  }

  /**
   * Delete an address
   */
  async deleteAddress(addressId: string): Promise<void> {
    const address = await this.addressRepository.findById(addressId);
    if (!address) {
      throw new NotFoundException(`Address not found: ${addressId}`);
    }

    await this.addressRepository.delete(addressId);
  }

  /**
   * Helper: Unset default flag for all addresses of a user except the specified one
   */
  private async unsetOtherDefaults(
    userId: string,
    excludeId?: string,
  ): Promise<void> {
    const addresses = await this.addressRepository.findByUserId(userId);
    for (const addr of addresses) {
      if (addr.id !== excludeId && addr.isDefault) {
        addr.unsetAsDefault();
        await this.addressRepository.save(addr);
      }
    }
  }
}

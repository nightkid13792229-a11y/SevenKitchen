/**
 * Address Entity
 * Aggregate root for Address domain
 */

import { ValidationError } from '../common/errors';

export interface AddressRegion {
  province: string;
  city: string;
  district: string;
}

export class Address {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public recipientName: string,
    public phone: string,
    public region: AddressRegion,
    public detail: string,
    public isDefault: boolean,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    // Recipient name must not be empty
    if (!this.recipientName || this.recipientName.trim().length === 0) {
      throw new ValidationError('Recipient name must not be empty');
    }

    // Phone must not be empty
    if (!this.phone || this.phone.trim().length === 0) {
      throw new ValidationError('Phone must not be empty');
    }

    // Region must have all fields
    if (
      !this.region ||
      !this.region.province ||
      !this.region.city ||
      !this.region.district
    ) {
      throw new ValidationError(
        'Region must include province, city, and district',
      );
    }

    // Detail address must not be empty
    if (!this.detail || this.detail.trim().length === 0) {
      throw new ValidationError('Detail address must not be empty');
    }
  }

  /**
   * Update address fields
   */
  update(updates: {
    recipientName?: string;
    phone?: string;
    region?: AddressRegion;
    detail?: string;
  }): void {
    if (updates.recipientName !== undefined) {
      this.recipientName = updates.recipientName;
    }
    if (updates.phone !== undefined) {
      this.phone = updates.phone;
    }
    if (updates.region !== undefined) {
      this.region = updates.region;
    }
    if (updates.detail !== undefined) {
      this.detail = updates.detail;
    }

    // Re-validate after updates
    this.validateInvariants();
  }

  /**
   * Set as default address
   */
  setAsDefault(): void {
    this.isDefault = true;
  }

  /**
   * Unset as default address
   */
  unsetAsDefault(): void {
    this.isDefault = false;
  }
}

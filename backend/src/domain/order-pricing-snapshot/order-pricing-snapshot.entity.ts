/**
 * OrderPricingSnapshot Entity
 * Immutable snapshot of pricing calculation for order creation
 */

export class OrderPricingSnapshot {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly requestParams: any,
    public readonly pricingResult: any,
    public readonly expiresAt: Date,
    public readonly used: boolean,
    public readonly createdAt: Date,
  ) {}

  /**
   * Check if snapshot is expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if snapshot belongs to customer
   */
  belongsToCustomer(customerId: string): boolean {
    return this.customerId === customerId;
  }

  /**
   * Check if snapshot can be used for order creation
   */
  canBeUsed(): boolean {
    return !this.used && !this.isExpired();
  }
}

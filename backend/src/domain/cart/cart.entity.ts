/**
 * Cart Entity
 * Aggregate root for Cart domain
 */

import { CartItem } from './cart-item.entity';
import { ValidationError } from '../common/errors';

export class Cart {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly items: CartItem[],
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (!this.customerId || this.customerId.trim() === '') {
      throw new ValidationError('Customer ID is required');
    }
  }

  /**
   * Get total price of all items in cart
   */
  getTotalPrice(): number {
    return this.items.reduce((sum, item) => sum + item.totalPrice, 0);
  }

  /**
   * Get total item count
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Check if cart is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Get items grouped by dog
   */
  getItemsGroupedByDog(): Map<string, CartItem[]> {
    const grouped = new Map<string, CartItem[]>();

    for (const item of this.items) {
      if (!grouped.has(item.dogId)) {
        grouped.set(item.dogId, []);
      }
      grouped.get(item.dogId)!.push(item);
    }

    return grouped;
  }
}

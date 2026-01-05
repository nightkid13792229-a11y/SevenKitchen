/**
 * Cart Repository Interface
 */

import { Cart, CartItem } from './index';

export interface CartRepository {
  /**
   * Find cart by customer ID
   * Creates a new cart if not exists
   */
  findByCustomerId(customerId: string): Promise<Cart>;

  /**
   * Find cart item by ID
   */
  findItemById(itemId: string): Promise<CartItem | null>;

  /**
   * Add item to cart
   * If item with same dog+recipe+cycle exists, update it
   */
  addItem(customerId: string, item: Omit<CartItem, 'id' | 'cartId' | 'createdAt'>): Promise<CartItem>;

  /**
   * Remove item from cart
   */
  removeItem(itemId: string): Promise<void>;

  /**
   * Clear all items from cart
   */
  clearCart(customerId: string): Promise<void>;

  /**
   * Find items by IDs
   */
  findItemsByIds(itemIds: string[]): Promise<CartItem[]>;
}

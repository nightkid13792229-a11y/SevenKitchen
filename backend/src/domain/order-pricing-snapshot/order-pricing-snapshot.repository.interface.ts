/**
 * OrderPricingSnapshot Repository Interface
 */

import { OrderPricingSnapshot } from './order-pricing-snapshot.entity';

export interface IOrderPricingSnapshotRepository {
  create(data: {
    customerId: string;
    requestParams: any;
    pricingResult: any;
    expiresAt: Date;
  }): Promise<OrderPricingSnapshot>;

  findById(id: string): Promise<OrderPricingSnapshot | null>;

  markAsUsed(id: string): Promise<void>;

  deleteExpired(): Promise<number>;
}

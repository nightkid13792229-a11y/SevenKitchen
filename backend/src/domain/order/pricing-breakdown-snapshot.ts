/**
 * Pricing Breakdown Snapshot
 * Immutable value object that captures pricing breakdown at order creation time
 * Phase 7.1: Order Pricing Explainability & Reconciliation
 */

export class PricingBreakdownSnapshot {
  constructor(
    // Cost breakdown (CNY)
    public readonly costIngredients: number,
    public readonly costPackaging: number,
    public readonly costLabor: number,
    public readonly costOverhead: number,
    public readonly totalProductCost: number,
    // Pricing (CNY)
    public readonly productPrice: number,
    public readonly shippingFee: number,
    public readonly totalPrice: number,
    // Versioning / traceability metadata
    public readonly shippingTemplateId: string | null,
    public readonly marginStrategyName: string,
    public readonly createdAt: Date,
    // Optional: ingredient price version hash (for in-memory repos, use simple seed version)
    public readonly ingredientPriceVersionHash?: string | null,
    // Optional: ingredient details for purchasing module (Phase 1)
    public readonly ingredientDetails?: Array<{
      ingredientId: string;
      name: string;
      type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
      amount: number; // 成本计算用量（含出肉率和生产损耗率）
      netAmount?: number; // 净需求（不含损耗率）
      purchaseAmount?: number; // 采购用量（仅含生产损耗率，不含出肉率）
      unit: string;
      cost: number;
      purchaseChannel?: string;
      productModel?: string;
    }>,
  ) {
    // Validate all cost fields are non-negative
    if (costIngredients < 0) {
      throw new Error('costIngredients must be non-negative');
    }
    if (costPackaging < 0) {
      throw new Error('costPackaging must be non-negative');
    }
    if (costLabor < 0) {
      throw new Error('costLabor must be non-negative');
    }
    if (costOverhead < 0) {
      throw new Error('costOverhead must be non-negative');
    }
    if (totalProductCost < 0) {
      throw new Error('totalProductCost must be non-negative');
    }
    if (productPrice < 0) {
      throw new Error('productPrice must be non-negative');
    }
    if (shippingFee < 0) {
      throw new Error('shippingFee must be non-negative');
    }
    if (totalPrice < 0) {
      throw new Error('totalPrice must be non-negative');
    }
  }
}

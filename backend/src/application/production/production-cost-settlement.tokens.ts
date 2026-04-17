export const PRODUCTION_COST_SETTLEMENT_SERVICE = Symbol(
  'PRODUCTION_COST_SETTLEMENT_SERVICE',
);

export interface ProductionCostSettlementRunner {
  settleCompletedBatch(batchId: string): Promise<unknown>;
}

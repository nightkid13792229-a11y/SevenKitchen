/**
 * 试吃装管理 API
 *
 * 试吃装是"提前做好、现货发售"的第二条鲜食产品线，价格由
 * 「5 道菜合并成本 × 试吃倍率」自动算出，参数在「试吃装设置」里调。
 */
import api from './index';

export type PriceRoundingModeCode =
  | 'NONE'
  | 'CEIL_TO_0_1'
  | 'CEIL_TO_0_5'
  | 'CEIL_TO_1';

export const ROUNDING_MODE_LABELS: Record<PriceRoundingModeCode, string> = {
  NONE: '不圆整（保留两位小数）',
  CEIL_TO_0_1: '向上进位到 0.1 元',
  CEIL_TO_0_5: '向上进位到 0.5 元',
  CEIL_TO_1: '向上进位到 1 元',
};

export type TastingPackCostBasisCode = 'LIVE' | 'STOCK_BATCH';

export const COST_BASIS_MODE_LABELS: Record<TastingPackCostBasisCode, string> = {
  LIVE: '按今天的原料价',
  STOCK_BATCH: '按库存批次成本',
};

export interface TastingPackConfig {
  enabled: boolean;
  /** 试吃倍率：成本 → 实收 */
  tastingMultiplier: number;
  priceRoundingMode: PriceRoundingModeCode;
  /** 定价用哪个成本基数 */
  costBasisMode: TastingPackCostBasisCode;
  /** 单次限购套数 */
  maxSetsPerOrder: number;
  /** 补货预警阈值（可用套数低于此值即提醒） */
  lowStockThreshold: number;
  /** 一键备货默认套数 */
  defaultRestockSets: number;
  /** 成品保质期（月） */
  shelfLifeMonths: number;
  defaultBagsPerRecipe: number;
  defaultPackSpecG: number;
  allowForceSchedule: boolean;
  updatedAt: string | null;
}

export type UpdateTastingPackConfig = Partial<
  Omit<TastingPackConfig, 'updatedAt'>
>;

export interface TastingPackRecipeSpec {
  recipeId: string;
  packageCount: number;
  packageSpecG: number;
}

export interface TastingPackQuote {
  unitPrice: number;
  unitListPrice: number;
  unitCost: number;
  sets: number;
  amountProduct: number;
  amountShipping: number;
  amountTotal: number;
  totalNetFoodWeightG: number;
  totalPacks: number;
  totalWeightWithPackagingG: number;
  perRecipe: Array<{
    recipeId: string;
    recipeName: string;
    packageCount: number;
    packageSpecG: number;
    netWeightG: number;
    costIngredients: number;
  }>;
  costBreakdown: {
    costIngredients: number;
    costPackaging: number;
    costLabor: number;
    costOverhead: number;
    totalProductCost: number;
  };
  pricingParams: {
    tastingMultiplier: number;
    priceRoundingMode: string;
    targetMargin: number;
    ingredientSourcePlan: string;
  };
  /** 本次定价用的成本基数 */
  costBasis?: 'MANUAL' | 'STOCK_BATCH' | 'LIVE';
  /** 按今天原料价重算的单套成本 */
  liveUnitCost?: number;
}

export interface TastingPackStockRequirement {
  sets: number;
  totalNetFoodWeightG: number;
  totalPacks: number;
  ingredientDetails: Array<{
    name: string;
    type: string;
    amount: number;
    unit: string;
    cost: number;
  }>;
  perRecipe: Array<{
    recipeId: string;
    recipeName: string;
    netWeightG: number;
    packageCount: number;
    packageSpecG: number;
  }>;
}

export const COST_BASIS_LABELS: Record<string, string> = {
  STOCK_BATCH: '库存批次成本',
  LIVE: '今日原料价（暂无库存）',
  MANUAL: '手动定价',
};

export interface TastingPackItemView {
  id: string;
  recipeId: string;
  sortOrder: number;
  name: string;
  coverImageUrl: string | null;
  sellingPoint: string | null;
}

export interface TastingPack {
  id: string;
  code: string;
  name: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  detailImages: unknown;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  bagsPerRecipe: number;
  packSpecG: number;
  manualPrice: number | null;
  maxSetsOverride: number | null;
  sortOrder: number;
  totalNetWeightG: number;
  totalPacks: number;
  items: TastingPackItemView[];
  createdAt: string;
  updatedAt: string;
}

export interface TastingPackListRow extends TastingPack {
  availableSets: number;
  expiringSoonSets: number;
  expiredSets: number;
  lowStockThreshold: number;
  needsRestock: boolean;
  unitCost: number;
  liveUnitCost: number;
  unitPrice: number;
  unitListPrice: number;
  costBasis: string;
}

export interface UpsertTastingPackPayload {
  name: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  bagsPerRecipe?: number;
  packSpecG?: number;
  manualPrice?: number | null;
  maxSetsOverride?: number | null;
  sortOrder?: number;
  items: Array<{ recipeId: string; sortOrder?: number }>;
}

export interface StockBatch {
  id: string;
  batchNo: string;
  tastingPackId: string;
  producedAt: string;
  expiresAt: string;
  quantityTotal: number;
  quantityRemaining: number;
  unitCost: number | null;
  status: 'AVAILABLE' | 'DEPLETED' | 'EXPIRED' | 'VOID';
  note: string | null;
  productionPlanId: string | null;
  createdAt: string;
  daysToExpiry: number;
}

export interface TastingPackStockOverview {
  tastingPackId: string;
  tastingPackName: string;
  availableSets: number;
  expiringSoonSets: number;
  expiredSets: number;
  weightedUnitCost: number | null;
  lowStockThreshold: number;
  needsRestock: boolean;
  batches: StockBatch[];
}

export interface StockLedgerRow {
  id: string;
  tastingPackId: string;
  batchId: string | null;
  delta: number;
  reason: string;
  orderId: string | null;
  note: string | null;
  operatorId: string | null;
  createdAt: string;
}

export const STOCK_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '可售',
  DEPLETED: '已售罄',
  EXPIRED: '已过期',
  VOID: '已作废',
};

export const STOCK_REASON_LABELS: Record<string, string> = {
  STOCK_IN: '备货入库',
  ORDER_RESERVE: '下单占用',
  ORDER_RELEASE: '取消/超时释放',
  MANUAL_ADJUST: '人工调整',
  EXPIRE: '过期下账',
};

export const PACK_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '已上架',
  INACTIVE: '已下架',
};

export const tastingPackApi = {
  /** 读取试吃装设置 */
  getConfig: (): Promise<TastingPackConfig> =>
    api.get('/admin/tasting-pack/config'),

  /** 更新试吃装设置 */
  updateConfig: (data: UpdateTastingPackConfig): Promise<TastingPackConfig> =>
    api.put('/admin/tasting-pack/config', data),

  /** 后台调参试算：同一套菜按当前设置值多少钱 */
  quotePreview: (data: {
    specs: TastingPackRecipeSpec[];
    sets?: number;
    ingredientSourcePlan?: string | null;
  }): Promise<TastingPackQuote> =>
    api.post('/admin/tasting-pack/quote-preview', data),

  /** 备货用料测算：做 N 套需要多少原料 */
  stockRequirementPreview: (data: {
    specs: TastingPackRecipeSpec[];
    sets: number;
    ingredientSourcePlan?: string | null;
  }): Promise<TastingPackStockRequirement> =>
    api.post('/admin/tasting-pack/stock-requirement-preview', data),

  // ---------- 组货 ----------

  listPacks: (): Promise<{ items: TastingPackListRow[] }> =>
    api.get('/admin/tasting-pack/packs'),

  getPack: (id: string): Promise<TastingPack & { quote: TastingPackQuote }> =>
    api.get(`/admin/tasting-pack/packs/${id}`),

  createPack: (data: UpsertTastingPackPayload): Promise<TastingPack> =>
    api.post('/admin/tasting-pack/packs', data),

  updatePack: (
    id: string,
    data: UpsertTastingPackPayload,
  ): Promise<TastingPack> => api.put(`/admin/tasting-pack/packs/${id}`, data),

  publishPack: (id: string): Promise<TastingPack> =>
    api.post(`/admin/tasting-pack/packs/${id}/publish`),

  unpublishPack: (id: string): Promise<TastingPack> =>
    api.post(`/admin/tasting-pack/packs/${id}/unpublish`),

  removePack: (id: string): Promise<{ deleted: boolean }> =>
    api.delete(`/admin/tasting-pack/packs/${id}`),

  // ---------- 成品库存 ----------

  listStock: (): Promise<{
    items: TastingPackStockOverview[];
    needsRestockCount: number;
  }> => api.get('/admin/tasting-pack/stock'),

  getStock: (tastingPackId: string): Promise<TastingPackStockOverview> =>
    api.get(`/admin/tasting-pack/stock/${tastingPackId}`),

  stockIn: (data: {
    tastingPackId: string;
    sets: number;
    producedAt: string;
    expiresAt?: string | null;
    unitCost?: number | null;
    note?: string | null;
  }): Promise<StockBatch> => api.post('/admin/tasting-pack/stock/in', data),

  adjustBatch: (
    batchId: string,
    data: { delta: number; note: string },
  ): Promise<StockBatch> =>
    api.post(`/admin/tasting-pack/stock/batches/${batchId}/adjust`, data),

  voidBatch: (batchId: string, data: { note: string }): Promise<StockBatch> =>
    api.post(`/admin/tasting-pack/stock/batches/${batchId}/void`, data),

  expirySweep: (): Promise<{ expired: number }> =>
    api.post('/admin/tasting-pack/stock/expiry-sweep'),

  listLedger: (params: {
    tastingPackId?: string;
    reason?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: StockLedgerRow[]; total: number; page: number; pageSize: number }> =>
    api.get('/admin/tasting-pack/stock/ledger', { params }),
};

// ---------- 备货生产 ----------

export type TastingPackPlanStatus =
  | 'PLANNED'
  | 'PURCHASING'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'STOCKED'
  | 'CANCELLED';

export const PLAN_STATUS_LABELS: Record<TastingPackPlanStatus, string> = {
  PLANNED: '已建单（待生成采购清单）',
  PURCHASING: '采购中',
  SCHEDULED: '已排产（生产中）',
  COMPLETED: '已完工（待入库）',
  STOCKED: '已入库',
  CANCELLED: '已取消',
};

export interface TastingPackPlanDish {
  recipeId: string;
  recipeName: string;
  netWeightG: number;
  packageCount: number;
  packageSpecG: number;
}

export interface TastingPackPlan {
  id: string;
  planNo: string;
  tastingPackId: string;
  tastingPackName: string;
  tastingPackCode: string;
  sets: number;
  plannedDate: string;
  status: TastingPackPlanStatus;
  dishes: TastingPackPlanDish[];
  ingredientCount: number;
  estimatedIngredientCost: number;
  purchaseListId: string | null;
  purchaseListStatus: string | null;
  productionBatchId: string | null;
  suggestedStockInSets: number | null;
  stockedSets: number | null;
  stockedAt: string | null;
  note: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RestockSuggestion {
  tastingPackId: string;
  name: string;
  code: string;
  availableSets: number;
  lowStockThreshold: number;
  suggestedSets: number;
  openPlanId: string | null;
}

export const tastingPackPlanApi = {
  /** 需要补货的试吃装（含建议备货套数） */
  restockSuggestions: (): Promise<{ items: RestockSuggestion[] }> =>
    api.get('/admin/tasting-pack/restock-suggestions'),

  listPlans: (params?: {
    status?: TastingPackPlanStatus;
    tastingPackId?: string;
  }): Promise<{ items: TastingPackPlan[]; pendingCount: number }> =>
    api.get('/admin/tasting-pack/production-plans', { params }),

  getPlan: (id: string): Promise<TastingPackPlan> =>
    api.get(`/admin/tasting-pack/production-plans/${id}`),

  createPlan: (data: {
    tastingPackId: string;
    sets: number;
    plannedDate: string;
    note?: string | null;
  }): Promise<TastingPackPlan> =>
    api.post('/admin/tasting-pack/production-plans', data),

  createPurchaseList: (id: string): Promise<TastingPackPlan> =>
    api.post(`/admin/tasting-pack/production-plans/${id}/purchase-list`),

  schedule: (
    id: string,
    data?: { productionDate?: string; force?: boolean },
  ): Promise<TastingPackPlan> =>
    api.post(`/admin/tasting-pack/production-plans/${id}/schedule`, data ?? {}),

  stockIn: (
    id: string,
    data: {
      sets?: number;
      unitCost?: number | null;
      producedAt?: string;
      note?: string | null;
    },
  ): Promise<TastingPackPlan> =>
    api.post(`/admin/tasting-pack/production-plans/${id}/stock-in`, data),

  cancelPlan: (id: string, reason: string): Promise<TastingPackPlan> =>
    api.post(`/admin/tasting-pack/production-plans/${id}/cancel`, { reason }),
};

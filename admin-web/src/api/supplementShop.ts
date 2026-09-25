/**
 * 补剂商城管理 API
 *
 * 第 0 期：补剂上架清单（含数据体检）
 */
import api from './index';

export type IngredientPhysicalFormCode =
  | 'POWDER'
  | 'TABLET'
  | 'CAPSULE'
  | 'LIQUID';

export interface SupplementCatalogIssue {
  code: string;
  level: 'ERROR' | 'WARN';
  message: string;
}

export interface SupplementCatalogItem {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  baseUnit: string;
  /** 最终展示单位（与小程序展示口径一致） */
  displayUnit: string;
  propertiesDisplayUnit: string | null;
  unitDisplayLabel: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  pricePerPurchaseUnit: number;
  unitCost: number | null;
  physicalForm: IngredientPhysicalFormCode | null;
  suggestedPhysicalForm: IngredientPhysicalFormCode | null;
  isOilBased: boolean;
  suggestedOilBased: boolean;
  supplementRetailEnabled: boolean;
  shelfLifeMonths: number | null;
  suggestedShelfLifeMonths: number | null;
  storageCondition: string | null;
  openedShelfLifeDays: number | null;
  recipeReferenceCount: number;
  /** 是否可用于生产（能出现在 DIY 制作单上，或被食谱引用） */
  producible: boolean;
  issues: SupplementCatalogIssue[];
  readyToSell: boolean;
}

export interface SupplementCatalogSummary {
  total: number;
  retailEnabled: number;
  readyToSell: number;
  blockedByError: number;
  missingForm: number;
  missingShelfLife: number;
  noPrice: number;
}

export interface SupplementCatalogResponse {
  summary: SupplementCatalogSummary;
  items: SupplementCatalogItem[];
}

export interface UpdateSupplementCatalogItemDto {
  physicalForm?: IngredientPhysicalFormCode | null;
  isOilBased?: boolean;
  supplementRetailEnabled?: boolean;
  shelfLifeMonths?: number | null;
  storageCondition?: string | null;
  openedShelfLifeDays?: number | null;
}

export const supplementShopApi = {
  /** 补剂上架清单（含数据体检结果） */
  catalog: (): Promise<SupplementCatalogResponse> =>
    api.get('/admin/supplement-shop/catalog'),

  /** 更新单个补剂的上架档案 */
  updateItem: (
    id: string,
    data: UpdateSupplementCatalogItemDto,
  ): Promise<SupplementCatalogItem> =>
    api.patch(`/admin/supplement-shop/catalog/${id}`, data),

  /** 按系统建议批量预填空白项（不覆盖已填内容） */
  applySuggestions: (): Promise<{ updated: number }> =>
    api.post('/admin/supplement-shop/catalog/apply-suggestions'),

  /** 一键上架全部可用于生产的补剂 */
  enableAllProducible: (): Promise<{
    enabled: number;
    alreadyEnabled: number;
    skipped: Array<{ name: string; brand: string | null; reason: string }>;
  }> => api.post('/admin/supplement-shop/catalog/enable-all-producible'),

  /** 读取补剂商城配置 */
  getConfig: (): Promise<SupplementShopConfig> =>
    api.get('/admin/supplement-shop/config'),

  /** 更新补剂商城配置 */
  updateConfig: (
    data: UpdateSupplementShopConfigDto,
  ): Promise<SupplementShopConfig> =>
    api.put('/admin/supplement-shop/config', data),

  /** 后台调参试算 */
  quotePreview: (data: {
    lines: SupplementQuoteLineInput[];
    totalWeightG?: number;
  }): Promise<SupplementQuote> =>
    api.post('/admin/supplement-shop/quote-preview', data),
};

export type SupplementServiceFeeMode = 'PER_ORDER' | 'PER_BAG';
export type SupplementPriceRoundingMode =
  | 'NONE'
  | 'CEIL_TO_0_1'
  | 'CEIL_TO_0_5'
  | 'CEIL_TO_1';
export type SupplementShippingMode = 'FLAT_RATE' | 'TEMPLATE';

export interface SupplementShopConfig {
  enabled: boolean;
  markupMultiplier: number;
  serviceFeeMode: SupplementServiceFeeMode;
  serviceFeeAmount: number;
  packagingFeePerBag: number;
  priceRoundingMode: SupplementPriceRoundingMode;
  minOrderAmount: number;
  roundUpUsage: boolean;
  /** 加量：用户一次最多买几份 */
  maxPortionMultiplier: number;
  /** 加量：一次购买覆盖的总天数上限（效期安全红线） */
  maxTotalDays: number;
  /** 补剂订单支付超时（分钟）；0 = 不自动关单。与鲜食订单独立 */
  paymentTimeoutMinutes: number;
  shippingMode: SupplementShippingMode;
  flatShippingFee: number;
  shippingTemplateId: string | null;
  freeShippingThreshold: number | null;
  powderShelfLifeMonths: number;
  solidShelfLifeMonths: number;
  oilShelfLifeMonths: number;
  minRemainingShelfLifeDays: number;
  aftersalePolicy: string | null;
  labelBrandName: string;
  labelIncludeDesiccantNotice: boolean;
  updatedAt: string | null;
}

export type UpdateSupplementShopConfigDto = Partial<
  Omit<SupplementShopConfig, 'updatedAt'>
>;

export interface SupplementQuoteLineInput {
  ingredientId: string;
  name: string;
  unit: string;
  amount: number;
  unitCost: number;
  physicalForm: IngredientPhysicalFormCode;
}

export interface SupplementQuoteLineResult extends SupplementQuoteLineInput {
  requestedAmount: number;
  packedAmount: number;
  cost: number;
  price: number;
  bags: number;
  shelfLifeMonths: number;
}

export interface SupplementQuote {
  lines: SupplementQuoteLineResult[];
  bagCount: number;
  supplementCost: number;
  supplementPrice: number;
  serviceFee: number;
  packagingFee: number;
  goodsSubtotal: number;
  shippingFee: number;
  shippingDescription: string;
  freeShipping: boolean;
  total: number;
  warnings: string[];
}

export const SERVICE_FEE_MODE_LABELS: Record<SupplementServiceFeeMode, string> = {
  PER_ORDER: '按单固定',
  PER_BAG: '按袋计费',
};

export const ROUNDING_MODE_LABELS: Record<SupplementPriceRoundingMode, string> = {
  NONE: '不圆整（保留 2 位小数）',
  CEIL_TO_0_1: '向上取到 1 角',
  CEIL_TO_0_5: '向上取到 5 角',
  CEIL_TO_1: '向上取到 1 元',
};

export const SHIPPING_MODE_LABELS: Record<SupplementShippingMode, string> = {
  FLAT_RATE: '一口价',
  TEMPLATE: '按重量（套用现有运费模板）',
};

export const PHYSICAL_FORM_LABELS: Record<IngredientPhysicalFormCode, string> = {
  POWDER: '粉剂',
  TABLET: '片剂',
  CAPSULE: '胶囊',
  LIQUID: '液体',
};

export const ISSUE_LABELS: Record<string, string> = {
  NO_PRICE: '无进货价',
  FORM_MISSING: '缺形态',
  LIQUID_UNSUPPORTED: '液体不支持',
  SHELF_LIFE_MISSING: '缺保质期',
  STORAGE_MISSING: '缺储存条件',
  UNIT_INCONSISTENT: '单位不一致',
  DUPLICATE_NAME: '同名重复',
};

// ---------------- 补剂订单（后台工作台） ----------------

export type SupplementOrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PACKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'AFTERSALE';

export interface SupplementOrderItem {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  physicalForm: IngredientPhysicalFormCode | null;
  unit: string;
  requestedAmount: number;
  packedAmount: number;
  unitCost: number;
  cost: number;
  price: number;
  bags: number;
  shelfLifeMonths: number;
  storageCondition: string | null;
  batchNo: string | null;
  sourceExpiryDate: string | null;
  packedExpiryDate: string | null;
  packedAt: string | null;
}

export interface SupplementOrder {
  id: string;
  orderNo: string;
  status: SupplementOrderStatus;
  bagCount: number;
  amountSupplement: number;
  amountServiceFee: number;
  amountPackaging: number;
  amountGoods: number;
  amountShipping: number;
  amountTotal: number;
  shippingDescription: string | null;
  receiverName: string;
  receiverPhone: string;
  receiverRegion: string;
  receiverDetail: string;
  recipeId: string | null;
  recipeName: string | null;
  dogId: string | null;
  dogName: string | null;
  cycleDays: number | null;
  remark: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  aftersaleType: string | null;
  aftersaleReason: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  refundOutNo: string | null;
  refundId: string | null;
  refundReason: string | null;
  refundedAt: string | null;
  reshipFromOrderNo: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  shippedAt: string | null;
  createdAt: string;
  items: SupplementOrderItem[];
}

export interface SupplementOrderPage {
  items: SupplementOrder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PackSupplementOrderDto {
  items: Array<{ itemId: string; batchNo?: string; sourceExpiryDate: string }>;
}

export const SUPPLEMENT_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: '待付款',
  PAID: '待分装',
  PACKING: '分装中',
  PACKED: '待发货',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  AFTERSALE: '售后中',
};

export const SUPPLEMENT_ORDER_STATUS_TYPES: Record<
  string,
  'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'primary',
  PACKING: 'primary',
  PACKED: 'primary',
  SHIPPED: 'success',
  COMPLETED: 'info',
  CANCELLED: 'info',
  AFTERSALE: 'danger',
};

export interface SupplementLabel {
  /** 标签唯一标识：同一个补剂有多袋时各不相同，列表 key 用它 */
  labelId: string;
  itemId: string;
  productName: string;
  amountText: string;
  /** 该补剂的第几袋（从 1 开始） */
  bagIndex: number;
  /** 该补剂一共几袋；加量后 > 1，此时每袋都要贴一张 */
  bagTotal: number;
  packedDate: string;
  expiryDate: string;
  batchNo: string | null;
  storageCondition: string;
  sourceProduct: string;
  sourceExpiryDate: string;
  disclaimer: string;
}

export interface SupplementOrderLabels {
  orderNo: string;
  brandName: string;
  receiverName: string;
  labels: SupplementLabel[];
}

export const supplementOrderApi = {
  list: (params: {
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SupplementOrderPage> =>
    api.get('/admin/supplement-shop/orders', { params }),

  detail: (id: string): Promise<SupplementOrder> =>
    api.get(`/admin/supplement-shop/orders/${id}`),

  summary: (): Promise<Record<string, number>> =>
    api.get('/admin/supplement-shop/orders/summary'),

  confirmPayment: (
    id: string,
    data: { transactionId?: string; note?: string },
  ): Promise<SupplementOrder> =>
    api.post(`/admin/supplement-shop/orders/${id}/confirm-payment`, data),

  pack: (id: string, data: PackSupplementOrderDto): Promise<SupplementOrder> =>
    api.post(`/admin/supplement-shop/orders/${id}/pack`, data),

  ship: (
    id: string,
    data: { trackingNumber: string; carrierCode?: string },
  ): Promise<SupplementOrder> =>
    api.post(`/admin/supplement-shop/orders/${id}/ship`, data),

  cancel: (id: string, data: { reason?: string }): Promise<SupplementOrder> =>
    api.post(`/admin/supplement-shop/orders/${id}/cancel`, data),

  aftersale: (
    id: string,
    data: { type: 'REFUND' | 'RESHIP'; reason: string },
  ): Promise<SupplementOrder> =>
    api.post(`/admin/supplement-shop/orders/${id}/aftersale`, data),

  labels: (id: string): Promise<SupplementOrderLabels> =>
    api.get(`/admin/supplement-shop/orders/${id}/labels`),

  /** 线上退款（微信原路退回，同时登记售后） */
  refund: (
    id: string,
    data: { amount?: number; reason: string },
  ): Promise<{
    outRefundNo: string | null;
    refundId: string | null;
    status: string;
    amount: number;
    reused: boolean;
  }> => api.post(`/admin/supplement-shop/orders/${id}/refund`, data),

  /** 免费补发：生成一张 0 元补发单 */
  reship: (
    id: string,
    data: { reason: string },
  ): Promise<{ original: SupplementOrder; reship: SupplementOrder }> =>
    api.post(`/admin/supplement-shop/orders/${id}/reship`, data),
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  SUCCESS: '已退款',
  PROCESSING: '退款中',
  PENDING: '退款中',
  ABNORMAL: '退款异常',
  CLOSED: '退款关闭',
};

/** 标签效期预览：min(原瓶到期日, 分装日 + 效期系数) */
export function previewPackedExpiry(
  sourceExpiryDate: string,
  shelfLifeMonths: number,
): string {
  if (!sourceExpiryDate) return '—';
  const source = new Date(sourceExpiryDate);
  if (Number.isNaN(source.getTime())) return '—';

  const packedAt = new Date();
  const byRule = new Date(packedAt.getTime());
  const day = byRule.getDate();
  byRule.setDate(1);
  byRule.setMonth(byRule.getMonth() + shelfLifeMonths);
  const lastDay = new Date(
    byRule.getFullYear(),
    byRule.getMonth() + 1,
    0,
  ).getDate();
  byRule.setDate(Math.min(day, lastDay));

  const finalDate = source.getTime() < byRule.getTime() ? source : byRule;
  return finalDate.toISOString().slice(0, 10);
}

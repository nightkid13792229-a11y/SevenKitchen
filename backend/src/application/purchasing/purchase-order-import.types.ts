/**
 * 订单截图识别的中间结构（2026-11-04 采购-报销 AI 接入）。
 *
 * 约束（与设计文档一致）：
 *   1. 模型只负责「读图」，不做换算、不做匹配；
 *   2. 读不到的字段一律 null，绝不用猜测值填坑；
 *   3. 所有金额必须通过「行小计之和 = 商品金额」的自检。
 */

export type OrderChannel = '山姆' | '盒马' | '沃尔玛' | '其他';

export interface ParsedOrderLine {
  rawName: string;
  spec: string | null;
  qty: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface ParsedOrderDraft {
  channel: OrderChannel;
  orderNo: string | null;
  orderTime: string | null;
  items: ParsedOrderLine[];
  subtotal: number | null;
  shippingFee: number | null;
  packagingFee: number | null;
  discount: number | null;
  paid: number | null;
  weightAdjustment: { exists: boolean; amount: number | null };
  incomplete: boolean;
  incompleteReason: string | null;
  note: string;
  lineSum: number;
  qtySum: number;
  amountsConsistent: boolean;
}

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ListSkuCandidate {
  id: string;
  name: string;
  productModel: string | null;
  purchaseChannel: string | null;
  /** 采购单位 → 基准单位的换算比（件数 × 单件净含量） */
  purchaseToBaseRatio: number | null;
  purchaseUnit: string | null;
}

export interface ListItemCandidate {
  purchaseItemId: string;
  ingredientId: string;
  ingredientName: string;
  skus: ListSkuCandidate[];
}

export interface MatchedOrderLine extends ParsedOrderLine {
  ingredientId: string | null;
  ingredientName: string | null;
  procurementSkuId: string | null;
  purchaseItemId: string | null;
  confidence: MatchConfidence;
  reason: string;
  /** 原料对上了，但没有可用商品 / 规格对不上 → 需要员工新建商品 */
  needsNewSku: boolean;
}

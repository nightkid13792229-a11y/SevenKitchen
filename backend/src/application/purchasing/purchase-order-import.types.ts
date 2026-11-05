/**
 * 订单截图识别的中间结构（2026-11-04 采购-报销 AI 接入）。
 *
 * 约束（与设计文档一致）：
 *   1. 模型只负责「读图」，不做换算、不做匹配；
 *   2. 读不到的字段一律 null，绝不用猜测值填坑；
 *   3. 所有金额必须通过「行小计之和 = 商品金额」的自检。
 */

/**
 * 采购渠道的字典 code（例如「山姆会员店」）。
 *
 * 2026-11-05 起渠道只认字典 `purchase_channel` 里的一条；
 * `null` 表示模型没认出来、等员工确认 —— 不再用「其他」冒充。
 */
export type OrderChannel = string;

/** 手动匹配成功后记住的「叫法 → 原料/商品」 */
export interface MatchAlias {
  normalizedName: string;
  channelFamily: string;
  ingredientId: string;
  procurementSkuId: string | null;
}

export interface ParsedOrderLine {
  rawName: string;
  spec: string | null;
  qty: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface ParsedOrderDraft {
  /** null = 没认出渠道，等员工确认 */
  channel: OrderChannel | null;
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
  /**
   * 曾用名（2026-11-05）。生成采购记录时会把截图里的叫法同步成商品名，
   * 匹配时也必须认旧名字 —— 否则「改完名字，下次同样的字反而匹配不上」。
   */
  previousNames?: string[] | null;
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

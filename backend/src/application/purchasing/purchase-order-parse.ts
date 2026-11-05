/**
 * 订单截图识别结果的解析与自检（纯函数，2026-11-04）。
 *
 * 为什么单独一层：模型输出是不可信的 JSON。这一层负责把
 *   「可能缺字段 / 金额对不上 / 单位写成字符串」的原始结果
 * 收口成内部结构，并把「对不上」变成可判断的标记，而不是抛错。
 *
 * 硬规则：
 *   · 金额读不出来给 null，不用 0 顶替；
 *   · 行小计缺失时用 单价 × 数量 补，但补出来的结果会降低可信度；
 *   · 「截图完整不完整」只由模型判断，不再由金额差判定（2026-11-05）。
 *     优惠/特价/包装费/称重退差都会让合计对不上，公式化判断只会误报；
 *     金额差仍然算出来（amountsConsistent），交给页面提示，不做拦截。
 */

import type {
  OrderChannel,
  ParsedOrderDraft,
  ParsedOrderLine,
} from './purchase-order-import.types';

const AMOUNT_TOLERANCE = 0.011;

export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[¥￥,\s]/g, '').replace(/[^\d.\-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeChannel(value: unknown): OrderChannel {
  const text = toStringOrNull(value) ?? '';
  if (text.includes('山姆') || /sam'?s/i.test(text)) return '山姆';
  if (text.includes('盒马')) return '盒马';
  if (text.includes('沃尔玛') || /walmart/i.test(text)) return '沃尔玛';
  return '其他';
}

function toPositiveNumberOrNull(value: unknown): number | null {
  const parsed = toNumberOrNull(value);
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseLine(raw: unknown, index: number): ParsedOrderLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const rawName =
    toStringOrNull(item.name) ??
    toStringOrNull(item.rawName) ??
    toStringOrNull(item.title);
  if (!rawName) return null;

  const qty = toPositiveNumberOrNull(item.qty ?? item.quantity);
  const unitPrice = toNumberOrNull(item.unitPrice ?? item.price);
  const explicitTotal = toNumberOrNull(item.lineTotal ?? item.total);

  const lineTotal =
    explicitTotal ?? (qty !== null && unitPrice !== null
      ? round2(qty * unitPrice)
      : null);

  return {
    rawName,
    spec: toStringOrNull(item.spec),
    qty,
    unit: toStringOrNull(item.unit),
    unitPrice,
    lineTotal: lineTotal === null ? null : round2(lineTotal),
    // index 只用于调试时定位，不进入结果
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function parseOrderDraft(raw: Record<string, unknown>): ParsedOrderDraft {
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw
    .map((entry, index) => parseLine(entry, index))
    .filter((line): line is ParsedOrderLine => line !== null);

  const subtotal = toNumberOrNull(raw.subtotal);
  const lineSum = round2(
    items.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0),
  );
  const qtySum = round2(
    items.reduce((sum, line) => sum + (line.qty ?? 0), 0),
  );

  const amountsConsistent =
    subtotal === null
      ? false
      : Math.abs(lineSum - subtotal) <= AMOUNT_TOLERANCE;

  const weight =
    raw.weightAdjustment && typeof raw.weightAdjustment === 'object'
      ? (raw.weightAdjustment as Record<string, unknown>)
      : {};

  const incompleteFlag = raw.incomplete === true;
  const incomplete = incompleteFlag;
  const incompleteReason = incompleteFlag
    ? (toStringOrNull(raw.incompleteReason) ??
      '模型认为这张截图没读完整，请对照原图确认')
    : null;

  return {
    channel: normalizeChannel(raw.channel),
    orderNo: toStringOrNull(raw.orderNo),
    orderTime: toStringOrNull(raw.orderTime),
    items,
    subtotal: subtotal === null ? null : round2(subtotal),
    shippingFee: toNumberOrNull(raw.shippingFee),
    packagingFee: toNumberOrNull(raw.packagingFee),
    discount: toNumberOrNull(raw.discount),
    paid: toNumberOrNull(raw.paid),
    weightAdjustment: {
      exists: weight.exists === true,
      amount: toNumberOrNull(weight.amount),
    },
    incomplete,
    incompleteReason: incomplete ? incompleteReason : null,
    note: toStringOrNull(raw.note) ?? '',
    lineSum,
    qtySum,
    amountsConsistent,
  };
}

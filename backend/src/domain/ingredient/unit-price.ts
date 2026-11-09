import { IngredientType } from './enums';

/**
 * 单价换算（2026-11-06「单一来源」改造 · 阶段 D）
 *
 * 全系统只有这一条换算公式：
 *
 *     每基准单位成本 = 价格 ÷ 换算比
 *
 * 其中「价格」是元 / 采购单位（元/瓶、元/组、元/克），
 * 「换算比」是 1 个采购单位等于多少基准单位（120 粒/瓶、12 个/组、1 克/克）。
 *
 * 改造前这段除法散落在 7 个地方（原料实体、补剂目录、补剂下单、采购服务、
 * SKU 服务、调价服务、算价依据 SQL），每处都自己判一遍 0 和 NaN，
 * 一旦有人改了口径，其余六处不会跟着变。现在统一收敛到这里。
 *
 * ⚠️ 换算比非法（null / ≤0 / 非数字）时返回 null，**不抛异常**：
 * 调用方有的是「展示层允许缺失」（补剂目录的 unitCost 本来就可能为空），
 * 有的是「必须拿到数才能算价」（算价），由调用方自己决定怎么办。
 */
export function perBaseUnitCost(
  pricePerPurchaseUnit: number | null | undefined,
  purchaseToBaseRatio: number | null | undefined,
): number | null {
  // 必须先判空再 Number()：Number(null) === 0，会把「没有价格」静默变成免费。
  // 这正是 2026-11-06 改造要消灭的那类错误。
  if (pricePerPurchaseUnit === null || pricePerPurchaseUnit === undefined) {
    return null;
  }
  if (purchaseToBaseRatio === null || purchaseToBaseRatio === undefined) {
    return null;
  }

  const price = Number(pricePerPurchaseUnit);
  const ratio = Number(purchaseToBaseRatio);

  if (!Number.isFinite(price) || !Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }

  return price / ratio;
}

/**
 * 同一条公式，但换算比非法时返回正无穷。
 *
 * 采购选品按「每基准单位成本」从低到高排，非法价格应该沉到最后，
 * 而不是变成 0 排到最前（那会让「还没定价」的商品被优先推荐）。
 */
export function perBaseUnitCostOrInfinity(
  pricePerPurchaseUnit: number | null | undefined,
  purchaseToBaseRatio: number | null | undefined,
): number {
  return perBaseUnitCost(pricePerPurchaseUnit, purchaseToBaseRatio) ?? Number.POSITIVE_INFINITY;
}

/**
 * 一条采购记录的「基准数量」（2026-11-10 从调价服务抽出来）。
 *
 * 为什么需要兜底：早期采购记录只写了 actualQuantity（按采购单位），
 * 没有写 actualBaseQuantity；只认后者会让这些记录算不出折算价。
 *
 * 为什么食材 ratio=1 不兜底：食材档案的换算比经常是 1（按克记），
 * 拿它乘「几袋」会把 2 袋记成 2 克（2026-11-07 红薯事故的口径）。
 * 这种情况宁可不给数，也不猜。
 */
export function resolvePurchaseRecordBaseQuantity(
  record: {
    actualQuantity?: unknown;
    actualBaseQuantity?: unknown;
  },
  ingredient: {
    purchaseToBaseRatio?: unknown;
    type?: unknown;
  },
): number | null {
  const toNumber = (value: unknown): number => {
    if (
      value !== null &&
      value !== undefined &&
      typeof (value as { toNumber?: () => number }).toNumber === 'function'
    ) {
      return (value as { toNumber: () => number }).toNumber();
    }
    return Number(value);
  };

  const baseQuantity = toNumber(record.actualBaseQuantity);
  if (Number.isFinite(baseQuantity) && baseQuantity > 0) {
    return baseQuantity;
  }

  const ratio = toNumber(ingredient.purchaseToBaseRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }

  if (ingredient.type === IngredientType.FOOD && ratio === 1) {
    return null;
  }

  const quantity = toNumber(record.actualQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity * ratio : null;
}

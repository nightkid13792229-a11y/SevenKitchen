/**
 * 采购商品的「净含量」归一化。
 *
 * 背景（2026-11-01 老板定）：小程序的「新增采购商品」只收**原料基准单位**的净含量，
 * 界面不给单位切换。但员工看到的包装和截图可能是 `1kg` / `1.5L` / `30枚`，
 * 所以由这一层把 AI 读到的写法统一折算成基准单位；折算不了的**一律拒绝**，绝不猜。
 *
 * 三条硬约束：
 *   1. 跨维度不换算（克 ↔ 毫升）：库里没有密度，算出来就是编的；
 *   2. 斤、两这种市制写法不自动转：员工按斤买的场景走「采购单位 = 斤」，不在这里折；
 *   3. 拿不准就返回 ok:false，调用方把它塞进 missing，让员工手填。
 */

export type BaseUnitCode = 'G' | 'ML' | 'PCS';

export type NetContentNormalizeFailure =
  | 'MISSING'
  | 'INVALID_VALUE'
  | 'CROSS_DIMENSION'
  | 'UNSUPPORTED_UNIT';

export type NetContentNormalizeResult =
  | { ok: true; inBaseUnit: number }
  | { ok: false; reason: NetContentNormalizeFailure };

type Dimension = 'G' | 'ML' | 'PCS';

const UNIT_DIMENSION: Record<string, { dimension: Dimension; factor: number }> =
  {
    g: { dimension: 'G', factor: 1 },
    克: { dimension: 'G', factor: 1 },
    gram: { dimension: 'G', factor: 1 },
    grams: { dimension: 'G', factor: 1 },
    kg: { dimension: 'G', factor: 1000 },
    公斤: { dimension: 'G', factor: 1000 },
    千克: { dimension: 'G', factor: 1000 },
    kilogram: { dimension: 'G', factor: 1000 },
    kilograms: { dimension: 'G', factor: 1000 },

    ml: { dimension: 'ML', factor: 1 },
    毫升: { dimension: 'ML', factor: 1 },
    l: { dimension: 'ML', factor: 1000 },
    升: { dimension: 'ML', factor: 1000 },
    liter: { dimension: 'ML', factor: 1000 },
    liters: { dimension: 'ML', factor: 1000 },
    litre: { dimension: 'ML', factor: 1000 },
    litres: { dimension: 'ML', factor: 1000 },

    个: { dimension: 'PCS', factor: 1 },
    只: { dimension: 'PCS', factor: 1 },
    枚: { dimension: 'PCS', factor: 1 },
    片: { dimension: 'PCS', factor: 1 },
    粒: { dimension: 'PCS', factor: 1 },
    颗: { dimension: 'PCS', factor: 1 },
    条: { dimension: 'PCS', factor: 1 },
    块: { dimension: 'PCS', factor: 1 },
    支: { dimension: 'PCS', factor: 1 },
    根: { dimension: 'PCS', factor: 1 },
    份: { dimension: 'PCS', factor: 1 },
    包: { dimension: 'PCS', factor: 1 },
    袋: { dimension: 'PCS', factor: 1 },
    盒: { dimension: 'PCS', factor: 1 },
    瓶: { dimension: 'PCS', factor: 1 },
    罐: { dimension: 'PCS', factor: 1 },
    卷: { dimension: 'PCS', factor: 1 },
  };

const normalizeUnitKey = (unit: string): string => {
  const trimmed = unit.trim();
  // 拉丁字母单位不分大小写（ML / Ml / ml 都是毫升）；中文原样
  return /^[A-Za-z]+$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
};

/**
 * 把「值 + 单位」折算成原料的基准单位。
 *
 * @example
 * normalizeNetContentToBaseUnit({ value: 1, unit: 'kg' }, 'G')  // { ok: true, inBaseUnit: 1000 }
 * normalizeNetContentToBaseUnit({ value: 330, unit: 'ml' }, 'G') // { ok: false, reason: 'CROSS_DIMENSION' }
 */
export function normalizeNetContentToBaseUnit(
  input: { value: number | null | undefined; unit: string | null | undefined },
  baseUnit: BaseUnitCode,
): NetContentNormalizeResult {
  const { value, unit } = input;

  if (value === null || value === undefined) {
    return { ok: false, reason: 'MISSING' };
  }

  if (typeof unit !== 'string' || unit.trim().length === 0) {
    return { ok: false, reason: 'MISSING' };
  }

  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: 'INVALID_VALUE' };
  }

  const hit = UNIT_DIMENSION[normalizeUnitKey(unit)];

  if (!hit) {
    return { ok: false, reason: 'UNSUPPORTED_UNIT' };
  }

  if (hit.dimension !== baseUnit) {
    return { ok: false, reason: 'CROSS_DIMENSION' };
  }

  return { ok: true, inBaseUnit: value * hit.factor };
}

/**
 * 拼「规格」文案，写进 `productModel`。
 *
 * @example
 * composePackSpec({ packCount: 24, value: 330, unit: 'ml' }) // '24×330ml'
 * composePackSpec({ packCount: 1, value: 1, unit: 'kg' })     // '1kg'
 */
export function composePackSpec(input: {
  packCount: number;
  value: number;
  unit: string;
}): string {
  const { packCount, value, unit } = input;
  const amount = `${value}${unit}`;
  return packCount > 1 ? `${packCount}×${amount}` : amount;
}

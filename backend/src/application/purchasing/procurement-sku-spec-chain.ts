/**
 * 采购商品的「规格链」归一化（2026-11-09）。
 *
 * 背景：包装上的规格不止「一件 × 一个重量」这一种写法，例如
 *   · 盒马鸡蛋「30枚 1.59kg」—— 30 个、**整盒一共** 1.59kg，单个重量没印
 *   · 牛奶「24×330ml」—— 24 瓶、每瓶 330ml
 *   · 纸巾「10捆×50张」—— 一箱 10 捆、每捆 50 张
 * 老表单只有「件数 × 每件重量」两格，遇到第一种写法只能把 1.59kg 当成
 * 一枚的重量，于是 30 × 1590 = 47.7 公斤一盒鸡蛋。
 *
 * 这里把「一采购单位 = 若干层 × 最后一层折算成基准单位」统一成一条链：
 *   [ {count:30, unit:'枚'}, {count:53, unit:'克'} ]  → 30 × 53 = 1590 克
 *
 * 三条硬约束（沿用「账目准确优先」）：
 *   1. **只算不猜**：每一层都必须是包装上印出来的；要除的地方由这里做，
 *      并且标记 source='derived'，让页面能写"按整件总重折算，请核对"；
 *   2. **整件总重优先**：包装既印了单件重量又印了整件总重时，以总重为准
 *      （总重通常印得更大更清楚），对不上就按总重反算每件；
 *   3. 折算不出基准单位就判失败（ok:false），调用方塞进 missing，让员工手填。
 */

import {
  normalizeNetContentToBaseUnit,
  type BaseUnitCode,
} from './procurement-sku-net-content';

export interface SpecLink {
  count: number;
  unit: string;
}

/** printed = 每件重量包装上印着；derived = 用整件总重除出来的 */
export type SpecChainSource = 'printed' | 'derived';

export interface ResolvedSpecChain {
  /** 最后一层一定是基准单位（克 / 毫升 / 个） */
  links: SpecLink[];
  /** 除最后一层之外的连乘：一采购单位里有多少个"件"（单件商品为 1） */
  packCount: number;
  /** 最后一层的数量，已折算成基准单位 */
  perUnitAmount: number;
  /** 一采购单位合计 = packCount × perUnitAmount */
  totalInBaseUnit: number;
  /** 最后一层的单位文案：按个记账时尽量保留包装上的「张/枚」 */
  amountUnitText: string;
  source: SpecChainSource;
}

export type SpecChainFailure = 'NO_LINKS' | 'INVALID_LINKS' | 'NO_BASE_AMOUNT';

export type SpecChainResolution =
  | { ok: true; value: ResolvedSpecChain }
  | { ok: false; reason: SpecChainFailure };

export const BASE_UNIT_LABEL: Record<BaseUnitCode, string> = {
  G: '克',
  ML: '毫升',
  PCS: '个',
};

/** 相对误差超过 1%（且绝对差超过 0.5）就算"对不上" */
const near = (left: number, right: number): boolean => {
  const diff = Math.abs(left - right);
  if (diff <= 0.5) return true;
  return diff / Math.max(Math.abs(left), Math.abs(right)) <= 0.01;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toPositiveNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

export const parseSpecLinks = (raw: unknown): SpecLink[] => {
  if (!Array.isArray(raw)) return [];

  const links: SpecLink[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const count = toPositiveNumber(item.count);
    const unit = typeof item.unit === 'string' ? item.unit.trim() : '';
    if (count === null || unit.length === 0) continue;
    links.push({ count, unit });
  }
  return links;
};

/**
 * 把模型读到的规格链收口成「可入库的一条换算」。
 *
 * @example
 * resolveSpecChain({
 *   links: [{ count: 30, unit: '枚' }],
 *   totalNetContent: { value: 1.59, unit: 'kg' },
 *   baseUnit: 'G',
 * })
 * // ok: true, perUnitAmount: 53, packCount: 30, source: 'derived'
 */
export function resolveSpecChain(input: {
  links: unknown;
  totalNetContent?: { value: unknown; unit: unknown } | null;
  baseUnit: BaseUnitCode;
}): SpecChainResolution {
  const links = parseSpecLinks(input.links);
  if (links.length === 0) {
    return { ok: false, reason: 'NO_LINKS' };
  }

  const last = links[links.length - 1];
  const lastNormalized = normalizeNetContentToBaseUnit(
    { value: last.count, unit: last.unit },
    input.baseUnit,
  );

  const countLinks = lastNormalized.ok ? links.slice(0, -1) : links;
  const packCount = countLinks.reduce((product, link) => product * link.count, 1);

  // 件数只能是整数：1.5 箱这种在账上说不清（库存会变成半个件），宁可不认
  if (
    !Number.isFinite(packCount) ||
    packCount <= 0 ||
    Math.abs(packCount - Math.round(packCount)) > 1e-6
  ) {
    return { ok: false, reason: 'INVALID_LINKS' };
  }

  const total = normalizeNetContentToBaseUnit(
    {
      value: toPositiveNumber(input.totalNetContent?.value),
      unit:
        typeof input.totalNetContent?.unit === 'string'
          ? input.totalNetContent.unit.trim()
          : null,
    },
    input.baseUnit,
  );
  const totalInBaseUnit = total.ok ? total.inBaseUnit : null;

  let perUnitAmount: number | null = lastNormalized.ok
    ? lastNormalized.inBaseUnit
    : null;
  let source: SpecChainSource = 'printed';

  if (totalInBaseUnit !== null) {
    if (perUnitAmount === null) {
      // 只印了整件总重（30枚 1.59kg）：除一下得到每件，标记为折算
      perUnitAmount = totalInBaseUnit / packCount;
      source = 'derived';
    } else if (!near(perUnitAmount * packCount, totalInBaseUnit)) {
      // 链条和整件总重对不上：以总重为准，不能让 30 倍错误静默进账
      perUnitAmount = totalInBaseUnit / packCount;
      source = 'derived';
    }
  }

  if (perUnitAmount === null || perUnitAmount <= 0) {
    return { ok: false, reason: 'NO_BASE_AMOUNT' };
  }

  const rounded = round2(perUnitAmount);
  const roundedPackCount = Math.round(packCount * 1000) / 1000;

  // 按个记账时单位换算是 1:1（1 张 = 1 个），保留包装上的说法更好读；
  // 按克/毫升记账时数字被换算过（1kg → 1000），单位必须跟着改成基准单位。
  const amountUnitText =
    input.baseUnit === 'PCS' && lastNormalized.ok
      ? last.unit
      : BASE_UNIT_LABEL[input.baseUnit];

  return {
    ok: true,
    value: {
      links: [...countLinks, { count: rounded, unit: amountUnitText }],
      amountUnitText,
      packCount: roundedPackCount,
      perUnitAmount: rounded,
      totalInBaseUnit: round2(rounded * roundedPackCount),
      source,
    },
  };
}

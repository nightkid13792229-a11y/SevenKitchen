/**
 * 补剂比价：把「一瓶多少钱」算成「每 1000 单位有效成分多少钱」，并排序、给推荐。
 *
 * 三条不能含糊的：
 * 1. 矿物质按**元素量**（标签上的 elemental amount），不按化合物总量；
 *    鱼油按 **EPA+DHA 合计**；维生素按标示量（A/D/E 用 IU）。
 * 2. 缺任何一格就**算不出**，不猜、不拿 0 充数；算不出的不参与排序，但不淘汰。
 * 3. 推荐只看**同一形态档位**里能算出单价的最便宜那瓶；跨档便宜不算数。
 *
 * 这里不碰网络、不碰数据库：给一组事实，算排序与结论。
 */

export type PriceBasisUnit = 'MG' | 'IU' | 'CFU'

export interface PriceBasisRule {
  nutrientKey: string
  /** 计价单位的量纲 */
  unit: PriceBasisUnit
  /** 折算到多少单位比价：MG/IU 用 1000，CFU 用 10 亿 */
  per: number
  /** 表头用：按什么算（元素量 / EPA+DHA 合计 / 标示量） */
  basisLabel: string
  /** 结果单位展示：mg / IU / 亿 CFU */
  amountUnitLabel: string
  /** 标签上要把哪些行加起来 */
  fieldPaths: string[]
}

export interface LabelNutrient {
  fieldPath: string
  value: number
  unit: string
}

export type OfferMissing =
  | 'PRICE'
  | 'UNITS_PER_BOTTLE'
  | 'SERVING_UNITS'
  | 'AMOUNT'
  | 'COMPOUND_PRODUCT'

export interface OfferFacts {
  url: string
  name: string
  /** 商品页标价（人民币）；读不到就是 null */
  priceCny: number | null
  /** 一瓶多少粒/片/胶囊（从标题或商品规格读出） */
  unitsPerBottle: number | null
  /** 标签 Serving Size 后面那个数 */
  servingUnitsPerDose: number | null
  /** 每份有效成分，已按口径取好（元素量 / EPA+DHA 合计 / 标示量） */
  amountPerServing: number | null
  /** 形态档位；不知道就 null */
  formLevel: string | null
  /** 一瓶里十几种营养素的复合配方：比不了单价 */
  compound: boolean
}

export interface RankedOffer extends OfferFacts {
  servingsPerBottle: number | null
  pricePerServing: number | null
  pricePerThousand: number | null
  missing: OfferMissing[]
  /** 与本次选定的形态档位一致 */
  sameForm: boolean
}

/** 这三个维生素在档案里按 IU 记，标签也常按 IU 标。 */
const IU_VITAMINS = new Set(['vitamins.vitaminA', 'vitamins.vitaminD', 'vitamins.vitaminE']);

export function resolvePriceBasis(nutrientKey: string): PriceBasisRule {
  if (nutrientKey === 'fattyAcids.epa' || nutrientKey === 'fattyAcids.dha') {
    return {
      nutrientKey,
      unit: 'MG',
      per: 1000,
      basisLabel: 'EPA+DHA 合计',
      amountUnitLabel: 'mg',
      fieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
    };
  }

  if (nutrientKey.startsWith('minerals.')) {
    return {
      nutrientKey,
      unit: 'MG',
      per: 1000,
      basisLabel: '元素量',
      amountUnitLabel: 'mg',
      fieldPaths: [nutrientKey],
    };
  }

  if (IU_VITAMINS.has(nutrientKey)) {
    return {
      nutrientKey,
      unit: 'IU',
      per: 1000,
      basisLabel: '标示量',
      amountUnitLabel: 'IU',
      fieldPaths: [nutrientKey],
    };
  }

  return {
    nutrientKey,
    unit: 'MG',
    per: 1000,
    basisLabel: '标示量',
    amountUnitLabel: 'mg',
    fieldPaths: [nutrientKey],
  };
}

/** 质量单位 → 毫克；只认这几个，别的一律 null。 */
const MASS_TO_MG: Record<string, number> = {
  g: 1000,
  mg: 1,
  mcg: 0.001,
  'µg': 0.001,
  'μg': 0.001,
};

function toBasisAmount(value: number, unit: string, rule: PriceBasisRule): number | null {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  const normalized = unit.trim().toLowerCase();

  if (rule.unit === 'MG') {
    const factor = MASS_TO_MG[normalized];
    return factor === undefined ? null : value * factor;
  }
  if (rule.unit === 'IU') {
    return normalized === 'iu' ? value : null;
  }
  // CFU：标签上常写 billion / 亿
  if (normalized === 'billion' || normalized === 'billion cfu' || normalized === '亿') {
    return value * 1e9;
  }
  return null;
}

/**
 * 把命中的行加起来，再换到口径单位。
 * 有一行单位看不懂就整体 null——宁可算不出，也不要少加一行悄悄给出低价。
 */
export function sumBasisAmount(
  nutrients: LabelNutrient[],
  rule: PriceBasisRule,
): number | null {
  const wanted = new Set(rule.fieldPaths);
  const hits = nutrients.filter((item) => wanted.has(item.fieldPath));
  if (hits.length === 0) {
    return null;
  }

  let total = 0;
  for (const hit of hits) {
    const amount = toBasisAmount(hit.value, hit.unit, rule);
    if (amount === null) {
      return null;
    }
    total += amount;
  }
  return total;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function positve(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function rankOffers(
  offers: OfferFacts[],
  wantedLevel: string | null,
): RankedOffer[] {
  const ranked = offers.map((offer) => {
    const missing: OfferMissing[] = [];

    if (offer.compound) {
      missing.push('COMPOUND_PRODUCT');
    }
    if (!positve(offer.priceCny)) {
      missing.push('PRICE');
    }
    if (!positve(offer.unitsPerBottle)) {
      missing.push('UNITS_PER_BOTTLE');
    }
    if (!positve(offer.servingUnitsPerDose)) {
      missing.push('SERVING_UNITS');
    }
    if (!positve(offer.amountPerServing)) {
      missing.push('AMOUNT');
    }

    const computable =
      positve(offer.priceCny) &&
      positve(offer.unitsPerBottle) &&
      positve(offer.servingUnitsPerDose) &&
      positve(offer.amountPerServing) &&
      !offer.compound;

    const servingsPerBottle = computable
      ? round(offer.unitsPerBottle! / offer.servingUnitsPerDose!, 4)
      : null;
    const pricePerServing =
      computable && servingsPerBottle ? round(offer.priceCny! / servingsPerBottle, 4) : null;
    const pricePerThousand =
      computable && pricePerServing !== null && offer.amountPerServing
        ? round((pricePerServing / offer.amountPerServing) * 1000, 4)
        : null;

    return {
      ...offer,
      servingsPerBottle,
      pricePerServing,
      pricePerThousand,
      missing,
      sameForm: wantedLevel === null || offer.formLevel === wantedLevel,
    } satisfies RankedOffer;
  });

  const order = new Map(ranked.map((row, index) => [row.url, index]));

  return [...ranked].sort((a, b) => {
    // ① 同档位的排前面
    if (a.sameForm !== b.sameForm) {
      return a.sameForm ? -1 : 1;
    }
    // ② 算得出的排前面（算不出不是"贵"，但也不能参与比价）
    const aPriced = a.pricePerThousand !== null;
    const bPriced = b.pricePerThousand !== null;
    if (aPriced !== bPriced) {
      return aPriced ? -1 : 1;
    }
    // ③ 都算得出：便宜的在前
    if (aPriced && bPriced) {
      const diff = (a.pricePerThousand as number) - (b.pricePerThousand as number);
      if (diff !== 0) {
        return diff;
      }
    }
    return (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0);
  });
}

export function recommendOffer(
  ranked: RankedOffer[],
  rule: PriceBasisRule,
): { url: string | null; reason: string } {
  const eligible = ranked.filter(
    (row) =>
      row.sameForm && row.pricePerThousand !== null && !row.missing.includes('COMPOUND_PRODUCT'),
  );

  if (eligible.length === 0) {
    return { url: null, reason: '这些商品都比不出单价，先核对价格或标签，别按估计值选' };
  }

  const cheapest = eligible.reduce((best, row) =>
    (row.pricePerThousand as number) < (best.pricePerThousand as number) ? row : best,
  );

  const price = (cheapest.pricePerThousand as number).toFixed(2);
  const suffix =
    eligible.length > 1 ? `；同批 ${eligible.length} 瓶里最便宜` : '；同批里只有它算得出单价';

  // 名字由页面单独显示（「建议这瓶：…」），理由里不再重复一遍
  return {
    url: cheapest.url,
    reason: `每 ${rule.per}${rule.amountUnitLabel} 合 ¥${price}${suffix}`,
  };
}

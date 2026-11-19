/**
 * 把「抓回来的一页商品」组装成比价要用的那一行事实。
 *
 * 只做三件事：认每瓶几粒、认是不是复合配方、把营养素按口径加起来。
 * 抓取与容错在 fetcher 里，这里必须能离线单测。
 */
import {
  sumBasisAmount,
  type LabelNutrient,
  type OfferFacts,
  type PriceBasisRule,
} from './supplement-offer-ranking';

export interface OfferAssemblyInput {
  url: string;
  name: string;
  priceCny: number | null;
  /** 一瓶多少粒/片（从标题或规格读出） */
  unitsPerBottle: number | null;
  servingUnitsPerDose: number | null;
  nutrients: LabelNutrient[];
  formLevel: string | null;
}

export type OfferAssemblyResult =
  | { ok: true; offer: OfferFacts }
  | { ok: false; url: string; name: string; reason: string };

/** 一瓶里认得出来的营养素超过这个数，就按复合配方处理——比不了「每单位某营养素」的价。 */
const COMPOUND_MIN_ROWS = 5;

/** 只用于提示文案：认不出的键退化成键名本身。 */
const NUTRIENT_LABELS: Record<string, string> = {
  'minerals.calcium': '钙',
  'minerals.phosphorus': '磷',
  'minerals.potassium': '钾',
  'minerals.sodium': '钠',
  'minerals.magnesium': '镁',
  'minerals.iron': '铁',
  'minerals.zinc': '锌',
  'minerals.copper': '铜',
  'minerals.manganese': '锰',
  'minerals.selenium': '硒',
  'minerals.iodine': '碘',
  'vitamins.vitaminA': '维生素 A',
  'vitamins.vitaminD': '维生素 D',
  'vitamins.vitaminE': '维生素 E',
  'vitamins.vitaminC': '维生素 C',
  'fattyAcids.epa': 'EPA',
  'fattyAcids.dha': 'DHA',
};

export function nutrientLabelOf(fieldPath: string): string {
  return NUTRIENT_LABELS[fieldPath] ?? fieldPath.split('.').pop() ?? fieldPath;
}

const COUNT_UNIT =
  /^(\d[\d,]*)\s*(softgels?|tablets?|capsules?|veg(?:gie)?\s*capsules?|gummies?|count|片|粒|胶囊|颗)/i;

/**
 * 从商品规格里读每瓶多少粒。
 *
 * 只认**计数单位**；`2 fl oz`、`1 g` 这类重量规格一律不认——
 * 拿 2 当成"每瓶 2 粒"会把单价算成天价。
 */
export function parseUnitsPerBottle(productModel: string | null | undefined): number | null {
  const text = String(productModel ?? '').trim();
  if (!text) {
    return null;
  }
  const match = text.match(COUNT_UNIT);
  if (!match) {
    return null;
  }
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function buildOfferFacts(
  input: OfferAssemblyInput,
  rule: PriceBasisRule,
): OfferAssemblyResult {
  const knownKeys = new Set(input.nutrients.map((item) => item.fieldPath));
  const compound = knownKeys.size >= COMPOUND_MIN_ROWS;

  if (compound) {
    return {
      ok: true,
      offer: {
        url: input.url,
        name: input.name,
        priceCny: input.priceCny,
        unitsPerBottle: input.unitsPerBottle,
        servingUnitsPerDose: input.servingUnitsPerDose,
        // 复合配方没有「每份某营养素」这一说，不给数
        amountPerServing: null,
        formLevel: input.formLevel,
        compound: true,
      },
    };
  }

  const amount = sumBasisAmount(input.nutrients, rule);
  if (amount === null) {
    return {
      ok: false,
      url: input.url,
      name: input.name,
      reason: `标签里没有${nutrientLabelOf(rule.nutrientKey)}，或这一行的单位认不出`,
    };
  }

  return {
    ok: true,
    offer: {
      url: input.url,
      name: input.name,
      priceCny: input.priceCny,
      unitsPerBottle: input.unitsPerBottle,
      servingUnitsPerDose: input.servingUnitsPerDose,
      amountPerServing: amount,
      formLevel: input.formLevel,
      compound: false,
    },
  };
}

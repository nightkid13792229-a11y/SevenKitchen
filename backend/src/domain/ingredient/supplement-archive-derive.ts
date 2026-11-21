/**
 * 从识别结果里**算**出来的字段：能用原文算的，就不让模型猜。
 *
 * 三个容易出错的：
 * 1. 产品规格——人要看的是「180粒/瓶，18mg铁/粒」，不是页面标题；
 * 2. 采购价——模型可能没写，但原文里只要出现 ¥ 就能抠出来；
 * 3. 标签类型——挂靠哪本目录是硬规则，不该靠模型心情。
 */

export interface PackSpecInput {
  perBottleUnits: number | null;
  unitLabel: string;
  /** 每份多少个基准单位（粒 / 克 / 毫升） */
  servingUnits?: number | null;
  nutrients: { label: string | null; amount: number | null; unit: string }[];
}

/**
 * 产品规格，写成**人读得懂**的一句：
 * - 胶囊/片剂、每份 1 粒：`180粒/瓶，18mg铁/粒`
 * - 胶囊/片剂、每份 2 粒：`180粒/瓶，每份2粒含18mg铁`
 * - 粉/液体：`227g/瓶，每份0.9g含0.875g牛磺酸`
 *
 * 注意：营养素含量是**每份**的，不要再除一次基准单位。
 */
export function buildPackSpec(input: PackSpecInput): string | null {
  const count = input.perBottleUnits;
  if (!count || count <= 0) {
    return null;
  }
  const unit = input.unitLabel || '粒';
  const serving = input.servingUnits ?? null;
  const first = input.nutrients.find((item) => item.amount !== null && item.amount > 0);
  if (!first || !first.label || first.amount === null) {
    return `${count}${unit}/瓶`;
  }
  const amount = String(Math.round(first.amount * 1000) / 1000);
  const nutrient = `${amount}${first.unit}${first.label}`;

  if (unit !== 'g' && unit !== 'ml' && (!serving || serving === 1)) {
    return `${count}${unit}/瓶，${nutrient}/${unit}`;
  }
  if (unit !== 'g' && unit !== 'ml') {
    return `${count}${unit}/瓶，每份${serving}${unit}含${nutrient}`;
  }
  const servingText = serving && serving > 0 ? `每份${serving}${unit}含` : '';
  return `${count}${unit}/瓶，${servingText}${nutrient}`;
}

/** 从文字里抠人民币价格：先认「¥77.02」，再认「价格：77.02」。 */
export function extractPriceCny(text: string): number | null {
  const source = String(text ?? '');
  const withSymbol = source.match(/[¥￥]\s*([0-9]+(?:\.[0-9]+)?)/);
  if (withSymbol) {
    return Number(withSymbol[1]);
  }
  const withLabel = source.match(/(?:价格|售价|到手价)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/);
  return withLabel ? Number(withLabel[1]) : null;
}

export type LabelCategory = 'FEED_ADDITIVE' | 'FEED_MATERIAL';

/**
 * 标签类型：命中原料目录 → 原料；命中添加剂目录 → 添加剂；两边都中时听模型的，
 * 都没中就留空（不硬塞）。
 */
export function inferLabelCategory(input: {
  modelSaid: LabelCategory | null;
  additiveMatched: boolean;
  materialMatched: boolean;
}): LabelCategory | null {
  if (input.modelSaid && input.additiveMatched !== input.materialMatched) {
    return input.additiveMatched ? 'FEED_ADDITIVE' : 'FEED_MATERIAL';
  }
  if (input.modelSaid) {
    return input.modelSaid;
  }
  if (input.materialMatched && !input.additiveMatched) {
    return 'FEED_MATERIAL';
  }
  if (input.additiveMatched && !input.materialMatched) {
    return 'FEED_ADDITIVE';
  }
  return null;
}

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
  nutrients: { label: string | null; amount: number | null; unit: string }[];
}

/** 「180粒/瓶，18mg铁/粒」；没有含量就只写瓶规。 */
export function buildPackSpec(input: PackSpecInput): string | null {
  const count = input.perBottleUnits;
  if (!count || count <= 0) {
    return null;
  }
  const unit = input.unitLabel || '粒';
  const first = input.nutrients.find((item) => item.amount !== null && item.amount > 0);
  if (!first || !first.label) {
    return `${count}${unit}/瓶`;
  }
  const amount = Number.isInteger(first.amount)
    ? String(first.amount)
    : String(first.amount).replace(/0+$/, '');
  return `${count}${unit}/瓶，${amount}${first.unit}${first.label}/${unit}`;
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

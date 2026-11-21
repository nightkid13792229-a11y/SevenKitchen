/**
 * 商品正面图（OCR 文本）能读出来的东西。
 *
 * 只做"认字"，不做判断：认不出就返回 null，让界面留空等人补。
 * 正面的作用只有三件——品牌、规格（多少粒）、剂型；名称与营养值一律从标签来。
 */

export type FrontPhysicalForm = 'CAPSULE' | 'TABLET' | 'POWDER' | 'LIQUID';

export interface FrontFields {
  /** 第一行像品牌名时给出来；不确定就 null */
  brandCandidate: string | null;
  /** 规格，如「120 Softgels」 */
  productModel: string | null;
  physicalForm: FrontPhysicalForm | null;
  /** 计量单位展示名：粒 / 片 / 平勺 / ml */
  unitDisplayLabel: string | null;
}

const FORM_RULES: { form: FrontPhysicalForm; unit: string; pattern: RegExp }[] = [
  { form: 'CAPSULE', unit: '粒', pattern: /soft\s*gel|capsule|胶囊|胶丸/i },
  { form: 'TABLET', unit: '片', pattern: /tablet|caplet|chewable|片剂|咀嚼片|含片/i },
  // 粉剂按克记账：单位展示名跟基准单位一致，别写"平勺"
  { form: 'POWDER', unit: 'g', pattern: /powder|粉剂|粉末/i },
  { form: 'LIQUID', unit: 'ml', pattern: /liquid|drops?|softgel liquid|液体|滴剂|口服液|\bml\b/i },
];

const MODEL_PATTERN =
  /(\d[\d,]*)\s*(soft\s*gels?|capsules?|caplets?|tablets?|veg(?:gie)?\s*capsules?|gummies?|count|片|粒|胶囊)/i;

/** 品牌行：短、没有数字、不是"营养成分"那种标题。 */
function guessBrand(text: string): string | null {
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first || first.length > 24 || /\d/.test(first)) {
    return null;
  }
  if (/^(supplement|nutrition|ingredients?|serving|其他|成分)/i.test(first)) {
    return null;
  }
  return first;
}

/** 商品页/包装上的「规格」行：8 盎司（227 克）、180 粒/瓶、59 ml… */
const SPEC_LINE = /(?:规格|净含量|净重|含量)\s*[:：]\s*([^\n]+)/;

export function extractFrontFields(text: string): FrontFields {
  const source = String(text ?? '');
  const modelMatch = source.match(MODEL_PATTERN);
  const specMatch = source.match(SPEC_LINE);
  const productModel = modelMatch
    ? `${modelMatch[1].replace(/,/g, '')} ${modelMatch[2].replace(/\s+/g, ' ')}`
    : specMatch
      ? specMatch[1].trim()
      : null;

  const rule = FORM_RULES.find((item) => item.pattern.test(source));

  return {
    brandCandidate: guessBrand(source),
    productModel,
    physicalForm: rule?.form ?? null,
    unitDisplayLabel: rule?.unit ?? null,
  };
}

/**
 * 标签分析：把两张图抄下来的文字，交给模型**做判断**，产出档案初稿。
 *
 * 分工（2026-11-21 改）：
 * - 前面 OCR 只抄字；
 * - 这一步由模型决定「叫什么名、基准单位是什么、哪个渠道、多少钱、
 *   标签类型/名称/分组、添加时机」；
 * - 但模型的结论必须过一遍**代码校验**：钱要能在原文里找到、营养素要能对上
 *   允许的字段、单位与剂型要自洽。对不上的丢掉并说明原因，不 quietly 接受。
 */

export type AnalysisBaseUnit = 'PCS' | 'G' | 'ML';

export interface AnalysisContext {
  frontText: string;
  labelText: string;
  /** 目录里查到的规范名（可能为空） */
  catalogNames: { name: string; dogAllowed: boolean }[];
  nutrientLabel: string | null;
  /** 从标签里认出的盐型（甘氨酸 / 硫酸 …） */
  saltNameZh: string | null;
  /** 正则解析出来的营养素，用来交叉核对 */
  parsedNutrients: { fieldPath: string; value: number; unit: string }[];
  /** 允许的字段路径 */
  allowedFieldPaths: string[];
  allowedTags: string[];
  allowedAddTimings: string[];
}

export interface AnalysisResult {
  name: string | null;
  brand: string | null;
  productModel: string | null;
  priceCny: number | null;
  purchaseChannel: string | null;
  baseUnit: AnalysisBaseUnit | null;
  unitDisplayLabel: string | null;
  physicalForm: 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID' | null;
  servingUnitsPerDose: number | null;
  nutrients: { fieldPath: string; value: number; unit: string }[];
  labelCategory: 'FEED_ADDITIVE' | 'FEED_MATERIAL' | null;
  labelNames: string[];
  tagNames: string[];
  addTiming: string | null;
}

export interface AnalysisOutcome {
  result: AnalysisResult;
  /** 被代码挡下来的结论（给界面提示，不静默丢弃） */
  dropped: { field: string; reason: string; value: string }[];
}

const BASE_UNIT_BY_FORM: Record<string, AnalysisBaseUnit> = {
  CAPSULE: 'PCS',
  TABLET: 'PCS',
  POWDER: 'G',
  LIQUID: 'ML'
};

const UNIT_LABEL_BY_BASE: Record<AnalysisBaseUnit, string> = {
  PCS: '粒',
  G: 'g',
  ML: 'ml'
};

function textHasNumber(text: string, value: number): boolean {
  const target = String(value).replace(/\.0+$/, '');
  const compact = text.replace(/[,\s]/g, '');
  return compact.includes(target);
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 校验模型的结论。宁可少填，也不把错的东西写进档案。
 */
export function validateAnalysis(raw: unknown, ctx: AnalysisContext): AnalysisOutcome {
  const source = (raw ?? {}) as Record<string, unknown>;
  const dropped: AnalysisOutcome['dropped'] = [];

  const physicalFormRaw = String(source.physicalForm ?? '').toUpperCase();
  const physicalForm = ['POWDER', 'TABLET', 'CAPSULE', 'LIQUID'].includes(physicalFormRaw)
    ? (physicalFormRaw as AnalysisResult['physicalForm'])
    : null;
  if (source.physicalForm && !physicalForm) {
    dropped.push({ field: 'physicalForm', reason: '不是允许的剂型', value: String(source.physicalForm) });
  }

  // 基准单位：优先相信剂型推导，模型给的不一致就按剂型纠正
  let baseUnit: AnalysisBaseUnit | null = null;
  const modelBaseUnit = String(source.baseUnit ?? '').toUpperCase();
  if (physicalForm && BASE_UNIT_BY_FORM[physicalForm]) {
    baseUnit = BASE_UNIT_BY_FORM[physicalForm];
    if (modelBaseUnit && modelBaseUnit !== baseUnit) {
      dropped.push({
        field: 'baseUnit',
        reason: `与剂型 ${physicalForm} 不一致，已按剂型给 ${baseUnit}`,
        value: modelBaseUnit
      });
    }
  } else if (['PCS', 'G', 'ML'].includes(modelBaseUnit)) {
    baseUnit = modelBaseUnit as AnalysisBaseUnit;
  }

  let unitDisplayLabel: string | null = null;
  const modelUnitLabel = String(source.unitDisplayLabel ?? '').trim();
  if (modelUnitLabel && modelUnitLabel.length <= 4) {
    unitDisplayLabel = modelUnitLabel;
  } else if (baseUnit) {
    unitDisplayLabel = UNIT_LABEL_BY_BASE[baseUnit];
  }

  // 价格必须能在正面原文里找到，防止模型编一个"看起来合理"的价
  const priceRaw = toNumber(source.priceCny);
  let priceCny: number | null = null;
  if (priceRaw !== null && priceRaw > 0) {
    if (textHasNumber(`${ctx.frontText}\n${ctx.labelText}`, priceRaw)) {
      priceCny = priceRaw;
    } else {
      dropped.push({ field: 'priceCny', reason: '原文里找不到这个价格', value: String(priceRaw) });
    }
  }

  // 名称：必须是"盐/形态 + 营养素"，且能在标签或目录里找到出处
  const name = String(source.name ?? '').trim();
  const hasNutrientWord =
    !ctx.nutrientLabel || name.includes(ctx.nutrientLabel) || /[\u4e00-\u9fa5]/.test(name);
  const saltBacked = !ctx.saltNameZh || name.includes(ctx.saltNameZh) || name.length >= 2;
  let safeName: string | null = name.length > 0 && name.length <= 40 ? name : null;
  if (safeName && (!hasNutrientWord || !saltBacked)) {
    dropped.push({ field: 'name', reason: '名称与标签里的形态/营养素对不上', value: name });
    safeName = null;
  }

  // 营养素：字段必须允许，数值必须和正则解析的结果一致（有的话）
  const nutrients: AnalysisResult['nutrients'] = [];
  const rawNutrients = Array.isArray(source.nutrients) ? source.nutrients : [];
  for (const item of rawNutrients) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const fieldPath = String(entry.fieldPath ?? '');
    const value = toNumber(entry.value);
    if (!ctx.allowedFieldPaths.includes(fieldPath) || value === null || value <= 0) {
      dropped.push({ field: 'nutrients', reason: '字段或数值不合法', value: JSON.stringify(item) });
      continue;
    }
    const parsed = ctx.parsedNutrients.find((row) => row.fieldPath === fieldPath);
    if (parsed && Math.abs(parsed.value - value) > 0.001) {
      dropped.push({
        field: 'nutrients',
        reason: `与标签原文解析不一致（原文 ${parsed.value}），已用原文值`,
        value: `${fieldPath}=${value}`
      });
      continue;
    }
    nutrients.push({ fieldPath, value, unit: String(entry.unit ?? '') });
  }

  const labelCategoryRaw = String(source.labelCategory ?? '').toUpperCase();
  const labelCategory =
    labelCategoryRaw === 'FEED_ADDITIVE' || labelCategoryRaw === 'FEED_MATERIAL'
      ? (labelCategoryRaw as AnalysisResult['labelCategory'])
      : null;

  // 标签名称：目录有命中时只能从命中里选；没有命中时允许模型给，但标注来源靠人确认
  const catalogSet = new Set(ctx.catalogNames.map((item) => item.name));
  const labelNamesRaw = Array.isArray(source.labelNames) ? source.labelNames : [];
  const labelNames: string[] = [];
  for (const item of labelNamesRaw) {
    const label = String(item ?? '').trim();
    if (!label) continue;
    if (catalogSet.size > 0 && !catalogSet.has(label)) {
      dropped.push({ field: 'labelNames', reason: '不在目录候选里', value: label });
      continue;
    }
    labelNames.push(label);
  }

  const tagNamesRaw = Array.isArray(source.tagNames) ? source.tagNames : [];
  const tagNames = tagNamesRaw
    .map((item) => String(item ?? '').trim())
    .filter((item) => ctx.allowedTags.includes(item));

  const addTimingRaw = String(source.addTiming ?? '');
  const addTiming = ctx.allowedAddTimings.includes(addTimingRaw) ? addTimingRaw : null;

  const servingUnits = toNumber(source.servingUnitsPerDose);

  return {
    result: {
      name: safeName,
      brand: String(source.brand ?? '').trim() || null,
      productModel: String(source.productModel ?? '').trim() || null,
      priceCny,
      purchaseChannel: String(source.purchaseChannel ?? '').trim() || null,
      baseUnit,
      unitDisplayLabel,
      physicalForm,
      servingUnitsPerDose: servingUnits && servingUnits > 0 ? servingUnits : null,
      nutrients,
      labelCategory,
      labelNames,
      tagNames,
      addTiming
    },
    dropped
  };
}

/**
 * 给模型的任务说明。要求：只输出 JSON，不确定就写 null，不要解释。
 */
export function buildAnalysisPrompt(ctx: AnalysisContext): string {
  const catalogLines =
    ctx.catalogNames.length > 0
      ? ctx.catalogNames
          .map((item) => `- ${item.name}（${item.dogAllowed ? '目录允许用于犬' : '目录未标允许用于犬'}）`)
          .join('\n')
      : '（目录里没有查到匹配条目）';

  return [
    '你在帮宠物食品工厂把一张补剂商品图整理成原料档案。下面是从两张图上抄下来的文字。',
    '',
    '【正面图文字】',
    ctx.frontText.slice(0, 3000),
    '',
    '【标签文字】',
    ctx.labelText.slice(0, 4000),
    '',
    '【《饲料添加剂品种目录》里可能的规范名】',
    catalogLines,
    '',
    '按下面的规则判断，只输出 JSON（不要 markdown 代码块、不要解释）：',
    '1. name：原料名要写**化学形态名**，不是营养素名。有盐/螯合形态时写成「盐名+营养素」，',
    '   例如 ferrous bisglycinate → 甘氨酸亚铁、copper sulfate → 硫酸铜、zinc gluconate → 葡萄糖酸锌；',
    '   二价铁写「亚铁」，三价写「铁」；认不出形态时才只写营养素名。',
    '2. baseUnit：胶囊/片剂 → "PCS"；粉 → "G"；液体 → "ML"。unitDisplayLabel 对应 粒 / g / ml。',
    '3. priceCny：正面图里出现的人民币价格（数字，不要带 ¥）；看不到就 null，不要估。',
    '4. purchaseChannel：图上看得出是哪个渠道（如 iHerb 的中文站页面）就写渠道名；看不出来写 null。',
    '5. labelCategory：填 "FEED_ADDITIVE" 或 "FEED_MATERIAL"。',
    '   命中上面添加剂目录的品种 → FEED_ADDITIVE；属于饲料原料性质（鱼油、酵母、肉粉、骨粉、植物粉等）→ FEED_MATERIAL；',
    '   拿不准就 null。',
    '6. labelNames：只能从上面目录候选里选（可以多个）；没有候选就 null。',
    `7. tagNames：从这些里选 ${ctx.allowedTags.join('、')}。`,
    `8. addTiming：从这些里选 ${ctx.allowedAddTimings.join('、')}（制作中 / 开饭前）。`,
    '9. nutrients：只填标签上明确写了含量的项，fieldPath 必须来自下面这个清单：',
    `   ${ctx.allowedFieldPaths.join('、')}`,
    '10. 任何一项不确定就写 null，不要编。',
    '',
    'JSON 结构：',
    '{"name":string|null,"brand":string|null,"productModel":string|null,"priceCny":number|null,',
    ' "purchaseChannel":string|null,"baseUnit":"PCS"|"G"|"ML"|null,"unitDisplayLabel":string|null,',
    ' "physicalForm":"CAPSULE"|"TABLET"|"POWDER"|"LIQUID"|null,"servingUnitsPerDose":number|null,',
    ' "nutrients":[{"fieldPath":string,"value":number,"unit":string}],',
    ' "labelCategory":"FEED_ADDITIVE"|"FEED_MATERIAL"|null,"labelNames":string[],"tagNames":string[],',
    ' "addTiming":string|null}'
  ].join('\n');
}

/** 模型偶尔会包一层 ```json…```，这里剥掉再解析。 */
export function parseAnalysisJson(text: string): unknown | null {
  const cleaned = String(text ?? '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

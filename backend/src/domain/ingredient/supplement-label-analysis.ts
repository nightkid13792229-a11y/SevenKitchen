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
  /** 《饲料添加剂品种目录》全量规范名（中文）——由模型自己翻译后匹配 */
  additiveCatalog: string[];
  /** 《饲料原料目录》全量规范名（中文） */
  materialCatalog: string[];
  nutrientLabel: string | null;
  /** 从标签里认出的盐型（甘氨酸 / 硫酸 …） */
  saltNameZh: string | null;
  /** 正则解析出来的营养素，用来交叉核对 */
  parsedNutrients: { fieldPath: string; value: number; unit: string }[];
  /** 允许的字段路径 + 中文名 + 单位（模型要按这个单位给值） */
  allowedFields: { fieldPath: string; label: string; unit: string }[];
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
  /** 每瓶多少个基准单位（粒 / 克 / 毫升）——由模型从正面图读 */
  perBottleUnits: number | null;
  /** 每份多少个基准单位（标签 Serving Size 换算到基准单位） */
  servingUnitsPerDose: number | null;
  nutrients: { fieldPath: string; value: number; unit: string }[];
  /** 每 1 个基准单位的含量（每粒 / 每克 / 每毫升） */
  perUnitNutrients: { fieldPath: string; value: number; unit: string }[];
  labelCategory: 'FEED_ADDITIVE' | 'FEED_MATERIAL' | null;
  labelNames: string[];
  tagNames: string[];
  addTiming: string | null;
  /** 这条补剂的默认目标营养素（必须是 nutrients 里出现过的字段） */
  defaultTargetFields: string[];
}

export interface AnalysisOutcome {
  /** 模型填的**全量**结果：不再因为对不上就留空 */
  result: AnalysisResult;
  /**
   * 代码核对出来的疑点（不再是"丢弃"，而是"填了但提醒你核对"）。
   * 界面直接展示，人看一眼就知道哪一项是模型自己推的、哪一项和原文不一致。
   */
  notes: { field: string; reason: string; value: string }[];
  /** 兼容旧调用点：与 notes 同源 */
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
  const notes: AnalysisOutcome['notes'] = [];

  const physicalFormRaw = String(source.physicalForm ?? '').toUpperCase();
  const physicalForm = ['POWDER', 'TABLET', 'CAPSULE', 'LIQUID'].includes(physicalFormRaw)
    ? (physicalFormRaw as AnalysisResult['physicalForm'])
    : null;
  if (source.physicalForm && !physicalForm) {
    notes.push({ field: 'physicalForm', reason: '模型给的剂型不在允许值里，已忽略', value: String(source.physicalForm) });
  }

  // 基准单位：优先相信剂型推导，模型给的不一致就按剂型纠正
  let baseUnit: AnalysisBaseUnit | null = null;
  const modelBaseUnit = String(source.baseUnit ?? '').toUpperCase();
  if (physicalForm && BASE_UNIT_BY_FORM[physicalForm]) {
    baseUnit = BASE_UNIT_BY_FORM[physicalForm];
    if (modelBaseUnit && modelBaseUnit !== baseUnit) {
      notes.push({
        field: 'baseUnit',
        reason: `模型给 ${modelBaseUnit}，与剂型 ${physicalForm} 不一致，已按剂型给 ${baseUnit}`,
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
    priceCny = priceRaw;
    if (!textHasNumber(`${ctx.frontText}\n${ctx.labelText}`, priceRaw)) {
      notes.push({
        field: 'priceCny',
        reason: '原文里没找到这个价格，可能是页面其它数字，请核对',
        value: String(priceRaw)
      });
    }
  }

  // 名称：必须是"盐/形态 + 营养素"，且能在标签或目录里找到出处
  const name = String(source.name ?? '').trim();
  const hasNutrientWord =
    !ctx.nutrientLabel || name.includes(ctx.nutrientLabel) || /[\u4e00-\u9fa5]/.test(name);
  const saltBacked = !ctx.saltNameZh || name.includes(ctx.saltNameZh) || name.length >= 2;
  let safeName: string | null = name.length > 0 ? name.slice(0, 40) : null;
  if (safeName && (!hasNutrientWord || !saltBacked)) {
    notes.push({
      field: 'name',
      reason: '名称与标签里的形态/营养素对不上，请核对',
      value: name
    });
  }

  // 营养素：字段必须允许，数值必须和正则解析的结果一致（有的话）
  const nutrients: AnalysisResult['nutrients'] = [];
  const rawNutrients = Array.isArray(source.nutrients) ? source.nutrients : [];
  for (const item of rawNutrients) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const fieldPath = String(entry.fieldPath ?? '');
    const value = toNumber(entry.value);
    if (!ctx.allowedFields.some((field) => field.fieldPath === fieldPath)) {
      notes.push({ field: 'nutrients', reason: '不是允许的营养素字段，已忽略', value: fieldPath });
      continue;
    }
    if (value === null || value <= 0) {
      continue;
    }
    const parsed = ctx.parsedNutrients.find((row) => row.fieldPath === fieldPath);
    if (parsed && Math.abs(parsed.value - value) > 0.001) {
      notes.push({
        field: 'nutrients',
        reason: `模型写 ${value}${String(entry.unit ?? '')}，原文解析是 ${parsed.value}${parsed.unit}，已按原文`,
        value: `${fieldPath}=${value}`
      });
      nutrients.push({ fieldPath, value: parsed.value, unit: parsed.unit });
      continue;
    }
    nutrients.push({ fieldPath, value, unit: String(entry.unit ?? '') });
  }
  // 模型漏掉的、原文里明明有的营养素，补上
  for (const parsed of ctx.parsedNutrients) {
    if (!nutrients.some((row) => row.fieldPath === parsed.fieldPath)) {
      nutrients.push({ fieldPath: parsed.fieldPath, value: parsed.value, unit: parsed.unit });
      notes.push({
        field: 'nutrients',
        reason: '模型没提到这一项，已按原文补上',
        value: `${parsed.fieldPath}=${parsed.value}${parsed.unit}`
      });
    }
  }

  // 每 1 个基准单位的含量：模型自己算，代码只核对除得回去
  const perUnitRaw = Array.isArray(source.perUnitNutrients) ? source.perUnitNutrients : [];
  const perUnitNutrients: AnalysisResult['perUnitNutrients'] = [];
  for (const item of perUnitRaw) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const fieldPath = String(entry.fieldPath ?? '');
    const value = toNumber(entry.value);
    if (!ctx.allowedFields.some((field) => field.fieldPath === fieldPath)) {
      continue;
    }
    if (value === null || value <= 0) {
      continue;
    }
    perUnitNutrients.push({ fieldPath, value, unit: String(entry.unit ?? '') });
  }
  const servingForCheck = toNumber(source.servingUnitsPerDose);
  if (servingForCheck && servingForCheck > 0) {
    for (const perUnit of perUnitNutrients) {
      const perServing = nutrients.find((row) => row.fieldPath === perUnit.fieldPath);
      if (!perServing) {
        continue;
      }
      const expected = perServing.value / servingForCheck;
      if (Math.abs(expected - perUnit.value) > Math.max(1e-4, expected * 0.01)) {
        notes.push({
          field: 'perUnitNutrients',
          reason: `每单位含量与「每份 × 份量」对不上（应为 ${Math.round(expected * 1000) / 1000}${perUnit.unit}），请核对`,
          value: `${perUnit.fieldPath}=${perUnit.value}`,
        });
      }
    }
  }

  // 默认目标营养素：只认自己列出来的营养素，模型不能凭空加
  const ownFieldPaths = new Set(nutrients.map((item) => item.fieldPath));
  const targetRaw = Array.isArray(source.defaultTargetFields) ? source.defaultTargetFields : [];
  const defaultTargetFields = targetRaw
    .map((item) => String(item ?? '').trim())
    .filter((item) => ownFieldPaths.has(item));

  const labelCategoryRaw = String(source.labelCategory ?? '').toUpperCase();
  const labelCategory =
    labelCategoryRaw === 'FEED_ADDITIVE' || labelCategoryRaw === 'FEED_MATERIAL'
      ? (labelCategoryRaw as AnalysisResult['labelCategory'])
      : null;

  // 标签名称：目录有命中时只能从命中里选；没有命中时允许模型给，但标注来源靠人确认
  const allCatalogNames = [...ctx.additiveCatalog, ...ctx.materialCatalog];
  const catalogSet = new Set(allCatalogNames);
  const stripBrackets = (value: string) => value.replace(/[（(][^）)]*[）)]/g, '').trim();
  // 「甘氨酸铁络（螯）合物」这种名字本身就带括号，剥括号后要能回到目录里的**官方写法**
  const officialByStripped = new Map(allCatalogNames.map((name) => [stripBrackets(name), name]));
  const labelNamesRaw = Array.isArray(source.labelNames) ? source.labelNames : [];
  const labelNames: string[] = [];
  for (const item of labelNamesRaw) {
    const raw = String(item ?? '').trim();
    if (!raw) continue;

    let official: string | null = null;
    if (catalogSet.has(raw)) {
      official = raw;
    } else {
      // 模型有时会把「鱼油（分类）」整句抄进来，或把「（螯）」吃掉
      official = officialByStripped.get(stripBrackets(raw)) ?? null;
    }

    if (!official && catalogSet.size === 0) {
      // 两本目录都没有候选时，允许模型的提案（人再看一眼）
      official = raw;
    }
    if (!official) {
      notes.push({ field: 'labelNames', reason: '目录里没对上，请核对规范名', value: raw });
      official = raw;
    }
    if (!labelNames.includes(official)) {
      labelNames.push(official);
    }
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
      perBottleUnits: (() => {
        const value = toNumber(source.perBottleUnits);
        return value !== null && value > 0 ? value : null;
      })(),
      servingUnitsPerDose: servingUnits && servingUnits > 0 ? servingUnits : null,
      nutrients,
      perUnitNutrients,
      labelCategory,
      labelNames,
      tagNames,
      addTiming,
      defaultTargetFields
    },
    notes,
    dropped: notes
  };
}

/**
 * 给模型的任务说明。要求：只输出 JSON，不确定就写 null，不要解释。
 */
export function buildAnalysisPrompt(ctx: AnalysisContext): string {
  const fieldLines = ctx.allowedFields
    .map((field) => `- ${field.fieldPath}（${field.label}，单位 ${field.unit}）`)
    .join('\n');

  return [
    '你在帮宠物食品工厂把补剂商品图整理成原料档案。下面是从两张图上抄下来的文字。',
    '',
    '【正面图文字】',
    ctx.frontText.slice(0, 3000),
    '',
    '【标签文字】',
    ctx.labelText.slice(0, 4000),
    '',
    '【《饲料添加剂品种目录》全部规范名（中文）】',
    ctx.additiveCatalog.join('、'),
    '',
    '【《饲料原料目录》全部规范名（中文）】',
    ctx.materialCatalog.join('、'),
    '',
    '按下面的规则自己判断，只输出 JSON（不要 markdown 代码块、不要解释）：',
    '',
    '1. name：写**化学形态名**，不是营养素名。有盐/螯合形态写成「盐名+营养素」：',
    '   ferrous bisglycinate → 甘氨酸亚铁，copper sulfate → 硫酸铜，zinc gluconate → 葡萄糖酸锌；',
    '   二价铁写「亚铁」，三价写「铁」；认不出形态才只写营养素名。',
    '',
    '2. baseUnit：胶囊/片剂 → "PCS"；粉 → "G"；液体 → "ML"。',
    '   unitDisplayLabel 与之一致：PCS 写「粒」，G 写「g」，ML 写「ml」。',
    '',
    '3. **perBottleUnits**：这一瓶有多少个基准单位。',
    '   - 胶囊/片剂：一瓶多少粒（正面「180 CAPSULES」→ 180）；',
    '   - 粉：净重多少克（「8 盎司（227 克）」→ 227；「500 g」→ 500）；',
    '   - 液体：多少毫升。读不出来写 null，**不要估**。',
    '',
    '4. **servingUnitsPerDose**：一次服用几个基准单位。',
    '   - 「Serving Size 1 Capsule」→ 1；「Serving Size 2 Softgels」→ 2；',
    '   - 粉：「Serving Size 1/4 Teaspoon (approx. 0.9 g)」→ **0.9**（换成克）；',
    '   - 液体：「Serving Size 5 ml」→ 5。读不出来写 null。',
    '',
    '5. priceCny：正面图里的人民币价格（只要数字）；没有写 null，不要估。',
    '6. purchaseChannel：图上看得出渠道就写（例如「iHerb」）；看不出写 null。',
    '',
    '7. labelCategory / labelNames：**目录是中文的**。',
    '   先把标签上的英文原料名翻成中文规范名（Taurine → 牛磺酸、Fish Oil → 鱼油、',
    '   Zinc Methionine → 蛋氨酸锌），再去上面两本目录里找**完全同名**的条目：',
    '   - 命中添加剂目录 → labelCategory="FEED_ADDITIVE"；',
    '   - 命中原料目录 → "FEED_MATERIAL"；',
    '   - 两本都没找到 → labelCategory=null、labelNames=[]，**不要自己造名字**。',
    '   labelNames 只写目录里的原名，不要带括号分类。',
    '',
    `8. tagNames：从这些里选 ${ctx.allowedTags.join('、')}。`,
    `9. addTiming：从这些里选 ${ctx.allowedAddTimings.join('、')}。`,
    '',
    '10. **productModel**：产品规格写成**一句人读得懂的话**，不要照抄页面标题。格式：',
    '    - 胶囊/片剂、每份 1 粒：「180粒/瓶，18mg铁/粒」；',
    '    - 胶囊/片剂、每份 N 粒：「180粒/瓶，每份2粒含18mg铁」；',
    '    - 粉/液体：「227g/瓶，每份0.9g含0.875g牛磺酸」。',
    '',
    '11. nutrients：按下面的字段和**它自己的单位**给值。',
    '    标签单位不同要先换算（Taurine 875 mg 而字段单位是 g → 0.875）。',
    '    只填标签上明确写了含量的项：',
    fieldLines,
    '',
    '12. **perUnitNutrients**：把每份含量换算成**每 1 个基准单位**（每粒 / 每克 / 每毫升）。',
    '    算法：每份含量 ÷ servingUnitsPerDose（每份 0.9 g 含 0.875 g → 每 1 g 含 0.972 g）。',
    '    字段和单位与 nutrients 一样。',
    '',
    '13. defaultTargetFields：这条补剂主要补哪几个营养素（fieldPath 数组），只能从 nutrients 里选。',
    '14. 任何一项不确定就写 null，不要编。',
    '',
    'JSON 结构：',
    '{"name":string|null,"brand":string|null,"productModel":string|null,"priceCny":number|null,',
    ' "purchaseChannel":string|null,"baseUnit":"PCS"|"G"|"ML"|null,"unitDisplayLabel":string|null,',
    ' "physicalForm":"CAPSULE"|"TABLET"|"POWDER"|"LIQUID"|null,',
    ' "perBottleUnits":number|null,"servingUnitsPerDose":number|null,',
    ' "nutrients":[{"fieldPath":string,"value":number,"unit":string}],',
    ' "perUnitNutrients":[{"fieldPath":string,"value":number,"unit":string}],',
    ' "labelCategory":"FEED_ADDITIVE"|"FEED_MATERIAL"|null,"labelNames":string[],"tagNames":string[],',
    ' "addTiming":string|null,"defaultTargetFields":string[]}'
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

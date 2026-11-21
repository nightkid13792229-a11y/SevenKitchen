import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupplementLabelVisionService } from './supplement-label-vision.service';
import {
  extractServingSize,
  parseSupplementLabel,
} from '../../domain/ingredient/supplement-label-parser';
import {
  extractFrontFields,
  type FrontFields,
} from '../../domain/ingredient/supplement-front-extract';
import { nutrientChineseLabel } from '../../domain/ingredient/supplement-nutrients';
import {
  buildCatalogQuery,
  detectSaltNameZh,
} from '../../domain/ingredient/supplement-salt-name';
import {
  FeedAdditiveCatalogService,
  type CatalogMatch,
} from '../../domain/ingredient/feed-additive-catalog.service';
import { FeedMaterialCatalogService } from '../../domain/ingredient/feed-material-catalog.service';
import {
  buildAnalysisPrompt,
  parseAnalysisJson,
  validateAnalysis,
  type AnalysisOutcome,
} from '../../domain/ingredient/supplement-label-analysis';
import { listSupplementTargetFields } from '../../domain/ingredient/nutrition-field-catalog';
import {
  buildPackSpec,
  extractPriceCny,
  inferLabelCategory,
} from '../../domain/ingredient/supplement-archive-derive';

/**
 * 两张图 → 档案初稿。
 *
 * 分工写死在这里：**视觉模型只负责"把字抄下来"**，
 * 认字段、折单位、算每份几粒全在服务端代码里（解析器已有单测）。
 * 一旦让模型直接输出档案字段，120 µg 就会被写成 120 mg。
 */

const FRONT_PROMPT = [
  '这是一瓶补剂的商品页截图或正面包装照片。把上面的文字**原样抄下来**，按行输出。',
  '要求：',
  '1. 依次包含：品牌、产品名、规格（例如 120 Softgels / 250 Tablets）、剂型；',
  '2. **价格**：页面上出现的人民币价格原样抄下来（例如「¥77.02 已含税」），没有就写「无价格」；',
  '3. **平台**：这是哪个网站/App 的页面（例如 iHerb、淘宝、京东），看得出来就写一行「平台：xxx」；',
  '4. 不要判断、不要翻译、不要补充图上没有的内容；看不清的字用「?」标出来。',
].join('\n');

export interface LabelIntakeResult {
  /** 正面图原文（只作证据保留） */
  frontText: string;
  /** 标签图原文（只作证据保留） */
  labelText: string;
  front: FrontFields;
  servingUnitsPerDose: number | null;
  nutrients: { fieldPath: string; value: number; unit: string; rawName: string }[];
  /** 有值但认不出名字的行，原样交回去让人补 */
  unrecognized: string[];
  /** 建议的原料名（取第一个认出来的营养素的中文名，如「铜」）；没有就是 null */
  suggestedName: string | null;
  /** 每瓶多少粒（从正面规格里读，读不出就是 null）——用来预填「换算倍数」 */
  perBottleUnits: number | null;
  /** 标签原文里认出的盐型（中文前缀，如「甘氨酸」）；认不出就是 null */
  saltNameZh: string | null;
  /** 《饲料添加剂品种目录》里可能的规范名：suggestion 只在能确定时给 */
  catalog: { query: string; matches: CatalogMatch[]; suggestion: CatalogMatch | null };
  /** 产品规格（人看的写法：180粒/瓶，18mg铁/粒）；读不出瓶规就是 null */
  packSpec: string | null;
  /** 从原文里抠出来的价格（模型没给也能有） */
  detectedPriceCny: number | null;
  /** 这次识别的诊断：哪一步没成、为什么某些字段空着 */
  diagnostics: {
    frontChars: number;
    labelChars: number;
    analysisOk: boolean;
    dropped: { field: string; reason: string; value: string }[];
    notes: string[];
  };
  /** 模型对档案的判断（名称/基准单位/渠道/价格/标签类型…），已过代码校验 */
  analysis: (AnalysisOutcome['result'] & { dropped: AnalysisOutcome['dropped'] }) | null;
}

const COUNT_IN_TEXT =
  /(\d[\d,]*)\s*(tablets?|capsules?|soft\s*gels?|veg(?:gie)?\s*caps?|vegcaps?|lozenges?|片|粒|胶囊|kg|g|ml|毫升|克|oz|盎司|lb|磅)/i;

/** 非克单位换算成克（粉剂按克记账）。 */
const TO_GRAMS: Record<string, number> = {
  kg: 1000,
  g: 1,
  克: 1,
  oz: 28.3495,
  盎司: 28.3495,
  lb: 453.592,
  磅: 453.592
};

/**
 * 「180 CAPSULES」→ 180；「500 g」→ 500。
 * 粉按克、液体按毫升时，换算倍数就是这瓶多少克/多少毫升。
 */
export function parseCountFromTitle(productModel: string | null): number | null {
  const text = String(productModel ?? '');
  // 同一条里既有「8 盎司」又有「227 克」时，优先取克数（厂商标的整数更准）
  const gramsFirst = text.match(/(\d[\d,]*)\s*克/);
  if (gramsFirst) {
    const grams = Number(gramsFirst[1].replace(/,/g, ''));
    if (Number.isFinite(grams) && grams > 0) {
      return grams;
    }
  }
  const match = text.match(COUNT_IN_TEXT);
  if (!match) {
    return null;
  }
  const unit = match[2].toLowerCase();
  const raw = Number(match[1].replace(/,/g, ''));
  const factor = TO_GRAMS[unit] ?? 1;
  const value = Math.round(raw * factor * 100) / 100;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 模型没给判断、但规则能补出标签类型时用的空壳 */
const EMPTY_ANALYSIS: AnalysisOutcome['result'] = {
  name: null,
  brand: null,
  productModel: null,
  priceCny: null,
  purchaseChannel: null,
  baseUnit: null,
  unitDisplayLabel: null,
  physicalForm: null,
  perBottleUnits: null,
  servingUnitsPerDose: null,
  nutrients: [],
  labelCategory: null,
  labelNames: [],
  tagNames: [],
  addTiming: null,
  defaultTargetFields: [],
};

@Injectable()
export class SupplementLabelIntakeService {
  private readonly logger = new Logger(SupplementLabelIntakeService.name);

  constructor(
    private readonly vision: SupplementLabelVisionService,
    private readonly catalog: FeedAdditiveCatalogService,
    private readonly materialCatalog: FeedMaterialCatalogService,
  ) {}

  async read(input: {
    frontImageUrl: string;
    labelImageUrl: string;
  }): Promise<LabelIntakeResult> {
    const frontUrl = input.frontImageUrl?.trim();
    const labelUrl = input.labelImageUrl?.trim();
    if (!frontUrl || !labelUrl) {
      throw new BadRequestException('正面图和标签图都要传，缺一张就没法建全');
    }

    // 两张图并行读：正面只认规格剂型，标签认 Serving Size 与成分表
    const [frontResult, labelResult] = await Promise.all([
      this.vision.readWithPrompt(frontUrl, FRONT_PROMPT),
      this.vision.read(labelUrl),
    ]);

    const frontText = String(frontResult.text ?? '');
    const labelText = String(labelResult.text ?? '');
    const frontFields = extractFrontFields(frontText);

    const parsed = parseSupplementLabel(labelText);
    const frontFieldsForServing = extractFrontFields(frontText);
    const servingSize = extractServingSize(labelText);
    // 剂型决定「每份」按什么记：胶囊看个数，粉看克，液体看毫升
    const servingUnitsPerDose =
      frontFieldsForServing.physicalForm === 'POWDER'
        ? servingSize.grams
        : frontFieldsForServing.physicalForm === 'LIQUID'
          ? servingSize.milliliters
          : servingSize.count;
    const suggestedName = parsed.nutrients[0]
      ? nutrientChineseLabel(parsed.nutrients[0].fieldPath)
      : null;

    const catalogMatches = suggestedName ? this.catalog.lookup(suggestedName, 8) : [];
    const catalogSuggestion =
      catalogMatches.find((entry) => entry.exact) ??
      (catalogMatches.length === 1 ? catalogMatches[0] : null);

    this.logger.log(
      `[label-intake] nutrients=${parsed.nutrients.length} unrecognized=${parsed.unrecognized.length} ` +
        `serving=${servingUnitsPerDose ?? 'none'}`,
    );

    // 两本目录**全量**给模型：翻译、匹配都让它自己做，代码不再维护中文名映射
    const analysis = await this.judge({
      frontText,
      labelText,
      additiveCatalog: this.catalog.listNames(),
      materialCatalog: this.materialCatalog.listNames(),
      allowedFields: listSupplementTargetFields().map((field) => ({
        fieldPath: field.fieldPath,
        label: field.label,
        unit: field.unit,
      })),
      nutrientLabel: suggestedName,
      saltNameZh: detectSaltNameZh(labelText),
      parsedNutrients: parsed.nutrients,
      // 标签分组与前端 `supplementNutrientGroups` 的标题一一对应
      allowedTags: ['矿物质', '维生素', '脂肪酸', '氨基酸', '基础营养'],
      allowedAddTimings: ['BEFORE_MIXING', 'BEFORE_MEAL'],
    });

    // 规格只做**字符串拼装**，数字全用模型读出来的
    const nutrientForSpec = analysis?.result.nutrients[0]
      ? {
          label: nutrientChineseLabel(analysis.result.nutrients[0].fieldPath),
          amount: analysis.result.nutrients[0].value,
          unit: analysis.result.nutrients[0].unit,
        }
      : null;
    const unitLabel =
      analysis?.result.unitDisplayLabel ??
      (frontFields.physicalForm === 'POWDER' ? 'g' : frontFields.physicalForm === 'LIQUID' ? 'ml' : '粒');
    const packSpec = buildPackSpec({
      perBottleUnits: analysis?.result.perBottleUnits ?? null,
      unitLabel,
      nutrients: nutrientForSpec ? [nutrientForSpec] : [],
    });

    const detectedPriceCny =
      analysis?.result.priceCny ?? extractPriceCny(`${frontText}\n${labelText}`);

    const labelCategory = inferLabelCategory({
      modelSaid: analysis?.result.labelCategory ?? null,
      additiveMatched: catalogMatches.length > 0,
      materialMatched: analysis?.result.labelCategory === 'FEED_MATERIAL',
    });

    const notes: string[] = [];
    const FIELD_LABELS: Record<string, string> = {
      name: '原料名称',
      priceCny: '价格',
      nutrients: '营养素',
      labelNames: '标签名称',
      labelCategory: '标签类型',
      baseUnit: '基准单位',
      physicalForm: '剂型',
    };
    for (const note of analysis?.notes ?? []) {
      notes.push(`${FIELD_LABELS[note.field] ?? note.field}：${note.reason}`);
    }
    if (!analysis) {
      notes.push('模型没给出结构化判断（可能超时），下面按原文能读到的先填');
    }
    if (
      servingUnitsPerDose === null &&
      (frontFieldsForServing.physicalForm === 'POWDER' || frontFieldsForServing.physicalForm === 'LIQUID')
    ) {
      notes.push(
        `标签上没写「每份多少${frontFieldsForServing.physicalForm === 'POWDER' ? '克' : '毫升'}」，每份量请手填（别用 1）`,
      );
    }
    if (!packSpec) {
      notes.push('正面图里没读出「一瓶多少粒/多少克」，产品规格留空');
    }
    if (detectedPriceCny === null) {
      notes.push('两张图上都没找到价格，采购价留空');
    }
    if (labelCategory === null) {
      notes.push('两本目录都没对上，标签类型留空');
    }

    return {
      frontText,
      labelText,
      front: frontFields,
      servingUnitsPerDose,
      nutrients: parsed.nutrients,
      unrecognized: parsed.unrecognized,
      suggestedName,
      perBottleUnits: parseCountFromTitle(frontFields.productModel),
      saltNameZh: detectSaltNameZh(labelText),
      catalog: {
        query: suggestedName ?? '',
        matches: catalogMatches,
        suggestion: catalogSuggestion,
      },
      packSpec,
      detectedPriceCny,
      diagnostics: {
        frontChars: frontText.length,
        labelChars: labelText.length,
        analysisOk: !!analysis,
        dropped: analysis?.dropped ?? [],
        notes,
      },
      // 拍平：前端只关心"结论 + 被挡下来的原因"
      analysis: analysis
        ? { ...analysis.result, labelCategory, dropped: analysis.dropped }
        : labelCategory
          ? { ...EMPTY_ANALYSIS, labelCategory, dropped: [] }
          : null,
    };
  }

  /** 让模型按档案规则下结论；任何一步失败都返回 null（页面退回人工判断）。 */
  private async judge(ctx: Parameters<typeof buildAnalysisPrompt>[0]): Promise<AnalysisOutcome | null> {
    try {
      const reply = await this.vision.analyze(buildAnalysisPrompt(ctx));
      if (!reply) {
        return null;
      }
      const parsed = parseAnalysisJson(reply.text);
      if (!parsed) {
        return null;
      }
      return validateAnalysis(parsed, ctx);
    } catch (error) {
      this.logger.warn(`模型判断失败，退回人工：${(error as Error).message}`);
      return null;
    }
  }
}

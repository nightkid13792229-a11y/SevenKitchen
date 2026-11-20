import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupplementLabelVisionService } from './supplement-label-vision.service';
import {
  extractServingUnits,
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

/**
 * 两张图 → 档案初稿。
 *
 * 分工写死在这里：**视觉模型只负责"把字抄下来"**，
 * 认字段、折单位、算每份几粒全在服务端代码里（解析器已有单测）。
 * 一旦让模型直接输出档案字段，120 µg 就会被写成 120 mg。
 */

const FRONT_PROMPT = [
  '这是一瓶补剂的正面包装照片。把上面的印刷文字**原样抄下来**，按行输出。',
  '要求：',
  '1. 依次包含：品牌、产品名、规格（例如 120 Softgels / 250 Tablets）、剂型；',
  '2. 不要判断、不要翻译、不要补充图上没有的内容；',
  '3. 看不清的字用「?」标出来。',
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
  /** 模型对档案的判断（名称/基准单位/渠道/价格/标签类型…），已过代码校验 */
  analysis: (AnalysisOutcome['result'] & { dropped: AnalysisOutcome['dropped'] }) | null;
}

const COUNT_IN_TEXT =
  /(\d[\d,]*)\s*(tablets?|capsules?|soft\s*gels?|veg(?:gie)?\s*caps?|vegcaps?|lozenges?|片|粒|胶囊|kg|g|ml|毫升|克)/i;

/**
 * 「180 CAPSULES」→ 180；「500 g」→ 500。
 * 粉按克、液体按毫升时，换算倍数就是这瓶多少克/多少毫升。
 */
export function parseCountFromTitle(productModel: string | null): number | null {
  const text = String(productModel ?? '');
  const match = text.match(COUNT_IN_TEXT);
  if (!match) {
    return null;
  }
  const unit = match[2].toLowerCase();
  const value = Number(match[1].replace(/,/g, '')) * (unit === 'kg' ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

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
    const servingUnitsPerDose = extractServingUnits(labelText);
    const suggestedName = parsed.nutrients[0]
      ? nutrientChineseLabel(parsed.nutrients[0].fieldPath)
      : null;

    // 目录只用来查规范名：有盐名就「盐名+营养素」，没有就只查营养素；
    // 只有「精确同名」或「唯一命中」才给建议，其它只给候选，绝不猜近似名。
    const catalogQuery = buildCatalogQuery(suggestedName ?? '', labelText);
    const catalogMatches = suggestedName ? this.catalog.lookup(catalogQuery, 8) : [];
    const catalogSuggestion =
      catalogMatches.find((entry) => entry.exact) ??
      (catalogMatches.length === 1 ? catalogMatches[0] : null);

    this.logger.log(
      `[label-intake] nutrients=${parsed.nutrients.length} unrecognized=${parsed.unrecognized.length} ` +
        `serving=${servingUnitsPerDose ?? 'none'}`,
    );

    // 模型判断：名称要写化学形态、基准单位看剂型、渠道/价格从图上找、
    // 标签类型（添加剂 vs 原料）按目录性质定。失败就退回人工，不影响识别结果。
    const allowedFieldPaths = listSupplementTargetFields().map((field) => field.fieldPath);
    const analysis = await this.judge({
      frontText,
      labelText,
      catalogNames: catalogMatches.map((entry) => ({
        name: entry.name,
        dogAllowed: entry.dogAllowed,
      })),
      // 原料目录：先在原文里找已有条目（「鱼油」这种），再按营养素名查一轮
      materialNames: [
        ...this.materialCatalog.findMentioned(`${frontText}\n${labelText}`, 5),
        ...(suggestedName ? this.materialCatalog.lookup(suggestedName, 5) : []),
      ]
        .filter(
          (entry, index, list) => list.findIndex((item) => item.name === entry.name) === index
        )
        .map((entry) => ({ name: entry.name, category: entry.category })),
      nutrientLabel: suggestedName,
      saltNameZh: detectSaltNameZh(labelText),
      parsedNutrients: parsed.nutrients,
      allowedFieldPaths,
      // 标签分组与前端 `supplementNutrientGroups` 的标题一一对应
      allowedTags: ['矿物质', '维生素', '脂肪酸', '氨基酸', '基础营养'],
      allowedAddTimings: ['BEFORE_MIXING', 'BEFORE_MEAL'],
    });

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
        query: catalogQuery,
        matches: catalogMatches,
        suggestion: catalogSuggestion,
      },
      // 拍平：前端只关心"结论 + 被挡下来的原因"
      analysis: analysis ? { ...analysis.result, dropped: analysis.dropped } : null,
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

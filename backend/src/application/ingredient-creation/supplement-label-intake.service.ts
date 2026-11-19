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
}

@Injectable()
export class SupplementLabelIntakeService {
  private readonly logger = new Logger(SupplementLabelIntakeService.name);

  constructor(private readonly vision: SupplementLabelVisionService) {}

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

    const parsed = parseSupplementLabel(labelText);
    const servingUnitsPerDose = extractServingUnits(labelText);
    const suggestedName = parsed.nutrients[0]
      ? nutrientChineseLabel(parsed.nutrients[0].fieldPath)
      : null;

    this.logger.log(
      `[label-intake] nutrients=${parsed.nutrients.length} unrecognized=${parsed.unrecognized.length} ` +
        `serving=${servingUnitsPerDose ?? 'none'}`,
    );

    return {
      frontText,
      labelText,
      front: extractFrontFields(frontText),
      servingUnitsPerDose,
      nutrients: parsed.nutrients,
      unrecognized: parsed.unrecognized,
      suggestedName,
    };
  }
}

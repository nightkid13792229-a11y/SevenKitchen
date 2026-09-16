import { BadRequestException } from '@nestjs/common';

import {
  normalizeOptionalText,
  normalizeStringArray,
} from './deepseek-chat';

/**
 * 食谱文案合规校验
 *
 * 法规依据：《宠物饲料标签规定》（农业农村部公告第 20 号）第二十条第（一）项
 * 「禁止对宠物饲料作具有预防或者治疗宠物疾病的说明或者宣传。」
 *
 * 该清单是「最后一道防线」——提示词已经约束了 AI，但仍需对输出做硬校验，
 * 因为 AI 不是合规责任主体，平台才是。
 *
 * ⚠️ 命名注意：刻意避开「肝」「肾」等单字，以免误伤合法食材名（猪肝 / 牛肝 等）。
 *
 * 可配置：内置清单之外，可通过环境变量 `RECIPE_COPYWRITING_FORBIDDEN_CLAIMS`
 * （英文逗号分隔）追加禁用词，无需改代码即可扩充，例如：
 *   RECIPE_COPYWRITING_FORBIDDEN_CLAIMS=护心,降糖,化毛
 */
export const FORBIDDEN_CLAIM_PATTERNS: string[] = [
  // 器官 / 疾病指向
  '肝脏',
  '肝功能',
  '肝病',
  '护肝',
  '养肝',
  '保肝',
  '肾脏',
  '肾功能',
  '肾病',
  '护肾',
  '养肾',
  '保肾',
  '关节',
  '心脏',
  '肿瘤',
  '抗癌',
  '癌',
  '结石',
  '糖尿病',
  '胰腺',
  'IBD',
  '炎症',
  '抗炎',
  '消炎',
  '过敏',
  '低敏',
  '脱敏',
  // 功效承诺
  '治疗',
  '治愈',
  '疗效',
  '药效',
  '处方',
  '排毒',
  '改善',
  '预防',
  '增强免疫',
  '提高免疫力',
  // 医疗用语
  '药物',
  '用药',
  '吃药',
];

/**
 * 生效的禁用词表 = 内置清单 + 环境变量追加（去重，保持内置顺序在前）。
 */
export function getForbiddenClaimPatterns(): string[] {
  const extra = (process.env.RECIPE_COPYWRITING_FORBIDDEN_CLAIMS || '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
  return Array.from(new Set([...FORBIDDEN_CLAIM_PATTERNS, ...extra]));
}

/**
 * 扫描文本中命中的禁用表述，返回命中的词（去重、保持清单顺序）。
 */
export function scanForbiddenClaims(
  ...texts: Array<string | null | undefined>
): string[] {
  const joined = texts
    .map((text) => (typeof text === 'string' ? text : ''))
    .join('\n');
  if (!joined.trim()) return [];
  return getForbiddenClaimPatterns().filter((pattern) =>
    joined.includes(pattern),
  );
}

export interface RecipeCopywritingPayload {
  sellingPoint: string;
  description: string;
  suggestedTags: string[];
  basis: string;
}

/** 一句话卖点上限（与 Recipe.sellingPoint VarChar(120) 保持一致，留足中文余量） */
export const SELLING_POINT_MAX_LENGTH = 40;
export const DESCRIPTION_MAX_LENGTH = 400;

/**
 * 把模型输出规范化为可落库的结构：
 * - 只保留白名单内的推荐标签（AI 不得发明新标签）
 * - 超长文案按上限截断，避免写入失败
 */
export function normalizeCopywritingOutput(
  parsed: Record<string, unknown>,
  allowedTags: string[],
): RecipeCopywritingPayload {
  const allowed = new Set(allowedTags);
  const suggestedTags = normalizeStringArray(parsed.suggestedTags).filter(
    (tag) => allowed.has(tag),
  );

  const sellingPoint = normalizeOptionalText(parsed.sellingPoint).slice(
    0,
    SELLING_POINT_MAX_LENGTH,
  );
  const description = normalizeOptionalText(parsed.description).slice(
    0,
    DESCRIPTION_MAX_LENGTH,
  );

  return {
    sellingPoint,
    description,
    suggestedTags: Array.from(new Set(suggestedTags)),
    basis: normalizeOptionalText(parsed.basis),
  };
}

/**
 * 合规硬校验：命中禁用表述则整条拒绝，并在报错信息中明确指出命中了哪些词。
 */
export function assertCopywritingCompliant(
  payload: RecipeCopywritingPayload,
): void {
  const hits = scanForbiddenClaims(payload.sellingPoint, payload.description);
  if (hits.length > 0) {
    throw new BadRequestException(
      `AI 文案命中禁用表述：${hits.join('、')}。请调整配方或重新生成。`,
    );
  }
}

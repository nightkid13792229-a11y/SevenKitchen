import { BadRequestException } from '@nestjs/common';

export type IngredientSourcePlanCode =
  | 'ORGANIC'
  | 'MARKET_PREMIUM'
  | 'WHOLESALE';

export interface IngredientSourcePlanDefinition {
  code: IngredientSourcePlanCode;
  label: string;
  description: string;
  channelKeywords: string[];
}

export const INGREDIENT_SOURCE_PLANS: Record<
  IngredientSourcePlanCode,
  IngredientSourcePlanDefinition
> = {
  ORGANIC: {
    code: 'ORGANIC',
    label: '尽量有机来源',
    description: '优先匹配有机、生态、认证来源的采购 SKU。',
    channelKeywords: ['有机', 'organic', '生态', '认证'],
  },
  MARKET_PREMIUM: {
    code: 'MARKET_PREMIUM',
    label: '尽量山姆、盒马、沃集鲜',
    description: '优先匹配山姆、盒马、沃集鲜等稳定零售/会员渠道。',
    channelKeywords: ['山姆', 'sam', '盒马', '沃集鲜'],
  },
  WHOLESALE: {
    code: 'WHOLESALE',
    label: '生鲜批发商',
    description: '优先匹配批发商、生鲜批发、供应商直采等高性价比渠道。',
    channelKeywords: ['批发', '生鲜批发', '批发商', '供应商'],
  },
};

export function normalizeIngredientSourcePlan(
  code: IngredientSourcePlanCode | string | null | undefined,
): IngredientSourcePlanCode {
  if (!code) {
    return 'MARKET_PREMIUM';
  }

  if (Object.prototype.hasOwnProperty.call(INGREDIENT_SOURCE_PLANS, code)) {
    return code as IngredientSourcePlanCode;
  }

  throw new BadRequestException(`Unknown ingredientSourcePlan: ${code}`);
}

export function matchSourcePlanChannel(
  channel: string | null | undefined,
  planCode: IngredientSourcePlanCode,
): boolean {
  if (!channel) {
    return false;
  }

  const normalized = channel.toLowerCase();
  return INGREDIENT_SOURCE_PLANS[planCode].channelKeywords.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
}

import { BadRequestException } from '@nestjs/common';

export type IngredientSourcePlanCode =
  | 'ORGANIC'
  | 'MARKET_PREMIUM'
  | 'WHOLESALE';

export type IngredientSourceTierCode = IngredientSourcePlanCode;

export const INGREDIENT_SOURCE_TIER_CODES: IngredientSourceTierCode[] = [
  'ORGANIC',
  'MARKET_PREMIUM',
  'WHOLESALE',
];

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
    label: '有机优先',
    description: '原料优先选择有机、非转基因、生态散养来源。',
    channelKeywords: ['有机', 'organic', '生态', '认证'],
  },
  MARKET_PREMIUM: {
    code: 'MARKET_PREMIUM',
    label: '超市优先',
    description: '原料优先选择山姆、盒马、沃集鲜等知名商超来源。',
    channelKeywords: ['山姆', 'sam', '盒马', '沃集鲜'],
  },
  WHOLESALE: {
    code: 'WHOLESALE',
    label: '性价比优先',
    description:
      '原料选择以人食级为底线，尽量选择肉团、生鲜批发等性价比高的来源。',
    channelKeywords: ['批发', '生鲜批发', '批发商', '供应商'],
  },
};

export const INGREDIENT_SOURCE_PLAN_FALLBACKS: Record<
  IngredientSourcePlanCode,
  IngredientSourceTierCode[]
> = {
  ORGANIC: ['ORGANIC', 'MARKET_PREMIUM', 'WHOLESALE'],
  MARKET_PREMIUM: ['MARKET_PREMIUM', 'ORGANIC', 'WHOLESALE'],
  WHOLESALE: ['WHOLESALE', 'MARKET_PREMIUM', 'ORGANIC'],
};

export const INGREDIENT_SOURCE_TIER_LABELS: Record<
  IngredientSourceTierCode,
  string
> = {
  ORGANIC: '有机',
  MARKET_PREMIUM: '商超',
  WHOLESALE: '性价比',
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

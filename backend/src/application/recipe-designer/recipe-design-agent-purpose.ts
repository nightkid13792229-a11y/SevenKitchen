/**
 * AI 食谱设计对话（Recipe Agent）使用的 Agent 用途标识。
 *
 * 2026-10-31 起按流程拆成两条配置：
 *   · RECIPE_DESIGN_CATALOG —— 产品线食谱设计
 *   · RECIPE_DESIGN_ORDER   —— 定制订单食谱设计
 * 两者都不再回退到系统默认；只有连旧键 RECIPE_DESIGN 都没配时才报错，
 * 避免"悄悄用一个不相干的模型顶上"。
 *
 * 旧键 `RECIPE_DESIGN` 保留为**共享兜底**：两条新键都没配时用它，
 * 保证老环境未配置前仍可用。
 */
export const RECIPE_DESIGN_AGENT_PURPOSE = 'RECIPE_DESIGN';
export const RECIPE_DESIGN_CATALOG_PURPOSE = 'RECIPE_DESIGN_CATALOG';
export const RECIPE_DESIGN_ORDER_PURPOSE = 'RECIPE_DESIGN_ORDER';

export type RecipeDesignFlow = 'CATALOG' | 'ORDER';

/**
 * 按流程给出用途查找顺序：先本流程，再共享键。
 * 不使用系统默认 DEFAULT —— 食谱设计必须有自己的模型。
 */
export function recipeDesignPurposesForFlow(
  flow: RecipeDesignFlow,
): string[] {
  const own =
    flow === 'ORDER'
      ? RECIPE_DESIGN_ORDER_PURPOSE
      : RECIPE_DESIGN_CATALOG_PURPOSE;
  return [own, RECIPE_DESIGN_AGENT_PURPOSE];
}

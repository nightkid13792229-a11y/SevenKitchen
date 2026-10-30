/**
 * AI 食谱设计对话（Recipe Agent）使用的 Agent 用途标识。
 *
 * 未单独配置时回退全局默认；后台「AI / Agent 配置」里对应「AI 食谱设计对话」。
 * 2026-10-27：原「AI 设计建议」板块下线后，常量从
 * ai-design-suggestion.service.ts 迁到这里，密钥/模型配置键保持不变（RECIPE_DESIGN）。
 */
export const RECIPE_DESIGN_AGENT_PURPOSE = 'RECIPE_DESIGN';

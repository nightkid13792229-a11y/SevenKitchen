/**
 * AI / Agent 用途清单。
 * DEFAULT 为全局默认：所有未单独配置用途的 AI/Agent 都回退到这里。
 * 其它用途各自独立配置（可选，未配置则回退 DEFAULT）。
 */
export interface AgentPurposeMeta {
  purpose: string
  label: string
  description: string
  defaultModel: string
}

export const AGENT_DEFAULT_PURPOSE = 'DEFAULT'

export const AGENT_PURPOSES: AgentPurposeMeta[] = [
  {
    purpose: 'DEFAULT',
    label: '全局默认',
    description: '所有未单独指定用途的 AI/Agent 使用的兜底配置',
    defaultModel: 'deepseek-v4-flash',
  },
  {
    purpose: 'RECIPE_DESIGN',
    label: '食谱设计建议',
    description: '为定制食谱生成 AI 设计建议（推荐食材/营养注意等）',
    defaultModel: 'deepseek-v4-pro',
  },
  {
    purpose: 'NUTRITION_REVIEW',
    label: '营养复核',
    description: '配方营养校验、复杂来源与人工升级复核',
    defaultModel: 'deepseek-v4-pro',
  },
  {
    purpose: 'SUPPLEMENT_LABEL',
    label: '补剂标签识别',
    description: '从补剂图片提取标签信息',
    defaultModel: 'deepseek-v4-flash',
  },
]

export function agentPurposeLabel(purpose?: string | null): string {
  if (!purpose) return AGENT_PURPOSES.find((p) => p.purpose === AGENT_DEFAULT_PURPOSE)?.label ?? '全局默认'
  return (
    AGENT_PURPOSES.find((p) => p.purpose === purpose)?.label ??
    purpose
  )
}

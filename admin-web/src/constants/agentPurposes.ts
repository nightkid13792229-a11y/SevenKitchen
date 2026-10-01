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
    purpose: 'RECIPE_COPYWRITING',
    label: '食谱文案生成',
    description: '为食谱生成合规的一句话卖点与详细说明，并推荐合规标签',
    defaultModel: 'deepseek-v4-pro',
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
  {
    purpose: 'HEALTH_REPORT_EXTRACTION',
    label: '健康 · 报告识别（看图）',
    description:
      '拍照识别病历 / 体检报告 / 疫苗本 / 过敏报告。必须用**能读图**的模型，' +
      '默认 deepseek-v4-flash-vision-exp（实测可读中文报告，单张图最多 384 token、与 Flash 同价）',
    defaultModel: 'deepseek-v4-flash-vision-exp',
  },
  {
    purpose: 'HEALTH_ANALYSIS',
    label: '健康 · AI 分析（七项）',
    description:
      '根据健康记录与知识库生成七项分析（总评 / 记录解读 / 需留意信号 / 营养 / 复查 / 疫苗 / 就诊前准备），用文本模型即可',
    defaultModel: 'deepseek-v4-pro',
  },
]

export function agentPurposeLabel(purpose?: string | null): string {
  if (!purpose) return AGENT_PURPOSES.find((p) => p.purpose === AGENT_DEFAULT_PURPOSE)?.label ?? '全局默认'
  return (
    AGENT_PURPOSES.find((p) => p.purpose === purpose)?.label ??
    purpose
  )
}

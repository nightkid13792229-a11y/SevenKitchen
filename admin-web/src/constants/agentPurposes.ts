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
    defaultModel: 'deepseek-flash',
  },
  {
    purpose: 'RECIPE_COPYWRITING',
    label: '食谱文案生成',
    description: '为食谱生成合规的一句话卖点与详细说明，并推荐合规标签',
    /**
     * 2026-10-18 老板定：文案用 **DeepSeek V4.1 Flash**。
     *
     * ⚠️ 模型名就是 `deepseek-flash` —— **不是** `deepseek-v4.1-flash`。
     * 官方「模型 & 价格」写明："模型名请使用 deepseek-flash"，
     * 它的模型版本才是 `DeepSeek-V4.1-Flash-1017`。
     * 旧名 `deepseek-v4-flash` 已下线，请求会由 V4.1-Flash 提供服务。
     */
    defaultModel: 'deepseek-flash',
  },
  {
    purpose: 'RECIPE_COVER_IMAGE',
    label: '食谱封面图生成',
    description: '按食谱名与食材生成封面图（约 28 秒/张，一次生成一张）',
    /**
     * 2026-10-18 老板定：封面图用**智谱 glm-image**。
     *
     * 为什么不用 cogview-4：实测 8 秒出图，但**食材画得不准**
     * （说鸡胸肉+南瓜+糙米，出来像炒饭）。glm-image 慢 20 秒，
     * 但三样食材分得清 —— 食谱封面必须和内容对得上。
     */
    defaultModel: 'glm-image',
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
    defaultModel: 'deepseek-flash',
  },
  {
    purpose: 'HEALTH_REPORT_EXTRACTION',
    label: '健康 · 报告识别（看图）',
    description:
      '拍照识别病历 / 体检报告 / 疫苗本 / 过敏报告。必须用**能读图**的模型 —— ' +
      '官方支持读图的是 deepseek-flash（模型版本 DeepSeek-V4.1-Flash）；' +
      'deepseek-v4-pro 不支持读图。旧名 deepseek-v4-flash / deepseek-v4-flash-vision-exp 已下线，别再填',
    defaultModel: 'deepseek-flash',
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

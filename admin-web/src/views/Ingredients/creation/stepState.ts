/**
 * 向导六站的固定顺序与邻站计算。
 *
 * 页面上所有「第几站 / 上一站 / 下一站」都从这里派生，
 * 避免各组件各写一份顺序、改一处漏一处。
 */
import type { CreationStep } from '@/types/ingredientCreation'

export interface CreationStepMeta {
  step: CreationStep
  /** 进度条上的站点名（不含序号，序号由页面按 index 渲染） */
  title: string
  /** 一句话说明这一站做什么 */
  summary: string
}

/** 六站顺序是产品契约：① 起手 → ② 营养依据 → ③ 档案成型 → ④ 终检 → ⑤ 原料档案 → ⑥ 收尾。 */
export const stepList: readonly CreationStepMeta[] = [
  {
    step: 'INTAKE',
    title: '起手',
    summary: '确认检索口径与生熟清单'
  },
  {
    step: 'SOURCES',
    title: '营养依据',
    summary: '挑来源，确认缝合方案'
  },
  {
    step: 'PROFILE',
    title: '档案成型',
    summary: '核对每个数字的来源与换算'
  },
  {
    step: 'CHECK',
    title: '终检',
    summary: '处理拦死项、登记例外'
  },
  {
    step: 'INGREDIENT',
    title: '原料档案',
    summary: '补齐标准原料的基础字段'
  },
  {
    step: 'COMMIT',
    title: '收尾',
    summary: '核对摘要并一次性提交'
  }
]

/** 当前站在六站里的下标；未知值返回 -1。 */
export function stepIndex(step: CreationStep): number {
  return stepList.findIndex((item) => item.step === step)
}

/** 下一站；已是最后一站（或未知站点）返回 null。 */
export function nextStep(step: CreationStep): CreationStep | null {
  const index = stepIndex(step)
  if (index < 0) {
    return null
  }

  return stepList[index + 1]?.step ?? null
}

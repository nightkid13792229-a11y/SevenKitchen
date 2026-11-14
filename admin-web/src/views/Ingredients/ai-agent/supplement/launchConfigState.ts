/**
 * 补剂建档 · 第 4 步「落地配置」的纯逻辑（2026-11-14）。
 *
 * 这里只管三件事，全部可以脱离界面单测：
 *   1. 四段有没有「明确表态」（不允许沉默的默认值）；
 *   2. 这条补剂当前算不算「能买 / 有隐患 / 不能买」；
 *   3. 顾客制作单上这一行会显示成什么。
 *
 * 判定依据一律来自后端体检结果（`issues`），本文件不自己发明规则。
 */

/** 「不上架」的四个固定原因（老板 2026-11-14 定） */
export const NO_SALE_REASONS = [
  { value: 'SELF_MADE', label: '自制原料（自己分装，不单独卖）' },
  { value: 'BULK', label: '散装采购（没有独立包装）' },
  { value: 'NO_SUPPLY', label: '暂无稳定货源' },
  { value: 'UNDECIDED', label: '待定（先不卖）' },
] as const

export type NoSaleReason = (typeof NO_SALE_REASONS)[number]['value']

/** 等价组选「暂不归组」时的占位值（与「还没选」的 null 区分开） */
export const GROUP_SKIPPED = '__SKIP__'

export interface LaunchDecisions {
  diy: boolean | null
  procurement: boolean | null
  retail: boolean | null
  /** groupId / GROUP_SKIPPED / null（还没选） */
  group: string | null
  noSaleReason: NoSaleReason | null
}

export interface LaunchIssueLike {
  level: string
  code: string
  message: string
}

export type LaunchLevel = 'READY' | 'WARN' | 'BLOCKED'

export interface LaunchEvaluationInput {
  retailEnabled: boolean
  issues: LaunchIssueLike[]
  hasPurchaseLink: boolean
  diyEnabled: boolean
  /** null = 未归组 */
  groupStatus: string | null
  groupMembers: number
}

export interface LaunchEvaluation {
  level: LaunchLevel
  reasons: string[]
}

/** 没表态的段名。四段之外，选了「不上架」却没选原因也算缺。 */
export function missingDecisions(decisions: LaunchDecisions): string[] {
  const missing: string[] = []
  if (decisions.diy === null) missing.push('DIY 推荐')
  if (decisions.procurement === null) missing.push('生产采购')
  if (decisions.retail === null) missing.push('商城上架')
  if (decisions.group === null) missing.push('等价组')
  if (decisions.retail === false && !decisions.noSaleReason) {
    missing.push('不上架原因')
  }
  return missing
}

export function evaluateLaunch(input: LaunchEvaluationInput): LaunchEvaluation {
  const errors = (input.issues || []).filter((issue) => issue.level === 'ERROR')

  if (!input.retailEnabled) {
    return {
      level: 'BLOCKED',
      reasons: [
        '未上架：制作单里只会显示「仅生产，不可购买」',
        ...errors.map((issue) => issue.message),
      ],
    }
  }

  if (errors.length > 0) {
    return {
      level: 'BLOCKED',
      reasons: errors.map((issue) => issue.message),
    }
  }

  const warnings: string[] = []
  if (input.diyEnabled && !input.hasPurchaseLink) {
    warnings.push('已上架，但没填购买链接：详情里没有「去购买」')
  }
  if (!input.groupStatus) {
    warnings.push('未归等价组：缺货时无法替换成同营养的其他产品')
  } else if (input.groupStatus !== 'APPROVED') {
    warnings.push('所在等价组未审核通过：不参与替换')
  } else if (input.groupMembers <= 1) {
    warnings.push('所在等价组只有 1 个成员：不参与替换')
  }

  return {
    level: warnings.length > 0 ? 'WARN' : 'READY',
    reasons: warnings,
  }
}

/**
 * 制作单预览文案——必须与小程序真实展示一致：
 * 上不了架、或一个候选都没有的行，都是「仅生产，不可购买」。
 */
export function describeSheetPreview(input: {
  retailEnabled: boolean
  hasError: boolean
  candidateCount: number
}): string {
  if (!input.retailEnabled || input.hasError || input.candidateCount <= 0) {
    return '仅生产，不可购买'
  }
  if (input.candidateCount === 1) {
    return '查看商品 〉'
  }
  return `可更换 ${input.candidateCount}项 〉`
}

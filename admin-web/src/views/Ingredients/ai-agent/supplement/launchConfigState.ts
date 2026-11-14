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

/** 不上架原因存进 `properties` 的键（schema 里没有独立列，2026-11-14） */
export const NO_SALE_REASON_PROPERTY_KEY = 'no_sale_reason'

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

/**
 * 结论卡。**只读后端 issues**，不自己判断组是否生效——
 * 组的审核状态、成员数、浓度/单位是否匹配，后端都已经写成
 * `EQUIVALENCE_*` 的 WARN，这里重复判断就会出现两套口径。
 */
export function evaluateLaunch(input: LaunchEvaluationInput): LaunchEvaluation {
  const issues = input.issues || []
  const errors = issues.filter((issue) => issue.level === 'ERROR')

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
  for (const issue of issues) {
    if (issue.level === 'WARN' && issue.code.startsWith('EQUIVALENCE_')) {
      warnings.push(issue.message)
    }
  }

  return {
    level: warnings.length > 0 ? 'WARN' : 'READY',
    reasons: warnings,
  }
}

/**
 * 制作单预览文案——与小程序**实际展示**对齐：
 *   · 没开 DIY 的补剂根本不会出现在制作单上；
 *   · 上不了架、或一个候选都没有的行，都是「仅生产，不可购买」；
 *   · 有 1 个候选 → 「查看商品 〉」；多个候选 → 「换一个」（小程序口径）。
 *
 * 这里**不推算候选数**：候选还要过每个成员的 diy/上架/形态/单位/浓度，
 * 猜一个数字写出来只会误导。组能生效时按「多个候选」处理。
 */
export function describeSheetPreview(input: {
  diyEnabled: boolean
  retailEnabled: boolean
  hasError: boolean
  /** 组已审核、成员 ≥2、且后端没有报 EQUIVALENCE_* 问题 */
  groupEffective: boolean
}): string {
  if (!input.diyEnabled) {
    return '不出现在制作单'
  }
  if (!input.retailEnabled || input.hasError) {
    return '仅生产，不可购买'
  }
  if (input.groupEffective) {
    return '换一个'
  }
  return '查看商品 〉'
}

/** 「去补」跳到哪一段（2026-11-15 复审遗留）。 */
export type LaunchSegment = 'archive' | 'diy' | 'procurement' | 'group'

/**
 * 把结论卡里的一句话映射到要补的那一段。
 * 只按文案里的关键词判断，不做业务判断（业务结论仍来自后端 issues）。
 */
export function reasonTarget(text: string): LaunchSegment {
  const value = String(text || '')
  if (/等价组|替换|审核|成员|组内/.test(value)) return 'group'
  if (/购买链接|DIY|抓取/.test(value)) return 'diy'
  // 「未上架」这句里也带「生产」二字，必须先判档案段
  if (/未上架|上架|保质期|形态|液体|单位|单价/.test(value)) return 'archive'
  if (/采购|生产/.test(value)) return 'procurement'
  return 'archive'
}

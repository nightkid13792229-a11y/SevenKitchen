/**
 * 补剂选品的「硬排除」清单。
 *
 * 这些来源不是"差一点"，是**不该作为该营养素的来源**——有文献直接这么说，
 * 所以判"不能用"，与价格、形态、品牌都无关。
 *
 * 出处就是文献原文本身，不经过我们自己的"选品规则"：
 * - NRC 2006, Iron: "Iron oxide and carbonate demonstrate negligible bioavailability
 *   and should not be used as dietary sources of Fe (AAFCO, 2001)."
 * - FEDIAF 2025: "Owing to its low availability copper oxide should not be considered
 *   as a copper source."
 * （两份原文都在本地营养知识库里，Agent 的引用也走同一处。）
 */
export interface SupplementHardExclusion {
  /** 命中用的关键词（写在标签名称/候选名里） */
  keyword: string
  /** 展示给人看的一句话 */
  reason: string
  /** 依据，界面上可直接显示 */
  source: string
}

export const SUPPLEMENT_HARD_EXCLUSIONS: SupplementHardExclusion[] = [
  {
    keyword: '氧化铁',
    reason: '氧化铁不能作为铁来源（生物利用率可忽略）',
    source: 'NRC 2006'
  },
  {
    keyword: '碳酸亚铁',
    reason: '碳酸亚铁不能作为铁来源（生物利用率可忽略）',
    source: 'NRC 2006'
  },
  {
    keyword: '氧化铜',
    reason: '氧化铜不应被视为铜源',
    source: 'FEDIAF 2025'
  }
]

/** 命中就返回那条依据；没命中返回 null。只做包含匹配，不做模糊猜测。 */
export function findHardExclusion(name: string): SupplementHardExclusion | null {
  const text = name.trim()
  if (!text) {
    return null
  }
  return SUPPLEMENT_HARD_EXCLUSIONS.find((item) => text.includes(item.keyword)) ?? null
}

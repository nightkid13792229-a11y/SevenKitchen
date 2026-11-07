/**
 * 补剂选品的「硬排除」清单。
 *
 * 这些来源不是"差一点"，是**不该作为该营养素的来源**——有文献直接这么说，
 * 所以判"不能用"，与价格、形态、品牌都无关。
 *
 * 出处见 `docs/superpowers/specs/2026-11-07-supplement-selection-rules-draft.md`
 * 与 `backend/skills/ingredient-agent/supplement-selection.md`。
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

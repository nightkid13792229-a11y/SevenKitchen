/**
 * 形态表的展示口径（维度驱动版）。
 *
 * 一条规矩写在类型里：**只有读过原文的候选才配「推荐」样子**。
 * 市场上有、库里没依据的，永远是灰的、不可推荐。
 */
import type {
  SupplementCitationDto,
  SupplementDimensionCandidateDto,
  SupplementDimensionsAdviceDto,
  SupplementFormVerdict
} from '@/types/ingredientCreation'

export type TagType = 'success' | 'info' | 'warning' | 'danger'

export interface StatusMeta {
  label: string
  type: TagType
  /** 能不能给"建议用" */
  recommendable: boolean
}

const STATUS_META: Record<string, StatusMeta> = {
  EVIDENCED: { label: '有原文', type: 'success', recommendable: true },
  MARKET_ONLY: { label: '市场有·无依据', type: 'info', recommendable: false }
}

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? (STATUS_META.MARKET_ONLY as StatusMeta)
}

/**
 * 能不能给"用这个"主按钮。
 *
 * 只有「有原文 + 结论是推荐/可用」才算正常选择；
 * 「有原文但判为不推荐 / 没结论」必须走「仍用这一档」+ 确认，否则
 * 页面会出现"红标不推荐 + 蓝色主按钮"的怪组合，快照也看不出是人硬选的。
 */
export function canPick(candidate: {
  status: string
  verdict: SupplementFormVerdict
}): boolean {
  return (
    candidate.status === 'EVIDENCED' &&
    (candidate.verdict === 'RECOMMENDED' || candidate.verdict === 'ACCEPTABLE')
  )
}

const VERDICT_LABELS: Record<SupplementFormVerdict, { label: string; type: TagType }> = {
  RECOMMENDED: { label: '推荐', type: 'success' },
  ACCEPTABLE: { label: '可用', type: 'info' },
  AVOID: { label: '不推荐', type: 'danger' },
  NO_EVIDENCE: { label: '无结论', type: 'warning' }
}

export function verdictMeta(verdict: SupplementFormVerdict): { label: string; type: TagType } {
  return VERDICT_LABELS[verdict] ?? VERDICT_LABELS.NO_EVIDENCE
}

export function citationText(citation: SupplementCitationDto): string {
  const doc = citation.documentName?.trim() || citation.documentId
  return `《${doc}》第 ${citation.page} 页`
}

/** 没有引用就等于没有依据；页面上也不给它引号。 */
export function citationsOf(option: {
  citations: SupplementCitationDto[]
}): SupplementCitationDto[] {
  return (option.citations ?? []).filter((item) => !!item?.quote?.trim())
}

/** 顶部那句建议：没有推荐就给空串，页面据此显示"请你自己判断"。 */
export function recommendationText(advice: SupplementDimensionsAdviceDto | null): string {
  if (!advice?.recommendation) {
    return ''
  }
  const target = findCandidate(advice, advice.recommendation.candidateKey)
  if (!target) {
    return ''
  }
  // 来源维度的建议要标出来，否则在"定形态"这一屏会被读成形态建议
  const suffix = target.dimension === 'SOURCE' ? '（来源）' : ''
  return `建议用：${target.labelZh}${suffix}`
}

export function findCandidate(
  advice: SupplementDimensionsAdviceDto,
  candidateKey: string
): SupplementDimensionCandidateDto | null {
  for (const group of advice.dimensions) {
    const hit = group.candidates.find((item) => item.key === candidateKey)
    if (hit) {
      return hit
    }
  }
  return null
}

/** 整张表为空：不是"没查到"，是"这一类不按形态判断"，页面给的是去比价。 */
export function isEmptyAdvice(advice: SupplementDimensionsAdviceDto | null): boolean {
  return !!advice && advice.dimensions.length === 0
}

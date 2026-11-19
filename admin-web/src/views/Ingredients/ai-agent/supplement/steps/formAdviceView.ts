/**
 * 形态表的展示口径。
 *
 * 一条规矩写在类型里：**只有真的读过原文的结论才配「推荐」样子**，
 * `NO_EVIDENCE` 永远是灰的、不可选。
 */
import type { SupplementCitationDto, SupplementFormVerdict } from '@/types/ingredientCreation'

export type VerdictTagType = 'success' | 'info' | 'warning' | 'danger'

export interface VerdictMeta {
  label: string
  type: VerdictTagType
  /** 能不能点「用这个档位」 */
  pickable: boolean
}

const META: Record<SupplementFormVerdict, VerdictMeta> = {
  RECOMMENDED: { label: '推荐', type: 'success', pickable: true },
  ACCEPTABLE: { label: '可用', type: 'info', pickable: true },
  AVOID: { label: '不推荐', type: 'danger', pickable: false },
  NO_EVIDENCE: { label: '证据不足', type: 'warning', pickable: false }
}

export function verdictMeta(verdict: SupplementFormVerdict): VerdictMeta {
  return META[verdict] ?? META.NO_EVIDENCE
}

export function citationText(citation: SupplementCitationDto): string {
  const doc = citation.documentName?.trim() || citation.documentId
  return `《${doc}》第 ${citation.page} 页`
}

/** 没有引用就等于没有依据；页面上也不给它引号。 */
export function citationsOf(option: { citations: SupplementCitationDto[] }): SupplementCitationDto[] {
  return (option.citations ?? []).filter((item) => !!item?.quote?.trim())
}

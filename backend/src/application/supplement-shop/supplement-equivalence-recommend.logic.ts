/**
 * 等价组推荐 · 纯计算部分（2026-11-14）。
 *
 * 服务层只负责把原料与组读出来，排序和原因文案在这里做，方便单测。
 */

export interface RecommendationCandidate {
  groupId: string
  code: string
  name: string
  status: string
  memberCount: number
  /** 档案浓度与组的营养素单位是否一致（true 才可能真正参与替换） */
  sameUnit: boolean
  /** 组要求的营养素名（如「碘」） */
  nutrientLabel: string
  /** 组要求的单位（如「μg」） */
  nutrientUnit: string
  /** 档案里的实际单位（不一致时用于说明） */
  actualUnit?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  APPROVED: '已审核',
  PENDING_REVIEW: '待审核',
  DRAFT: '草稿',
  DISABLED: '已停用',
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status] || status
}

/** 给运营看的一句话：这个组为什么能/不能直接换。 */
export function describeRecommendation(candidate: RecommendationCandidate): string {
  if (!candidate.sameUnit) {
    const actual = candidate.actualUnit ? `档案是 ${candidate.actualUnit}` : '档案单位未知'
    return `营养素对得上，但单位不一致（组要求 ${candidate.nutrientUnit}，${actual}），加入也不参与替换`
  }
  if (candidate.status !== 'APPROVED') {
    return `营养素匹配；组还是${statusLabel(candidate.status)}，加入后也不参与替换`
  }
  if (candidate.memberCount <= 1) {
    return `营养素匹配；组里只有 ${candidate.memberCount} 个成员，加入后也不参与替换`
  }
  return `可以直接用：组已审核、${candidate.memberCount} 个成员、单位一致`
}

/**
 * 排序口径：
 *   1. 能真正参与替换的（单位一致 + 已审核 + ≥2 成员）排最前；
 *   2. 其次按状态（已审核 > 待审核 > 草稿 > 已停用）；
 *   3. 再次按成员数多的优先；
 *   4. 最后按名称稳定排序，避免每次刷新顺序乱跳。
 */
export function sortRecommendations(
  candidates: RecommendationCandidate[],
): RecommendationCandidate[] {
  const usable = (candidate: RecommendationCandidate) =>
    candidate.sameUnit && candidate.status === 'APPROVED' && candidate.memberCount > 1

  const statusRank: Record<string, number> = {
    APPROVED: 0,
    PENDING_REVIEW: 1,
    DRAFT: 2,
    DISABLED: 3,
  }

  return [...candidates].sort((left, right) => {
    if (usable(left) !== usable(right)) {
      return usable(left) ? -1 : 1
    }
    const rankDiff = (statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9)
    if (rankDiff !== 0) return rankDiff
    if (left.memberCount !== right.memberCount) {
      return right.memberCount - left.memberCount
    }
    return left.name.localeCompare(right.name)
  })
}

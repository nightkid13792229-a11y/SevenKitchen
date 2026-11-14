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
  /** 不一致的具体原因（决定文案，不能一律说「改单位」） */
  mismatchReason?: 'UNIT_LABEL' | 'BASIS_BASE_MISMATCH' | 'MISSING_SERVING_WEIGHT' | null
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

function mismatchText(candidate: RecommendationCandidate): string {
  const unit = `组要求 ${candidate.nutrientUnit}`
  const actual = candidate.actualUnit ? `档案是 ${candidate.actualUnit}` : '档案单位未知'
  switch (candidate.mismatchReason) {
    case 'BASIS_BASE_MISMATCH':
      return '档案按「每 100 克」这类基准标、库存按粒/片计，缺换算依据；加入也不参与替换'
    case 'MISSING_SERVING_WEIGHT':
      return '档案按「每份」标、库存按粒/片计，但没填每份克重；加入也不参与替换'
    default:
      return `营养素对得上，但单位不一致（${unit}，${actual}），加入也不参与替换`
  }
}

/**
 * 给运营看的一句话：加入这个组会发生什么。
 *
 * ⚠️ 加入/移出成员会把已审核的组打回 DRAFT（后端 addMembers/assign/removeMember），
 * 所以**任何**加入动作之后都要重新审核，不能说「可以直接用」。
 */
export function describeRecommendation(candidate: RecommendationCandidate): string {
  if (!candidate.sameUnit) {
    return mismatchText(candidate)
  }
  if (candidate.memberCount <= 1) {
    return candidate.status === 'APPROVED'
      ? '单位一致、组已审核；加入后就是 2 个成员，但会把组打回待审核，需要重新审核'
      : '营养素匹配；加入后就是 2 个成员，但组要审核通过才参与替换'
  }
  if (candidate.status === 'APPROVED') {
    return (
      `单位一致、组已审核、${candidate.memberCount} 个成员；` +
      '加入后会把组打回待审核，需要重新审核才继续生效'
    )
  }
  return `营养素匹配；组还是${statusLabel(candidate.status)}，加入后需审核通过才参与替换`
}

/**
 * 排序口径（复审后调整）：
 *   1. **单位一致 + 已审核**的排最前 —— 加入后只要重新审核就能用；
 *      单成员组也在这一档（加入即凑够 2 人），不该被排到「单位不一致」之后；
 *   2. 其次：单位一致、待审核；
 *   3. 再次：单位一致、其它状态；
 *   4. 最后：单位不一致的（只能当参考）。
 *   同档内成员数多的优先，最后按名称稳定排序。
 */
export function sortRecommendations(
  candidates: RecommendationCandidate[],
): RecommendationCandidate[] {
  const rank = (candidate: RecommendationCandidate) => {
    if (!candidate.sameUnit) return 3
    if (candidate.status === 'APPROVED') return 0
    if (candidate.status === 'PENDING_REVIEW') return 1
    return 2
  }

  return [...candidates].sort((left, right) => {
    const rankDiff = rank(left) - rank(right)
    if (rankDiff !== 0) return rankDiff
    if (left.memberCount !== right.memberCount) {
      return right.memberCount - left.memberCount
    }
    return left.name.localeCompare(right.name)
  })
}

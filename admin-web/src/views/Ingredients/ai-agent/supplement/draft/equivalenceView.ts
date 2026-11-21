import type { EquivalenceGroupMember } from '@/api/supplementEquivalence'

/** 成员按「0 最前」排；同优先级按名称，避免顺序看起来随机。 */
export function sortGroupMembers(
  members: readonly EquivalenceGroupMember[]
): EquivalenceGroupMember[] {
  return [...members].sort(
    (left, right) =>
      left.equivalencePriority - right.equivalencePriority ||
      left.name.localeCompare(right.name, 'zh-Hans-CN')
  )
}

export function concentrationStatusLabel(
  status: EquivalenceGroupMember['concentrationStatus']
): string {
  switch (status) {
    case 'OK':
      return '可用'
    case 'MISSING':
      return '缺浓度'
    case 'UNIT_MISMATCH':
      return '单位不一致'
    default:
      return status
  }
}

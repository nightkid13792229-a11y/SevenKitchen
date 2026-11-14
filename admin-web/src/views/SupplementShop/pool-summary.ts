/**
 * 等价组详情里的两个口径（2026-11-15）。
 *
 * 生产池 = 开了「用于采购/生产」的成员（最多 2 个，允许过渡期）；
 * 预分装池 = 已上架的成员。两者独立，重合是常态、不重合是例外。
 */
export interface PoolMemberLike {
  name: string
  procurementEnabled?: boolean | null
  supplementRetailEnabled?: boolean | null
}

export interface PoolSummary {
  production: string[]
  repack: string[]
}

export function summarizePools(members: PoolMemberLike[]): PoolSummary {
  const list = members || []
  return {
    production: list
      .filter((member) => member.procurementEnabled === true)
      .map((member) => member.name),
    repack: list
      .filter((member) => member.supplementRetailEnabled === true)
      .map((member) => member.name),
  }
}

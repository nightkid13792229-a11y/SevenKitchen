/**
 * 补剂下单的两个小工具。
 *
 * 放在这里而不是页面里，是因为它们各有一个必须锁死的规则：
 *   · 金额要和后端按"分"对齐，不能出现 0.30000000000000004 这种比较
 *   · 幂等键要在"一次提交流程"里稳定复用，重试才能只建一笔单
 */

/** 元 → 整数分。非有限数按 0 处理，绝不把 NaN 发给服务端。 */
export function toCents(amount: number): number {
  const value = Number(amount)
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100)
}

/**
 * 一次提交流程的幂等键。
 *
 * 不用 crypto.randomUUID：小程序基础库不一定有，而这里只需要"同一流程内唯一"。
 * 时间戳 + 随机串已经足够，服务端还有唯一索引兜底。
 */
export function createRequestId(): string {
  const stamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `${stamp}-${random}`
}

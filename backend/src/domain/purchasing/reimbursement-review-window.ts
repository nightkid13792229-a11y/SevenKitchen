/**
 * 报销审核撤销窗口（2026-11-07）
 *
 * 已报销的单在 24 小时内可以撤销、回到待审核；过了这个窗口就只能人工处理。
 * 单独抽出来是为了能被单测直接覆盖，不和 service 的注入搅在一起。
 */

export const REVERT_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinRevertWindow(
  reviewedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!reviewedAt) {
    return false;
  }

  const reviewedTime = new Date(reviewedAt).getTime();
  if (!Number.isFinite(reviewedTime)) {
    return false;
  }

  const elapsed = now.getTime() - reviewedTime;
  if (elapsed < 0) {
    // 时间在未来：数据异常，按不允许处理，避免「永远可撤销」
    return false;
  }

  return elapsed <= REVERT_REVIEW_WINDOW_MS;
}

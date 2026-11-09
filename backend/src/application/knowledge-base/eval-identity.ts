/**
 * 测试身份（全库计划 Task 3）。
 *
 * 设计稿要求按 `createdBy='kb-eval-*'` 标记并排除测试流量，
 * 但草稿/会话的 `createdBy` 存的是 `User.id`（uuid），不可能以 `kb-eval-` 开头。
 * 修法：测试账号使用固定 id `kb-eval-staff`，于是 `createdBy` 天然带前缀，
 * `kb:usage` 的排除规则才成立。
 */

/** 固定测试账号 ID；不要用 uuid，否则标记失效。 */
export const EVAL_STAFF_ID = 'kb-eval-staff';

/** 固定测试账号的登录名（admin-login 按 nickname 查）。 */
export const EVAL_STAFF_NICKNAME = 'kb-eval-staff';

/** createdBy 是否属于测试流量。 */
export function isEvalCreatedBy(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('kb-eval-');
}

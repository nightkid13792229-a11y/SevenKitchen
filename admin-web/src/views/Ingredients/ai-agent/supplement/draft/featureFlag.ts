/**
 * 补剂草稿流程开关（构建时变量，默认关）。
 *
 * - 只有 `VITE_SUPPLEMENT_DRAFT_FLOW` 显式等于 `'true'` 才走新草稿流程；
 * - 未设置或任何其他值都回到旧的两段式流程，便于随时回滚；
 * - 后端对应开关 `SUPPLEMENT_DRAFT_FLOW`，两边保持同值。
 */
export function isSupplementDraftFlowEnabled(): boolean {
  return import.meta.env.VITE_SUPPLEMENT_DRAFT_FLOW === 'true'
}

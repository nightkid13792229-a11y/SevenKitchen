/**
 * 审核登记表（合作兽医的结论落在这里）。
 *
 * ── 为什么要单独一张表，而不是直接改条目的 reviewStatus ──────────
 *
 *   条目分散在 32 个数据文件里，一条一条改代码块既容易改错、diff 也吵。
 *   更重要的是**留痕**：谁在什么时候把哪条放行的，必须一眼查得到。
 *   所以约定：
 *     · 数据文件里的 `reviewStatus` 是"作者写的初始状态"（新条目一律 PENDING_REVIEW）
 *     · **只有这张表才是"审核通过"的唯一凭据** —— 由 `scripts/apply-knowledge-review.ts`
 *       读合作兽医填好的审核 CSV 生成，不手写。
 *     · 顾客侧检索认这张表（nutritionist 侧不受限，任何状态都能看到）。
 *
 * ── 怎么用 ─────────────────────────────────────────────────
 *
 *   1. 导出送审材料：`npx ts-node -r tsconfig-paths/register scripts/export-knowledge-review-packet.ts`
 *   2. 兽医在 CSV 的「审核结论（请填）」列填：通过 / 需修改 / 删除 / 拿不准
 *   3. 回填：`npx ts-node -r tsconfig-paths/register scripts/apply-knowledge-review.ts <填好的.csv>`
 *      （默认只预览，加 `--apply` 才真写这张表）
 *
 * ── 规矩 ───────────────────────────────────────────────────
 *
 *   · **不要手写这张表**：它由脚本生成，手写会让"审核人/日期"失去意义。
 *   · 只有 CSV 里明确写「通过」的条目才会出现在这里；「需修改」「拿不准」不入表，
 *     条目保持未审核状态（顾客侧依旧看不到）。
 *   · 每次回填都整表重写（以 CSV 为准），所以 CSV 是唯一事实来源。
 */

export interface KnowledgeApproval {
  /** 审核人（合作兽医或机构，来自 CSV 的 `--reviewer` 参数） */
  reviewer: string;
  /** 审核日期 YYYY-MM-DD */
  reviewedAt: string;
  /** 兽医的备注（可空） */
  note?: string;
}

/**
 * id → 审核记录。**初始为空**：一条都没审过，顾客侧拿不到任何条目。
 */
export const KNOWLEDGE_APPROVALS: Record<string, KnowledgeApproval> = {
  // 还没有任何条目通过审核（由 scripts/apply-knowledge-review.ts 生成）
};

/** 这条是否已通过审核（顾客侧的唯一凭据） */
export function isKnowledgeEntryApproved(id: string): boolean {
  return Boolean(KNOWLEDGE_APPROVALS[id]);
}

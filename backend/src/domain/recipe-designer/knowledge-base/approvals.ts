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
  "behav-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-009": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-010": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-011": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "behav-012": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-009": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-010": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-011": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-012": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-013": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-014": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-015": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "breed-016": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-009": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-010": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-011": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-012": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-013": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-014": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-015": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-016": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-017": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-018": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-019": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-020": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-021": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-022": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-023": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-024": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-025": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-026": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-027": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-028": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-029": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-030": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-031": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-032": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-033": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-034": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-035": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-036": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-037": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-038": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-039": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-040": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-041": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-042": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-043": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-044": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-045": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-046": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-047": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-048": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-049": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-050": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "clinical-051": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-009": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-010": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-011": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-012": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-013": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-014": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "immune-015": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-009": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-010": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-021": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-022": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-023": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-024": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-025": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-026": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-027": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-028": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-029": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-030": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-031": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-032": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-033": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-034": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-035": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-036": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-037": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-038": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-039": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-040": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-041": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-042": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-043": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-044": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-045": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-046": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-047": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-048": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-049": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-050": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-051": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-052": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-053": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-054": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-055": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-056": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-057": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-058": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-059": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-060": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-061": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "lab-062": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-009": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-010": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-011": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-012": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-013": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-014": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-015": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-016": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-017": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-018": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-019": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "nurse-020": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-009": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-010": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-011": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-012": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-013": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-014": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "prev-015": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-001": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-002": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-003": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-004": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-005": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-006": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-007": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
  "visit-008": { reviewer: "合作兽医（老板 2026-10-02 转达：全部通过）", reviewedAt: "2026-10-02", },
};

/** 这条是否已通过审核（顾客侧的唯一凭据） */
export function isKnowledgeEntryApproved(id: string): boolean {
  return Boolean(KNOWLEDGE_APPROVALS[id]);
}

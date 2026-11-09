/**
 * L0 数据完整性（全库计划 Task 4）。
 *
 * 纯函数，不碰 Prisma：计数比对、核心表存在性/页码白名单、节排序重复、锚点回源。
 * 计数真源是 `docs/knowledge-base/source-layer/_expected-counts.json`，
 * 不是脚本里的硬编码；改快照必须走 `kb:data-check --record` 并单独提交。
 */

export interface ExpectedCounts {
  documents: number;
  paragraphs: number;
  tables: number;
  figures: number;
  capturedAt: string;
  commit: string;
}

const NUMERIC_KEYS = ['documents', 'paragraphs', 'tables', 'figures'] as const;

/** 只比四个数字；capturedAt/commit 是元数据，不参与比较。 */
export function checkCounts(
  actual: ExpectedCounts,
  expected: ExpectedCounts,
): { ok: boolean; mismatches: string[] } {
  const mismatches = NUMERIC_KEYS.filter(
    (key) => actual[key] !== expected[key],
  ).map((key) => `${key}: 实际 ${actual[key]}，快照 ${expected[key]}`);
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * 核心表检查：
 * - missing：快照要求存在、但库里没有的表；
 * - pageNoViolations：页码为 null、却不在白名单里的表。
 */
export function checkTableIds(
  rows: { id: string; pageNo: number | null }[],
  expectedIds: string[],
  allowNullPageNo: string[] = [],
): { ok: boolean; missing: string[]; pageNoViolations: string[] } {
  const present = new Set(rows.map((row) => row.id));
  const allowed = new Set(allowNullPageNo);
  const missing = expectedIds.filter((id) => !present.has(id));
  const pageNoViolations = rows
    .filter((row) => row.pageNo === null && !allowed.has(row.id))
    .map((row) => row.id);
  return {
    ok: missing.length === 0 && pageNoViolations.length === 0,
    missing,
    pageNoViolations,
  };
}

/** 同一文档内 sortOrder 重复 = 节顺序不稳定，会导致目录与页码错位。 */
export function findDuplicateSectionOrder(
  rows: { documentId: string; sortOrder: number }[],
): string[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.documentId}#${row.sortOrder}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

/** 锚点必须至少引用一个真实存在的段落；引用空了也算坏锚点。 */
export function checkAnchors(
  anchors: { id: string; paragraphIds: string[] }[],
  existingParagraphIds: Set<string>,
): { ok: boolean; missingAnchors: string[] } {
  const missingAnchors = anchors
    .filter(
      (anchor) =>
        anchor.paragraphIds.length === 0 ||
        anchor.paragraphIds.some((id) => !existingParagraphIds.has(id)),
    )
    .map((anchor) => anchor.id);
  return { ok: missingAnchors.length === 0, missingAnchors };
}

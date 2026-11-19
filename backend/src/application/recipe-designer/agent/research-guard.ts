/**
 * 知识库检索的“零命中/重复查询”守卫（2026-11-20）。
 *
 * 线上实测：一次方案运行里 `kb_find` 53 次，其中 34 次 0 命中；
 * 最后 7 次是同一个 0 命中查询反复打，直到撞工具上限。
 *
 * 这里只做确定性判断，不替模型决定“方案够不够”：
 *   · 同一条查询之前已经 0 命中 → 不再执行，让模型换词；
 *   · 连续 0 命中次数用于提示/暂停，不用来强制交方案。
 */
import type { ToolOutcome } from './agent-types';

/** 把一次 kb_find 的参数压成稳定 key；没有 query 时返回 null。 */
export function findQueryKey(args: unknown): string | null {
  if (!isRecord(args)) return null;
  const query =
    typeof args.query === 'string'
      ? args.query
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  if (!query) return null;
  const collections = Array.isArray(args.collections)
    ? [...args.collections].map(String).sort().join(',')
    : '';
  const documentIds = Array.isArray(args.documentIds)
    ? [...args.documentIds].map(String).sort().join(',')
    : '';
  return `${query}|${collections}|${documentIds}`;
}

/** 成功结果里 hits 的条数；不是 kb_find / 不是成功结果时返回 null。 */
export function countFindHits(outcome: ToolOutcome): number | null {
  if (!outcome.ok) return null;
  const data = outcome.data;
  if (!isRecord(data)) return null;
  return Array.isArray(data.hits) ? data.hits.length : null;
}

/** 连续 0 命中的计数：命中就归零，不命中就 +1。 */
export function nextZeroHitStreak(
  current: number,
  hits: number | null,
): number {
  if (hits === null) return current;
  return hits === 0 ? current + 1 : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

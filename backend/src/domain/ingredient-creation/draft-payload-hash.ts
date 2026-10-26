import { createHash } from 'node:crypto';

/**
 * 草稿 payload 的内容哈希。
 *
 * 用途：核验报告落库时记下「当时检查的是哪一份内容」，授权 / 页面刷新时拿当前
 * 草稿再算一次，相等才算报告仍然新鲜。**不能用 `updatedAt` 代替**：同一毫秒内
 * 的两次改动时间戳可能一样，旧报告会被当成新的（设计 M1）。
 *
 * 为了保证「内容一样 → 哈希一样」，必须先做一次规范化：
 * - 对象键递归排序（数据库 JSONB 不保证键顺序，键序不该影响结果）；
 * - 值为 `undefined` 的键整条丢弃——「传了 undefined」与「没传这个键」在
 *   JSON 落库后本来就不分，哈希也不该区分；
 * - 数组保持原顺序（标签、证据行的顺序是有意义的）。
 *
 * 规范化后再 `JSON.stringify` + SHA-256，输出 64 位小写十六进制。
 * 纯函数：不改写入参，不读任何外部状态，同一输入永远得到同一结果。
 */

/** 规范化后的值；对象只保留键有序、值非 undefined 的部分。 */
function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    // 数组元素按原顺序逐个规范化；undefined 元素交给 JSON.stringify 变 null，
    // 不在这里删元素——删元素会让后续元素前移，反而破坏「顺序敏感」。
    return value.map((item) => canonicalize(item));
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const normalized = canonicalize(record[key]);
      if (normalized === undefined) {
        continue;
      }
      ordered[key] = normalized;
    }
    return ordered;
  }

  return value;
}

/**
 * 把 payload 变成稳定的 JSON 文本。
 *
 * 顶层是 `undefined` 时 `JSON.stringify` 返回 `undefined` 而不是字符串，
 * 这里回退成 `"null"`，保证哈希函数永远能输出一个确定的值。
 */
function stableStringifyDraftPayload(payload: unknown): string {
  return JSON.stringify(canonicalize(payload)) ?? 'null';
}

/** 草稿 payload 的 SHA-256（hex）：只由内容决定，与键顺序、运行环境无关。 */
export function hashDraftPayload(payload: unknown): string {
  return createHash('sha256')
    .update(stableStringifyDraftPayload(payload))
    .digest('hex');
}

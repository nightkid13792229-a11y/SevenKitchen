/**
 * 补货草稿的清理口径（2026-11-11）
 *
 * 草稿对用户不可见（列表过滤 isDraft），点开「手填记一笔 / 截图记一笔」又退出，
 * 就会在库里留一条 PENDING + isDraft 的空壳。它不影响业务，但会污染统计
 * （工作台采购角标曾经把它们算成待采购），所以要有节奏地清掉。
 *
 * 两档口径：
 *  - 空草稿：0 个明细、识别行里一条商品也没有 → 2 小时就清；
 *  - 有内容的草稿：48 小时兜底，避免误删还在填的记录。
 *
 * 抽成纯函数是为了让守门人测试不必拉起 uuid 那套实体依赖。
 */

/** 有内容的草稿保留 48 小时 */
export const STALE_DRAFT_TTL_MS = 48 * 60 * 60 * 1000;
/** 一个字都没填的空草稿保留 2 小时 */
export const EMPTY_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

export function buildStaleDraftWhere(now: number) {
  return {
    isDraft: true,
    status: 'PENDING' as const,
    OR: [
      { createdAt: { lt: new Date(now - STALE_DRAFT_TTL_MS) } },
      {
        createdAt: { lt: new Date(now - EMPTY_DRAFT_TTL_MS) },
        itemCount: 0,
        items: { none: {} },
        orderImports: { none: { lines: { some: {} } } },
      },
    ],
  };
}

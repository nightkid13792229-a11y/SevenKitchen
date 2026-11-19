/**
 * 支出类别字典的查询/解析（2026-11-19 报表改用类别字典）。
 *
 * 报表读类别**当前名字**（改名影响历史），所以取数时一次性把整张
 * `finance_category` 读进内存再解析，而不是每条记录回查：
 * - `byId`：账单 / 手工 / 报销等用户录入的 `categoryId`；
 * - `byCode`：自动来源（采购行、快递、手续费）按 `code` 找系统类别，
 *   老板把「食材」改名后仍能命中同一个系统类别；
 * - `byName`：报销杂费按名字兜底（种子缺失时由类别服务 ensureByName 补）。
 *
 * 类别表很小（种子十几个 + 自建少量），整表读取比 N 次 join/查询更简单。
 */

export type FinanceCategoryOption = {
  id: string;
  name: string;
  /** 仅历史枚举映射用；老板自建类别为空 */
  code: string | null;
};

export type FinanceCategoryLookup = {
  byId: Map<string, FinanceCategoryOption>;
  byCode: Map<string, FinanceCategoryOption>;
  byName: Map<string, FinanceCategoryOption>;
};

/** 没有 `categoryId` / 找不到类别时的显示名（不把金额丢掉） */
export const UNCATEGORIZED_LABEL = '未分类';

export function buildFinanceCategoryLookup(
  rows: readonly FinanceCategoryOption[],
): FinanceCategoryLookup {
  const byId = new Map<string, FinanceCategoryOption>();
  const byCode = new Map<string, FinanceCategoryOption>();
  const byName = new Map<string, FinanceCategoryOption>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.code) byCode.set(row.code, row);
    byName.set(row.name.trim().toLowerCase(), row);
  }
  return { byId, byCode, byName };
}

/** 类别 id → 当前名字；空 id 或查不到时统一「未分类」 */
export function categoryLabelById(
  lookup: FinanceCategoryLookup,
  categoryId: string | null | undefined,
): string {
  if (!categoryId) return UNCATEGORIZED_LABEL;
  return lookup.byId.get(categoryId)?.name ?? UNCATEGORIZED_LABEL;
}

/**
 * 明细行 → `{ categoryId, label }`。
 *
 * 用户录入的行带 `categoryId`（按 id 分组）；自动来源的行带 `categoryCode`
 * （按 code 找系统类别，改名不影响归属）。两条都没有时归入「未分类」。
 */
export function resolveLineCategory(
  line: { categoryId?: string | null; categoryCode?: string | null },
  lookup: FinanceCategoryLookup,
): { categoryId: string | null; label: string } {
  if (line.categoryId) {
    return {
      categoryId: line.categoryId,
      label: categoryLabelById(lookup, line.categoryId),
    };
  }
  if (line.categoryCode) {
    const hit = lookup.byCode.get(line.categoryCode);
    return {
      categoryId: hit?.id ?? null,
      label: hit?.name ?? line.categoryCode,
    };
  }
  return { categoryId: null, label: UNCATEGORIZED_LABEL };
}

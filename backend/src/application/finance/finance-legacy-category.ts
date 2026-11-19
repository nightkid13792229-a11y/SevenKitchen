import { FinanceExpenseCategory as PrismaFinanceExpenseCategory } from '@prisma/client';
import type { FinanceExpenseCategory } from './finance-categories';

/**
 * 旧枚举列 `category` 的白名单（2026-11-19 类别字典上线后的兼容层）。
 *
 * 账单/模板/手工条目都新写入 `categoryId`，但旧枚举列还保留一版兼容。
 * 类别字典允许 `code` 长成 `TOOLS` / `SUNDRIES`（报销杂费的引擎类别），
 * 它们**不在** Prisma 的 `FinanceExpenseCategory` 里；直接回填会让 Prisma
 * 校验失败、接口 500。所以只有真实枚举值才写，其余按旧列是否必填：
 * - 模板 / 账单（旧列非空）→ 兜底 `OTHER`；
 * - 手工条目（旧列可空）→ 留 `NULL`。
 */

/** Prisma 枚举的真实取值；运行时对象就是唯一真源，不手抄一份 */
const LEGACY_CATEGORY_CODES = new Set<string>(
  Object.values(PrismaFinanceExpenseCategory),
);

/** 枚举外的 code 返回 null（只用于可空列） */
export function toLegacyExpenseCategory(
  code: string | null | undefined,
): FinanceExpenseCategory | null {
  if (!code) return null;
  return LEGACY_CATEGORY_CODES.has(code)
    ? (code as FinanceExpenseCategory)
    : null;
}

/** 旧列非空时用：枚举外的 code 兜底 `OTHER` */
export function toLegacyExpenseCategoryOrOther(
  code: string | null | undefined,
): FinanceExpenseCategory {
  return toLegacyExpenseCategory(code) ?? 'OTHER';
}

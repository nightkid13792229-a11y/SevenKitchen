/**
 * 多份定制 · 确认页展示与选择规则（2026-10-20）
 *
 * 这里只放**纯函数**：金额格式化、每份均价、份数上限、肉类选择规则。
 * 不碰 uni API、不发请求，可以在 node 环境直接单测。
 *
 * ⚠️ 金额的唯一来源是后端 `/custom-recipe/quote`：
 *   · `formatDiscountRate` / `perRecipeAverage` 只负责把后端报价**展示**出来；
 *   · 页面绝不能用 `feeAmount × quantity` 自己算应付金额；
 *   · 报价失败时页面必须挡住提交，而不是退回前端数学。
 */

import type { CustomRecipeQuote } from '../api/custom-recipe';

/** 业务硬上限：单笔最多 5 份，后台只能在 1–5 之间调低 */
export const MAX_RECIPE_QUANTITY = 5;
/** 单笔最少 1 份 */
export const MIN_RECIPE_QUANTITY = 1;

/**
 * 主蛋白选项（2026-10-20 本期固定六种，不含鱼）。
 *
 * 设计文档要求肉类字典由后台维护；本期任务明确先在前端固定这六项，
 * 后台可配置字典属于后续任务，不在这里扩展。
 */
export const PROTEIN_OPTIONS = [
  { code: 'CHICKEN', label: '鸡' },
  { code: 'DUCK', label: '鸭' },
  { code: 'PORK', label: '猪' },
  { code: 'BEEF', label: '牛' },
  { code: 'TURKEY', label: '火鸡' },
  { code: 'RABBIT', label: '兔' },
] as const;

export type ProteinCode = (typeof PROTEIN_OPTIONS)[number]['code'];
/** 营养师配 = 不指定；自己选 = 必须恰好选满 recipeQuantity 种 */
export type ProteinChoiceMode = 'DIETITIAN' | 'SELF';

const PROTEIN_CODES = new Set<string>(
  PROTEIN_OPTIONS.map((option) => option.code),
);

/**
 * 把后台配置的最多份数收进 1–5。
 *
 * 坏配置不能变成「还能买 5 份」：缺失或非数字时退回硬上限，
 * 小于 1 时收成 1，大于 5 时收成 5。后端仍会再校验一次。
 */
export function resolveMaxRecipeQuantity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MAX_RECIPE_QUANTITY;
  return Math.min(
    MAX_RECIPE_QUANTITY,
    Math.max(MIN_RECIPE_QUANTITY, Math.floor(parsed)),
  );
}

/** 折扣率 0.08 →「8%」；没有优惠时返回「无优惠」 */
export function formatDiscountRate(rate: unknown): string {
  const value = Number(rate ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '无优惠';
  const percent = Math.round(value * 1000) / 10;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

/**
 * 每份均价 = 后端应付金额 ÷ 份数（展示到分）。
 *
 * 仍然只做展示：应付金额本身来自 quote.payableAmount，不重新定价。
 */
export function perRecipeAverage(
  quote: CustomRecipeQuote | null | undefined,
): number {
  const quantity = Number(quote?.quantity);
  const payableAmount = Number(quote?.payableAmount);
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(payableAmount)
  ) {
    return 0;
  }
  return Math.round((payableAmount / quantity) * 100) / 100;
}

/** 去重、去空、只保留六种合法肉类，保持顾客选择顺序 */
function sanitizeProteinCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of codes) {
    const code = String(raw ?? '').trim().toUpperCase();
    if (!PROTEIN_CODES.has(code) || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

function normalizeQuantityLimit(quantity: unknown): number {
  const parsed = Math.floor(Number(quantity));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(MAX_RECIPE_QUANTITY, parsed);
}

/**
 * 份数变化时裁掉多出来的肉类。
 *
 * 只裁「超出新份数」的部分；返回 dropped 让页面能提示顾客
 * 「份数减少，已取消 N 种选择」，而不是静默改掉他的勾选。
 */
export function trimProteinCodesForQuantity(
  codes: unknown,
  quantity: unknown,
): { codes: string[]; dropped: number } {
  const valid = sanitizeProteinCodes(codes);
  const limit = normalizeQuantityLimit(quantity);
  const kept = valid.slice(0, limit);
  return { codes: kept, dropped: valid.length - kept.length };
}

/**
 * 点选/取消一种肉。
 *
 * 同一种肉不能重复选；已选满当前份数时返回 limitReached，
 * 由页面提示「先取消一种再换」，而不是让选择数量超过份数。
 */
export function toggleProteinCode(
  codes: unknown,
  code: string,
  quantity: unknown,
): { codes: string[]; limitReached: boolean } {
  const current = sanitizeProteinCodes(codes);
  const normalizedCode = String(code ?? '').trim().toUpperCase();
  if (!PROTEIN_CODES.has(normalizedCode)) {
    return { codes: current, limitReached: false };
  }
  if (current.includes(normalizedCode)) {
    return {
      codes: current.filter((item) => item !== normalizedCode),
      limitReached: false,
    };
  }
  const limit = normalizeQuantityLimit(quantity);
  if (limit <= 0 || current.length >= limit) {
    return { codes: current, limitReached: true };
  }
  return { codes: [...current, normalizedCode], limitReached: false };
}

/**
 * 提交前的肉类选择校验；返回空字符串表示可以提交。
 *
 * 规则（设计文档 4.2 / 10）：
 *   · 营养师配：不需要选，返回空；
 *   · 自己选：数量必须恰好等于份数，不重复、不出现未知编码。
 */
export function getProteinSelectionError(
  mode: ProteinChoiceMode,
  codes: unknown,
  quantity: unknown,
): string {
  if (mode !== 'SELF') return '';

  const required = Math.max(1, normalizeQuantityLimit(quantity));
  const selected = sanitizeProteinCodes(codes);
  const rawCount = Array.isArray(codes) ? codes.filter(Boolean).length : 0;

  if (rawCount !== selected.length) {
    return '主蛋白选项不正确，请重新选择';
  }
  if (selected.length > required) {
    return `最多选择 ${required} 种不同主蛋白`;
  }
  if (selected.length < required) {
    return `请选择 ${required} 种不同主蛋白，还差 ${
      required - selected.length
    } 种`;
  }
  return '';
}

/**
 * 实际提交给后端的肉类偏好。
 *
 * 营养师配一律提交空数组（不是省略字段），让后端明确知道
 * 「顾客没有指定」；只有自己选且数量正确时才带具体编码。
 */
export function resolveRequestedProteinCodes(
  mode: ProteinChoiceMode,
  codes: unknown,
  quantity: unknown,
): string[] {
  if (mode !== 'SELF') return [];
  return trimProteinCodesForQuantity(codes, quantity).codes;
}

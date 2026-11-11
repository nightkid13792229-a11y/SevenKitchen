/**
 * 「一箱 = 几层 × 每件多少」的规格链（2026-11-09）。
 *
 * 老表单只有「件数」和「每件重量」两格，遇到盒马鸡蛋「30枚 1.59kg」
 * 只能把整盒的 1590 克当成一枚的重量，30 × 1590 = 47.7 公斤一盒鸡蛋。
 *
 * 现在表单收一条链：每一层是「数量 + 单位」，最后一层是基准单位
 * （克 / 毫升 / 个）。页面只负责画，连乘和文案都放这里，单测钉死。
 */

import { MULTIPACK_UNITS } from './procurement-sku-multipack';

export interface SpecLinkInput {
  /** 输入框里的原文，不预先转数字：空着要标红，不能默认 1 */
  count: string;
  unit: string;
}

const toPositiveInteger = (text: string): number | null => {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
};

/**
 * 件数连乘；只要有一层没填好就返回 null（表单据此标红、挡住保存）。
 */
export function multiplySpecLinks(
  links: SpecLinkInput[] | null | undefined,
): number | null {
  let product = 1;
  for (const link of links ?? []) {
    const count = toPositiveInteger(link.count);
    if (count === null) return null;
    product *= count;
  }
  return product;
}

/** 一层里数量或单位没填的，返回它的下标（-1 = 都填好了） */
export function firstIncompleteLinkIndex(
  links: SpecLinkInput[] | null | undefined,
): number {
  const list = links ?? [];
  for (let index = 0; index < list.length; index += 1) {
    const link = list[index];
    if (toPositiveInteger(link.count) === null || !link.unit?.trim()) {
      return index;
    }
  }
  return -1;
}

/** 一采购单位合计 = 件数连乘 × 最后一层的基准数量 */
export function computeSpecRatio(input: {
  links: SpecLinkInput[];
  amountText: string;
}): number {
  const packCount = multiplySpecLinks(input.links);
  const amount = Number(String(input.amountText ?? '').trim());
  if (packCount === null || !Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  // 只抹掉浮点尾巴（0.1 + 0.2 那类），不改业务精度
  return Math.round(packCount * amount * 100) / 100;
}

/** 「30 枚 × 53 克」，给页面回显用 */
export function formatSpecChain(input: {
  links: SpecLinkInput[];
  amountText: string;
  baseUnitText: string;
}): string {
  const parts = (input.links ?? []).map(
    (link) => `${(link.count || '?').trim()} ${(link.unit || '件').trim()}`,
  );
  parts.push(`${(input.amountText || '?').trim()} ${input.baseUnitText}`);
  return parts.join(' × ');
}

/**
 * 算出来的合计和包装上印的总重对不上（员工改了件数/重量，或 AI 两处读数矛盾）。
 *
 * 这条必须实时存在：员工一改数字，原来的"折算，请核对"就不该再假装没事。
 */
export function isTotalMismatch(input: {
  ratio: number;
  printedTotalInBase: number | null;
}): boolean {
  const { ratio, printedTotalInBase } = input;
  if (!printedTotalInBase || printedTotalInBase <= 0 || ratio <= 0) {
    return false;
  }
  const diff = Math.abs(ratio - printedTotalInBase);
  return diff > 0.5 && diff / Math.max(ratio, printedTotalInBase) > 0.01;
}

/**
 * 箱/桶/提/件这类"整件"单位，一层都没填时必须提醒补一层：
 * 少填这一层会按 1 件算，库存和成本静默差 N 倍。
 *
 * 员工确认"这件确实只有一件"（confirmedSingle）后不再拦。
 */
export function needsInnerLayer(input: {
  purchaseUnit: string;
  linkCount: number;
  confirmedSingle: boolean;
}): boolean {
  if (!MULTIPACK_UNITS.includes(input.purchaseUnit)) return false;
  if (input.linkCount > 0) return false;
  return !input.confirmedSingle;
}

/**
 * 单位芯片的可见性（2026-11-11）。
 *
 * 和渠道那条规则一模一样（`withSelectedChannel`）：默认只显示前几个，
 * 但**当前选中的单位必须留在可见区**。否则 AI 填了「份」（排第 7），
 * 芯片行一个都不亮，员工以为没选，随手点「袋」—— 5000 克就挂到了袋上。
 */
export function withSelectedUnit(
  list: string[] | null | undefined,
  selected: string | null | undefined,
  limit = 5,
): string[] {
  const head = (Array.isArray(list) ? list : []).slice(0, Math.max(1, limit));
  const value = typeof selected === 'string' ? selected.trim() : '';
  if (!value || head.includes(value)) return head;
  return [value, ...head.slice(0, Math.max(0, limit - 1))];
}

/**
 * 进页面时的默认采购单位。
 *
 * 只有 AI 明确给出**且**在字典里才预填；否则留空。
 * 改造前这里写死"有袋就选袋"，于是 AI 读出「提」被静默丢弃后，
 * 表单看起来像"这个商品本来就是袋装"，账目差 10 倍也没人知道。
 */
export function initialPurchaseUnit(
  draft: { purchaseUnit?: string | null } | null | undefined,
  allowed: string[] = [],
): string {
  const value = typeof draft?.purchaseUnit === 'string' ? draft.purchaseUnit.trim() : '';
  if (!value) return '';
  return allowed.includes(value) ? value : '';
}

/** 这个单位在不在当前可选项里（提交/预填前用） */
export function isUnitAllowed(
  options: Array<{ code: string }> | null | undefined,
  unit: string | null | undefined,
): boolean {
  const value = typeof unit === 'string' ? unit.trim() : '';
  if (!value) return false;
  return (Array.isArray(options) ? options : []).some((item) => item.code === value);
}
